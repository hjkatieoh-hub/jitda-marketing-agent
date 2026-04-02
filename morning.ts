// agents/influencer/morning.ts
// 오전 09:00 실행 — 탐색 · 워밍업 · Phase 1 컨펌 요청

import * as dotenv from 'dotenv'
dotenv.config()

import { jitdaConfig } from '../../config/brands'
import {
  getExistingUsernames,
  saveInfluencer,
} from '../../lib/supabase'
import {
  scoreAccount,
  generateDmMessage,
  type CandidateAccount,
  type ScoredAccount,
} from '../../lib/scoring'
import {
  sendConfirmRequest,
  sendDailyReport,
  sendErrorAlert,
  sendRateLimitAlert,
  waitForConfirm,
  parseConfirmReply,
  type ConfirmItem,
  type DailyReport,
} from '../../lib/telegram'
import { randomDelay, isRateLimitError } from '../../lib/utils'

// ─── 운영 모드 ────────────────────────────────────────
// PHASE=1 → 컨펌 요청 후 대기
// PHASE=2 → 완전 자동
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
    templateBreakdown: {},
    replied: 0,
    replyRate: 0,
    couponIssued: 0,
    errors: [],
  }

  console.log('🌅 오전 세션 시작')

  try {
    // ① 기존 계정 로드
    const existingUsernames = await getExistingUsernames(config.supabaseBrandId)
    console.log(`기존 컨택 계정: ${existingUsernames.size}개`)

    // ② 해시태그 탐색 (오픈클로가 실제 인스타 브라우저 제어)
    const candidates = await exploreHashtags(config)
    report.explored = candidates.length
    console.log(`탐색된 후보: ${candidates.length}개`)

    // ③ 스코어링 + 필터링
    const scored = candidates
      .map(c => scoreAccount(c, config, existingUsernames))
      .filter((c): c is ScoredAccount => c !== null)
      .sort((a, b) => b.score - a.score)

    report.qualified = scored.length
    report.avgScore = scored.length > 0
      ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length)
      : 0

    console.log(`필터링 후 적합 계정: ${scored.length}개 (평균 ${report.avgScore}점)`)

    // ④ DM 대상 분리 (점수 70↑)
    const dmCandidates = scored.filter(c =>
      c.score >= config.targeting.scoreThresholdDM &&
      c.type === 'pregnancy'
    )

    // ⑤ Phase 1: 컨펌 요청 → 대기 → 승인된 것만 진행
    let approvedForDM: ScoredAccount[] = []

    if (PHASE === 1 && dmCandidates.length > 0) {
      const confirmItems: ConfirmItem[] = dmCandidates.slice(0, 20).map((c, i) => ({
        index: i + 1,
        username: c.username,
        followers: c.followers,
        er: c.engagementRate,
        score: c.score,
        hashtag: c.hashtag,
        templateType: c.templateType,
        messagePreview: generateDmMessage(c.username, c.templateType, config.dm.serviceUrl).slice(0, 30),
        fullMessage: generateDmMessage(c.username, c.templateType, config.dm.serviceUrl),
      }))

      await sendConfirmRequest(confirmItems)
      console.log('📨 컨펌 요청 발송. 응답 대기 중...')

      const reply = await waitForConfirm()
      const result = parseConfirmReply(reply, confirmItems.length)

      if (result.action === 'reject_all') {
        console.log('❌ 전체 거절됨')
        await sendDailyReport({ ...report, errors: ['DM 전체 거절'] })
        return
      }

      // 승인된 항목 필터링
      approvedForDM = confirmItems
        .filter(item => {
          if (result.action === 'approve_all') return true
          if (result.selected) return result.selected.includes(item.index)
          return !result.excluded.includes(item.index)
        })
        .map(item => {
          const candidate = dmCandidates[item.index - 1]
          // 수정된 메시지 반영
          if (result.modified[item.index]) {
            return { ...candidate, _customMessage: result.modified[item.index] } as any
          }
          return candidate
        })

      console.log(`✅ 승인된 DM 대상: ${approvedForDM.length}개`)
    } else if (PHASE === 2) {
      approvedForDM = dmCandidates.slice(0, config.limits.dm)
    }

    // ⑥ 팔로우 (워밍업 대상 전체)
    const followTargets = scored.slice(0, config.limits.follow)
    for (const account of followTargets) {
      try {
        await followAccount(account.username)
        await saveInfluencer({
          brand_id: config.supabaseBrandId,
          username: account.username,
          followers: account.followers,
          engagement_rate: account.engagementRate,
          score: account.score,
          type: account.type,
          status: 'warming',
          hashtag_source: account.hashtag,
          hashtag_volume: account.hashtagVolume,
          recent_post_days: account.recentPostDays,
          content_ratio: account.contentRatio,
          warmup_done: false,
        })
        report.followed++
        await randomDelay(config.delays.followMin, config.delays.followMax)
      } catch (e: any) {
        if (isRateLimitError(e)) {
          await sendRateLimitAlert()
          return
        }
        report.errors.push(`팔로우 실패: @${account.username}`)
      }
    }

    // ⑦ 좋아요
    for (const account of followTargets.slice(0, config.limits.like)) {
      try {
        await likeRecentPosts(account.username, 1)
        report.liked++
        await randomDelay(config.delays.likeMin, config.delays.likeMax)
      } catch (e) {
        // skip & continue
      }
    }

    // ⑧ 댓글
    const commentTargets = followTargets
      .filter(c => c.score >= 70)
      .slice(0, config.limits.comment)

    for (const account of commentTargets) {
      try {
        const comment = pickComment(account, config)
        await postComment(account.username, comment)
        report.commented++
        await randomDelay(config.delays.commentMin, config.delays.commentMax)
      } catch (e) {
        // skip & continue
      }
    }

    // ⑨ 리포트 (DM은 저녁 세션에서 처리)
    if (report.followed > 0) {
      report.topAccount = followTargets[0]
        ? { username: followTargets[0].username, score: followTargets[0].score }
        : undefined
    }

    // Phase 1에서 승인된 DM 목록을 저녁 세션에 전달
    if (PHASE === 1 && approvedForDM.length > 0) {
      await savePendingDMs(approvedForDM)
    }

    await sendDailyReport(report)
    console.log('✅ 오전 세션 완료')

  } catch (e: any) {
    await sendErrorAlert(`오전 세션 오류: ${e.message}`)
    throw e
  }
}

