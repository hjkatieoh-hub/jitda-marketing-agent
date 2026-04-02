# JITDA 마케팅 에이전트 시스템

AI 기반 멀티브랜드 SNS 마케팅 자동화 에이전트

## 구조

```
jitda-agents/
├── agents/
│   ├── influencer/
│   │   ├── morning.ts    ← 09:00 탐색·워밍업
│   │   └── evening.ts    ← 19:00 DM·응답·쿠폰
│   └── content/
│       └── upload.ts     ← 18:00 콘텐츠 업로드
├── lib/
│   ├── supabase.ts       ← DB 연동
│   ├── telegram.ts       ← 봇 알림 + 컨펌 시스템
│   ├── scoring.ts        ← 계정 점수 + 템플릿 선택
│   └── utils.ts          ← 공통 유틸
├── config/
│   └── brands.ts         ← 브랜드 설정 (새 브랜드 = 여기에만 추가)
└── supabase/
    └── schema.sql        ← DB 테이블 정의
```

## 운영 모드

`.env`에서 설정:

```
AGENT_PHASE=1   # 컨펌 모드 (초기 2~4주)
AGENT_PHASE=2   # 완전 자동화
```

### Phase 1 — 컨펌 모드
1. 에이전트가 후보 탐색 + DM 초안 작성
2. 텔레그램으로 리스트 전송
3. 승인/거절/수정 응답
4. 승인된 것만 발송

### Phase 2 — 자동화
- 텔레그램으로 결과 리포트만 수신

## 시작하기

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일 수정

# 3. Supabase 스키마 생성
# supabase/schema.sql → Supabase SQL Editor에서 실행

# 4. 실행
npm run influencer:morning   # 오전 세션
npm run influencer:evening   # 저녁 세션
```

## 새 브랜드 추가

`config/brands.ts`에 config 객체 하나 추가 → 끝.
에이전트·DB·텔레그램 코드 수정 불필요.

## 텔레그램 컨펌 명령어

| 명령 | 동작 |
|------|------|
| `승인` | 전체 발송 |
| `거절` | 전체 취소 |
| `3번 제외` | 3번 빼고 발송 |
| `2번 수정: [메시지]` | 2번 메시지 교체 후 발송 |
| `1,3,5번만` | 선택 발송 |
