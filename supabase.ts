// lib/supabase.ts

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// ─── 타입 ───────────────────────────────────────────────

export type InfluencerStatus =
  | 'warming'     // 팔로우+워밍업 완료, DM 대기
  | 'contacted'   // DM 발송 완료
  | 'responded'   // 긍정 응답
  | 'declined'    // 부정 응답
  | 'no_reply'    // 3일 무응답
  | 'pending_confirm' // 컨펌 대기 중 (Phase 1)

export type AccountType = 'pregnancy' | 'lifestyle' | 'skip'

export type Influencer = {
  id?: string
  brand_id: string
  username: string
  followers: number
  engagement_rate: number
  score: number
  type: AccountType
  status: InfluencerStatus
  hashtag_source: string
  hashtag_volume: 'high' | 'mid' | 'low'
  recent_post_days: number
  content_ratio: number
  warmup_done: boolean
  note?: string
  created_at?: string
}

export type DmLog = {
  id?: string
  influencer_id: string
  template_type: 'A' | 'B' | 'C' | 'D' | 'E'
  message: string
  send_hour: number
  sent_at?: string
  replied: boolean
  replied_at?: string
  coupon_sent: boolean
  coupon_sent_at?: string
  status: 'sent' | 'failed' | 'pending_confirm'
  ab_test_group?: string
}

// ─── 쿼리 헬퍼 ────────────────────────────────────────

// 이미 컨택한 계정 username 목록 조회
export async function getExistingUsernames(brandId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('influencers')
    .select('username')
    .eq('brand_id', brandId)

  if (error) throw error
  return new Set(data?.map(r => r.username) ?? [])
}

// 새 인플루언서 저장
export async function saveInfluencer(inf: Influencer): Promise<string> {
  const { data, error } = await supabase
    .from('influencers')
    .insert(inf)
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

// 오늘 팔로우한 계정 중 DM 발송 대상 조회
export async function getTodayFollowedForDM(
  brandId: string,
  afterDays: number,
  targetTypes: string[]
): Promise<Influencer[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - afterDays)

  const { data, error } = await supabase
    .from('influencers')
    .select('*')
    .eq('brand_id', brandId)
    .eq('status', 'warming')
    .in('type', targetTypes)
    .gte('score', 70)
    .lte('created_at', cutoff.toISOString())

  if (error) throw error
  return data ?? []
}

// DM 로그 저장
export async function saveDmLog(log: DmLog): Promise<void> {
  const { error } = await supabase.from('dm_logs').insert(log)
  if (error) throw error
}

// 인플루언서 상태 업데이트
export async function updateInfluencerStatus(
  id: string,
  status: InfluencerStatus,
  note?: string
): Promise<void> {
  const { error } = await supabase
    .from('influencers')
    .update({ status, ...(note ? { note } : {}) })
    .eq('id', id)
  if (error) throw error
}

// 쿠폰 발급
export async function issueCoupon(
  brandId: string,
  influencerId: string,
  code: string,
  expiryDays: number
): Promise<void> {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiryDays)

  const { error } = await supabase.from('coupons').insert({
    code,
    brand_id: brandId,
    influencer_id: influencerId,
    expires_at: expiresAt.toISOString(),
  })
  if (error) throw error
}

// 최근 N일간 발송 기록 중 미응답 조회
export async function getPendingReplies(days: number): Promise<any[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { data, error } = await supabase
    .from('dm_logs')
    .select('*, influencers(username)')
    .eq('replied', false)
    .eq('coupon_sent', false)
    .gte('sent_at', cutoff.toISOString())
    .neq('status', 'failed')

  if (error) throw error
  return data ?? []
}

// 학습 로그 저장
export async function saveLearning(entry: {
  week_start: string
  hypothesis_id: string
  result: 'confirmed' | 'rejected' | 'inconclusive'
  insight: string
  action_taken: string
}): Promise<void> {
  const { error } = await supabase.from('agent_learnings').insert(entry)
  if (error) throw error
}
