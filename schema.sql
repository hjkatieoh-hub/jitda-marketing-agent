-- supabase/schema.sql
-- Supabase SQL Editor에 그대로 실행

-- ① 브랜드 마스터
create table if not exists brands (
  id         text primary key,
  name       text not null,
  platform   text not null,
  active     boolean default true,
  created_at timestamptz default now()
);

insert into brands values
  ('jitda_app',   'JITDA 짓다',       'app',       true, now()),
  ('jitda_insta', 'JITDA 인스타',     'instagram', true, now()),
  ('katie_yt',    'Katie Sing Along', 'youtube',   true, now())
on conflict do nothing;

-- ② 인플루언서 (v2 — 학습용 컬럼 포함)
create table if not exists influencers (
  id               uuid primary key default gen_random_uuid(),
  brand_id         text references brands(id),
  username         text not null,
  followers        integer,
  engagement_rate  numeric(5,2),
  score            integer,
  type             text,            -- pregnancy / lifestyle / skip
  status           text default 'warming',
  hashtag_source   text,
  hashtag_volume   text,            -- high / mid / low
  recent_post_days integer,
  content_ratio    integer,
  warmup_done      boolean default false,
  note             text,
  created_at       timestamptz default now()
);

create index if not exists idx_influencers_brand_status
  on influencers(brand_id, status);

create index if not exists idx_influencers_username
  on influencers(username);

-- ③ DM 로그 (v2 — A/B 테스트 컬럼 포함)
create table if not exists dm_logs (
  id             uuid primary key default gen_random_uuid(),
  influencer_id  uuid references influencers(id),
  template_type  text,             -- A / B / C / D / E
  message        text,
  send_hour      integer,
  sent_at        timestamptz default now(),
  replied        boolean default false,
  replied_at     timestamptz,
  coupon_sent    boolean default false,
  coupon_sent_at timestamptz,
  status         text default 'sent', -- sent / failed / pending_confirm
  ab_test_group  text
);

-- ④ 쿠폰
create table if not exists coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null default 'INFLUENCER50',
  brand_id      text references brands(id),
  influencer_id uuid references influencers(id),
  issued_at     timestamptz default now(),
  expires_at    timestamptz default now() + interval '30 days',
  used          boolean default false,
  used_at       timestamptz
);

-- ⑤ 콘텐츠 캘린더
create table if not exists content_calendar (
  id           uuid primary key default gen_random_uuid(),
  brand_id     text references brands(id),
  platform     text,               -- instagram / youtube
  post_type    text,               -- feed / reel / shorts / longform
  title        text,
  caption      text,
  status       text default 'draft', -- draft / scheduled / published
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at   timestamptz default now()
);

-- ⑥ 에이전트 학습 로그 (자기학습 시스템)
create table if not exists agent_learnings (
  id            uuid primary key default gen_random_uuid(),
  week_start    date,
  hypothesis_id text,              -- HYP-001 등
  result        text,              -- confirmed / rejected / inconclusive
  insight       text,
  action_taken  text,
  created_at    timestamptz default now()
);

-- ⑦ 앱 유저 (짓다 서비스)
create table if not exists app_users (
  id         uuid primary key default gen_random_uuid(),
  brand_id   text references brands(id),
  email      text,
  plan       text default 'free',
  paid_at    timestamptz,
  source     text,
  created_at timestamptz default now()
);

-- ⑧ 작명 리포트
create table if not exists app_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references app_users(id),
  baby_name  text,
  saju_data  jsonb,
  created_at timestamptz default now()
);

-- RLS 활성화
alter table influencers      enable row level security;
alter table dm_logs          enable row level security;
alter table coupons          enable row level security;
alter table content_calendar enable row level security;
alter table agent_learnings  enable row level security;
alter table app_users        enable row level security;
