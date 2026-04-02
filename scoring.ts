// lib/scoring.ts
// 계정 가치 점수 산정 + DM 템플릿 자동 선택

import type { BrandConfig } from '../config/brands'

export type CandidateAccount = {
  username: string
  followers: number
  following: number
  postCount: number
  recentPostDays: number       // 마지막 게시물 경과 일수
  contentRatio: number         // 임신/육아 콘텐츠 비율 (%)
  avgLikes: number
  avgComments: number
  hashtag: string              // 발굴된 해시태그
  hashtagVolume: 'high' | 'mid' | 'low'
  bio: string
  recentCaptions: string[]     // 최근 게시물 캡션 샘플
  usedHashtags: string[]       // 계정이 사용한 해시태그들
  language: string
  isBusinessAccount: boolean
}

export type ScoredAccount = CandidateAccount & {
  engagementRate: number
  score: number
  type: 'pregnancy' | 'lifestyle' | 'skip'
  templateType: 'A' | 'B' | 'C' | 'D' | 'E'
  skipReason?: string
}

// ─── 참여율 계산 ────────────────────────────────────

export function calcEngagementRate(
  avgLikes: number,
  avgComments: number,
  followers: number
): number {
  if (followers === 0) return 0
  return parseFloat(((avgLikes + avgComments) / followers * 100).toFixed(2))
}

// ─── 가치 점수 계산 (0~100) ────────────────────────

export function calcScore(account: CandidateAccount & { engagementRate: number }): number {
  let score = 0

  // 1. 참여율 (40점)
  const er = account.engagementRate
  if (er >= 8) score += 40
  else if (er >= 5) score += 30
  else if (er >= 3) score += 20
  else if (er >= 1) score += 10

  // 2. 임신/육아 콘텐츠 비율 (25점)
  const cr = account.contentRatio
  if (cr >= 80) score += 25
  else if (cr >= 60) score += 20
  else if (cr >= 50) score += 10

  // 3. 관련 해시태그 사용 (20점)
  const highValueTags = ['#아기이름', '#태명', '#이름짓기', '#사주작명', '#한자이름']
  const pregnancyTags = ['#임신', '#태교', '#출산', '#만삭', '#임산부', '#예비맘']

  const usedHighValue = account.usedHashtags.filter(t => highValueTags.includes(t)).length
  const usedPregnancy = account.usedHashtags.filter(t =>
    pregnancyTags.some(pt => t.includes(pt.replace('#', '')))
  ).length

  if (usedHighValue > 0) score += 10
  if (usedPregnancy >= 3) score += 10
  else if (usedPregnancy >= 1) score += 5

  // 4. 팔로워 구간 (10점)
  const f = account.followers
  if (f >= 500 && f <= 5000) score += 10
  else if (f > 5000 && f <= 10000) score += 7
  else if (f < 500) score += 5

  // 5. 최근성 (5점)
  if (account.recentPostDays <= 7) score += 5
  else if (account.recentPostDays <= 14) score += 3

  return Math.min(score, 100)
}

// ─── 필터링 ──────────────────────────────────────

export function filterAccount(
  account: CandidateAccount,
  config: BrandConfig,
  existingUsernames: Set<string>
): { pass: boolean; reason?: string } {
  if (existingUsernames.has(account.username))
    return { pass: false, reason: '이미 컨택한 계정' }

  if (account.language !== 'ko')
    return { pass: false, reason: '비한국어 계정' }

  if (account.isBusinessAccount)
    return { pass: false, reason: '기업/브랜드 계정' }

  if (account.followers < config.targeting.followerMin)
    return { pass: false, reason: `팔로워 부족 (${account.followers})` }

  if (account.followers > config.targeting.followerMax)
    return { pass: false, reason: `팔로워 초과 (${account.followers})` }

  if (account.postCount < config.targeting.postCountMin)
    return { pass: false, reason: `게시물 부족 (${account.postCount})` }

  if (account.recentPostDays > config.targeting.recentPostDays)
    return { pass: false, reason: `최근 게시물 없음 (${account.recentPostDays}일)` }

  if (account.contentRatio < config.targeting.contentRatioMin)
    return { pass: false, reason: `콘텐츠 비율 낮음 (${account.contentRatio}%)` }

  if (account.following > account.followers * 3)
    return { pass: false, reason: '맞팔 목적 계정' }

  return { pass: true }
}

// ─── 계정 유형 분류 ──────────────────────────────

export function classifyAccountType(
  account: CandidateAccount
): 'pregnancy' | 'lifestyle' | 'skip' {
  const highValueTags = ['#아기이름', '#태명', '#이름짓기', '#사주작명']
  const pregnancyKeywords = ['임신', '태교', '만삭', '출산', '주차', '임산부', '태명', '예비맘']

  const allText = [
    account.bio,
    ...account.recentCaptions,
    ...account.usedHashtags,
  ].join(' ').toLowerCase()

  const hasHighValueTag = account.usedHashtags.some(t => highValueTags.includes(t))
  const pregnancyScore = pregnancyKeywords.filter(k => allText.includes(k)).length

  if (hasHighValueTag || pregnancyScore >= 3) return 'pregnancy'
  if (pregnancyScore >= 1 || account.contentRatio >= 50) return 'lifestyle'
  return 'skip'
}

