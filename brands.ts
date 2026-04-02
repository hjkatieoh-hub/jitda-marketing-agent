// config/brands.ts
// 새 브랜드 추가 = 이 파일에 객체 하나 추가하면 끝

export type BrandConfig = {
  id: string
  name: string
  instagramHandle: string
  supabaseBrandId: string

  // 탐색 설정
  hashtags: {
    high: string[]    // 고경쟁 (10%)
    mid: string[]     // 중경쟁 (60%)
    low: string[]     // 저경쟁 (30%)
  }

  // 타겟 기준
  targeting: {
    followerMin: number
    followerMax: number
    erMin: number           // 참여율 최소 (%)
    contentRatioMin: number // 임신/육아 콘텐츠 비율 최소 (%)
    recentPostDays: number  // 최근 게시물 기준 (일)
    postCountMin: number    // 게시물 수 최소
    scoreThresholdDM: number       // DM 발송 최소 점수
    scoreThresholdWarmup: number   // 워밍업만 할 최소 점수
  }

  // 일일 한도
  limits: {
    follow: number
    like: number
    comment: number
    dm: number
  }

  // 딜레이 (ms)
  delays: {
    followMin: number
    followMax: number
    likeMin: number
    likeMax: number
    commentMin: number
    commentMax: number
    dmMin: number
    dmMax: number
  }

  // DM 설정
  dm: {
    targetType: string[]   // DM 보낼 계정 유형
    sendAfterDays: number  // 팔로우 후 며칠 뒤 DM
    couponCode: string
    couponExpiryDays: number
    serviceUrl: string
  }

  // 톤/브랜드
  tone: string
  commentPool: {
    pregnancy: string[]
    general: string[]
  }
}

// ─────────────────────────────────────────
// JITDA 설정
// ─────────────────────────────────────────
export const jitdaConfig: BrandConfig = {
  id: 'jitda',
  name: 'JITDA 짓다',
  instagramHandle: 'jitda_name',
  supabaseBrandId: 'jitda_insta',

  hashtags: {
    high: [
      '#임신일상', '#임산부', '#육아맘', '#태교', '#만삭'
    ],
    mid: [
      '#임산부일상', '#출산준비', '#태교일기', '#임신중',
      '#임신기록', '#예비맘', '#임신축하', '#임신초기',
      '#임신중기', '#임신말기'
    ],
    low: [
      '#첫아이', '#출산예정', '#태명', '#아기이름',
      '#예비부모', '#임신vlog', '#주수인증', '#임신일기',
      '#출산브이로그', '#육아준비', '#아기용품', '#임산부패션',
      '#만삭사진', '#태교여행', '#이름짓기'
    ]
  },

  targeting: {
    followerMin: 500,
    followerMax: 10000,
    erMin: 3,
    contentRatioMin: 50,
    recentPostDays: 14,
    postCountMin: 10,
    scoreThresholdDM: 70,
    scoreThresholdWarmup: 50,
  },

  limits: {
    follow: 15,
    like: 30,
    comment: 8,
    dm: 15,
  },

  delays: {
    followMin: 8000,
    followMax: 15000,
    likeMin: 3000,
    likeMax: 8000,
    commentMin: 10000,
    commentMax: 20000,
    dmMin: 3000,
    dmMax: 7000,
  },

  dm: {
    targetType: ['pregnancy'],
    sendAfterDays: 1,
    couponCode: 'INFLUENCER50',
    couponExpiryDays: 30,
    serviceUrl: 'jitdaname.com',
  },

  tone: '따뜻하고 신뢰감 있는',
  commentPool: {
    pregnancy: [
      '이 시간이 정말 소중하겠어요 🌿',
      '태교하는 모습이 너무 예뻐요 💕',
      '건강하게 잘 자라길 바랄게요 🍀',
      '곧 만날 아기가 너무 기대되겠어요 ✨',
      '행복한 마무리 되시길 바랄게요 🤍',
    ],
    general: [
      '좋은 하루 되세요 😊',
      '행복이 느껴지는 피드예요 🌿',
      '너무 예쁜 순간이에요 ✨',
    ],
  },
}

// ─────────────────────────────────────────
// 브랜드 레지스트리 — 새 브랜드는 여기에 추가
// ─────────────────────────────────────────
export const brands: Record<string, BrandConfig> = {
  jitda: jitdaConfig,
  // katie: katieConfig,   // 추후 추가
  // groove: grooveConfig, // 추후 추가
}
