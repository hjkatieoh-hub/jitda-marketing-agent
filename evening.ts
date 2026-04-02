// agents/influencer/evening.ts
// 오후 19:00 실행 — DM 발송 · 응답 체크 · 쿠폰 발급

import * as dotenv from 'dotenv'
dotenv.config()

import { jitdaConfig } from '../../config/brands'
import {
  getTodayFollowedForDM,
  saveDmLog,
  updateInfluencerStatus,
  issueCoupon,
  getPendingReplies,
} from '../../lib/supabase'
import {
  generateDmMessage,
  generateCouponMessage,
} from '../../lib/scoring'
import {
  sendDailyReport,
  sendErrorAlert,
  sendRateLimitAlert,
  type DailyReport,
} from '../../lib/telegram'
import { randomDelay, isRateLimitError } from '../../lib/utils'

const PHASE = parseInt(process.env.AGENT_PHASE ?? '1')

// ─── 메인 ─────────────────────────────────────────────

async function main() {
  const config = jitdaConfig
  const report: DailyReport = {
    date: new Date().toLocaleDateString('ko-KR'),
    explored: 0,
    qualified: 0,
    avgScore: 0,
    followed: 0,
    liked: 0,
    commented: 0,
    dmSent: 0,
    templateBreakdown: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    replied: 0,
    replyRate: 0,
    couponIssued: 0,
    errors: [],
  }

  console.log('🌆 저녁 세션 시작')

  try {

    // ─── STEP 1: DM 발송 ────────────────────────────

    let dmTargets: any[] = []

    if (PHASE === 1) {
      // 오전에 저장된 승인된 목록 로드
      dmTargets = await loadPendingDMs()
      console.log(`📋 승인된 DM 대상: ${dmTargets.length}개`)
    } else {
      // Phase 2: 자동으로 DB에서 조회
      dmTargets = await getTodayFollowedForDM(
        config.supabaseBrandId,
        config.dm.sendAfterDays,
        config.dm.targetType
      )
      console.log(`📋 DM 대상 (자동): ${dmTargets.length}개`)
    }

    const dmLimit = Math.min(dmTargets.length, config.limits.dm)

    for (let i = 0; i < dmLimit; i++) {
      const target = dmTargets[i]

      try {
        // 커스텀 메시지 (오전 컨펌에서 수정된 경우) 또는 자동 생성
        const message = target._customMessage
          ?? generateDmMessage(target.username, target.templateType, config.dm.serviceUrl)

        await sendDm(target.username, message)

        await saveDmLog({
          influencer_id: target.id,
          template_type: target.templateType,
          message,
          send_hour: new Date().getHours(),
          replied: false,
          coupon_sent: false,
          status: 'sent',
        })

        await updateInfluencerStatus(target.id, 'contacted')

        report.dmSent++
        report.templateBreakdown[target.templateType] = (report.templateBreakdown[target.templateType] ?? 0) + 1

        console.log(`📩 DM 발송: @${target.username} [${target.templateType}]`)

        await randomDelay(config.delays.dmMin, config.delays.dmMax)

      } catch (e: any) {
        if (isRateLimitError(e)) {
          await sendRateLimitAlert()
          return
        }
        report.errors.push(`DM 실패: @${target.username}`)
        console.log(`⚠️ DM 실패 (skip): @${target.username}`)
      }
    }

    // ─── STEP 2: 응답 체크 ──────────────────────────

    const pendingReplies = await getPendingReplies(3)
    console.log(`🔍 응답 체크 대상: ${pendingReplies.length}개`)

    for (const log of pendingReplies) {
      try {
        const replyStatus = await checkDmReply(log.influencers?.username)

        if (replyStatus === 'positive') {
          // 긍정 응답 → 쿠폰 발송
          const couponMsg = generateCouponMessage(
            log.influencers?.username,
            config.dm.couponCode,
            config.dm.couponExpiryDays,
            config.dm.serviceUrl
          )
          await sendDm(log.influencers?.username, couponMsg)

          // DB 업데이트
          await updateInfluencerStatus(log.influencer_id, 'responded')
          await issueCoupon(
            config.supabaseBrandId,
            log.influencer_id,
            config.dm.couponCode,
            config.dm.couponExpiryDays
          )

          // dm_logs 업데이트
          await updateDmLogCoupon(log.id)

          report.replied++
          report.couponIssued++
          console.log(`🎁 쿠폰 발급: @${log.influencers?.username}`)

        } else if (replyStatus === 'negative') {
          await updateInfluencerStatus(log.influencer_id, 'declined')
          report.replied++
        }

      } catch (e) {
        // skip & continue
      }
    }

    // 응답률 계산
    const totalSent = await getTotalDmSentCount(config.supabaseBrandId)
    report.replyRate = totalSent > 0 ? (report.replied / totalSent) * 100 : 0

    // ─── STEP 3: 3일 무응답 처리 ───────────────────

    await markNoReply(config.supabaseBrandId)

    // ─── STEP 4: 일일 리포트 ────────────────────────

    await sendDailyReport(report)
    console.log('✅ 저녁 세션 완료')

  } catch (e: any) {
    await sendErrorAlert(`저녁 세션 오류: ${e.message}`)
    throw e
  }
}

// ─── 오픈클로에 위임할 브라우저 작업들 ─────────────────

async function sendDm(username: string, message: string): Promise<void> {
  console.log(`📤 DM 발송 → @${username}`)
  // 오픈클로: DM 수신함 → 새 DM → username 검색 → 메시지 입력 → 발송
}

async function checkDmReply(
  username: string
): Promise<'positive' | 'negative' | 'none'> {
  console.log(`👀 응답 체크: @${username}`)
  // 오픈클로: DM 수신함 → 해당 계정 대화 확인
  // 긍정 키워드: 어떻게, 링크, 감사, 해볼게요, 알려주세요, 체험, 궁금
  // 부정 키워드: 괜찮아요, 필요없어요, 누구세요, 스팸
  return 'none' // placeholder
}

async function loadPendingDMs(): Promise<any[]> {
  try {
    const fs = await import('fs/promises')
    const data = await fs.readFile('/tmp/jitda_pending_dms.json', 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function updateDmLogCoupon(logId: string): Promise<void> {
  const { supabase } = await import('../../lib/supabase')
  await supabase.from('dm_logs').update({
    replied: true,
    replied_at: new Date().toISOString(),
    coupon_sent: true,
    coupon_sent_at: new Date().toISOString(),
  }).eq('id', logId)
}

async function getTotalDmSentCount(brandId: string): Promise<number> {
  const { supabase } = await import('../../lib/supabase')
  const { count } = await supabase
    .from('dm_logs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sent')
  return count ?? 0
}

async function markNoReply(brandId: string): Promise<void> {
  const { supabase } = await import('../../lib/supabase')
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 3)

  await supabase
    .from('influencers')
    .update({ status: 'no_reply' })
    .eq('brand_id', brandId)
    .eq('status', 'contacted')
    .lt('created_at', cutoff.toISOString())
}

main().catch(console.error)