// ─── DM 템플릿 선택 ──────────────────────────────

export function selectTemplate(
  account: CandidateAccount & { type: string; engagementRate: number }
): 'A' | 'B' | 'C' | 'D' | 'E' {
  const highValueTags = ['#아기이름', '#태명', '#이름짓기', '#사주작명', '#한자이름']
  const hasHighValueTag = account.usedHashtags.some(t => highValueTags.includes(t))

  // D: 이름 관련 태그 사용 계정
  if (hasHighValueTag) return 'D'

  // E: 댓글 소통 많은 계정 (avgComments 높음)
  if (account.avgComments >= 10) return 'E'

  // B: 출산준비/정보성
  const infoKeywords = ['출산예정', 'D-', '주차', '출산준비', '체크리스트']
  const allText = [account.bio, ...account.recentCaptions].join(' ')
  if (infoKeywords.some(k => allText.includes(k))) return 'B'

  // A: 임신 일상/감성
  if (account.type === 'pregnancy' && account.engagementRate >= 5) return 'A'

  // C: 기본값 (공감형)
  return 'C'
}

// ─── DM 메시지 생성 ──────────────────────────────

export function generateDmMessage(
  username: string,
  templateType: 'A' | 'B' | 'C' | 'D' | 'E',
  serviceUrl: string
): string {
  const templates: Record<string, string> = {
    A: `${username}님 피드 보다가 연락드렸어요 🍃\n저희 짓다(${serviceUrl})는 사주와 한자 의미를 함께 분석해 이름을 지어드리는 서비스인데, 한번 무료로 체험해보실래요?\n소중한 분께 드리고 싶어서 먼저 연락드렸어요 🤍`,

    B: `안녕하세요 ${username}님! AI 기반 아기 작명 서비스 짓다 팀입니다.\n자평명리학 사주 분석 + 한자 의미 + 가족 궁합까지 담은 리포트를 무료로 체험하실 수 있어요.\n관심 있으시면 편하게 답장 주세요 😊 (${serviceUrl})`,

    C: `이름 고민 많이 하고 계시죠? ${username}님 🥲\n저도 그 고민 너무 잘 알아서 — 짓다(${serviceUrl}) 한번 써보셨으면 해서요.\n사주 + 한자 의미로 이름 후보 뽑아드리는 AI 서비스인데, 무료로 먼저 체험해보세요 🌿`,

    D: `${username}님, 아기 이름 고민 중이시죠? 🌱\n짓다는 사주 8글자 + 한자 의미 + 가족 궁합을 AI가 분석해서 이름 후보를 추천해드려요.\n지금 ${serviceUrl}에서 무료로 체험해보실 수 있어요!`,

    E: `${username}님 혹시 아기 이름 아직 고민 중이세요? 🤔\nAI로 사주 보고 한자 의미까지 분석해서 이름 추천해드리는 서비스 만들었거든요.\n궁금하시면 ${serviceUrl} 들어와보세요 — 무료 체험 가능해요 😊`,
  }

  return templates[templateType]
}

// ─── 쿠폰 DM 메시지 ─────────────────────────────

export function generateCouponMessage(
  username: string,
  couponCode: string,
  expiryDays: number,
  serviceUrl: string
): string {
  return `감사해요 ${username}님! 🎉\n무료 체험 쿠폰 코드 드릴게요 👇\n\n🎁 코드: ${couponCode}\n📅 유효기간: ${expiryDays}일\n\n${serviceUrl} 접속 후 결제 화면에서 코드 입력하시면 돼요.\n궁금한 점 있으시면 언제든 물어봐 주세요 🌿`
}

// ─── 전체 스코어링 파이프라인 ────────────────────

export function scoreAccount(
  account: CandidateAccount,
  config: BrandConfig,
  existingUsernames: Set<string>
): ScoredAccount | null {
  // 필터링
  const { pass, reason } = filterAccount(account, config, existingUsernames)
  if (!pass) return null

  const engagementRate = calcEngagementRate(
    account.avgLikes,
    account.avgComments,
    account.followers
  )

  // ER 최소 기준
  if (engagementRate < config.targeting.erMin) return null

  const score = calcScore({ ...account, engagementRate })

  // 최소 점수 기준
  if (score < config.targeting.scoreThresholdWarmup) return null

  const type = classifyAccountType(account)
  if (type === 'skip') return null

  const templateType = selectTemplate({ ...account, type, engagementRate })

  return {
    ...account,
    engagementRate,
    score,
    type,
    templateType,
  }
}