// ─── 오픈클로에 위임할 브라우저 작업들 ─────────────────
// 아래 함수들은 실제 실행 시 오픈클로 프롬프트로 대체됩니다.
// 지금은 인터페이스만 정의.

async function exploreHashtags(config: typeof jitdaConfig): Promise<CandidateAccount[]> {
  // 오픈클로가 인스타그램 브라우저를 열고:
  // 1. 해시태그 탐색 (mid 60% → low 30% → high 10%)
  // 2. 각 계정 프로필 수집
  // 3. CandidateAccount 형식으로 반환
  console.log('📱 인스타그램 해시태그 탐색 중...')
  return [] // placeholder
}

async function followAccount(username: string): Promise<void> {
  console.log(`👤 팔로우: @${username}`)
  // 오픈클로: 프로필 방문 → 팔로우 버튼 클릭
}

async function likeRecentPosts(username: string, count: number): Promise<void> {
  console.log(`❤️ 좋아요: @${username} (${count}개)`)
  // 오픈클로: 프로필 방문 → 최근 게시물 좋아요
}

async function postComment(username: string, comment: string): Promise<void> {
  console.log(`💬 댓글: @${username} — "${comment}"`)
  // 오픈클로: 게시물 열기 → 댓글 입력
}

async function savePendingDMs(accounts: ScoredAccount[]): Promise<void> {
  // 승인된 DM 목록을 파일 또는 Supabase에 임시 저장
  // 저녁 세션에서 로드
  const fs = await import('fs/promises')
  await fs.writeFile(
    '/tmp/jitda_pending_dms.json',
    JSON.stringify(accounts, null, 2)
  )
}

function pickComment(account: ScoredAccount, config: typeof jitdaConfig): string {
  const pool = account.type === 'pregnancy'
    ? config.commentPool.pregnancy
    : config.commentPool.general
  return pool[Math.floor(Math.random() * pool.length)]
}

main().catch(console.error)
