// lib/telegram.ts
// Phase 1: 컨펌 요청 + 응답 처리
// Phase 2: 결과 리포트만 발송

import TelegramBot from 'node-telegram-bot-api'
import * as dotenv from 'dotenv'
dotenv.config()

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: false })
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!

// ─── 컨펌 요청 아이템 타입 ───────────────────────────────

export type ConfirmItem = {
  index: number
  username: string
  followers: number
  er: number
  score: number
  hashtag: string
  templateType: string
  messagePreview: string  // DM 첫 줄
  fullMessage: string
}

// ─── 메시지 발송 ────────────────────────────────────────

export async function sendMessage(text: string): Promise<void> {
  await bot.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' })
}

// ─── Phase 1: 컨펌 요청 ────────────────────────────────

export async function sendConfirmRequest(items: ConfirmItem[]): Promise<void> {
  const lines: string[] = [
    `📋 *JITDA DM 발송 대기 — 승인 요청*`,
    `📅 ${new Date().toLocaleDateString('ko-KR')} · 총 ${items.length}건`,
    `──────────────────`,
  ]

  for (const item of items) {
    const templateLabel: Record<string, string> = {
      A: '감성형', B: '정보형', C: '공감형', D: '직접형', E: '질문형'
    }
    lines.push(
      `\n*${String(item.index).padStart(2, '0')}. @${item.username}* ⭐️${item.score}점`,
      `    팔로워 ${item.followers.toLocaleString()} · ER ${item.er}% · ${item.hashtag}`,
      `    템플릿: ${item.templateType} (${templateLabel[item.templateType]})`,
      `    _"${item.messagePreview}..."_`,
    )
  }

  lines.push(
    `\n──────────────────`,
    `✅ 전체 승인: *승인*`,
    `❌ 전체 거절: *거절*`,
    `🚫 개별 제외: *N번 제외*`,
    `✏️ 개별 수정: *N번 수정: [메시지]*`,
    `🎯 선택 발송: *1,3,5번만*`,
  )

  await sendMessage(lines.join('\n'))
}

// ─── Phase 1: 응답 파싱 ────────────────────────────────

export type ConfirmResult = {
  action: 'approve_all' | 'reject_all' | 'partial'
  excluded: number[]
  modified: Record<number, string>  // index → 새 메시지
  selected: number[] | null          // null = 전체
}

export function parseConfirmReply(text: string, totalCount: number): ConfirmResult {
  const t = text.trim()

  // 전체 승인
  if (t === '승인') {
    return { action: 'approve_all', excluded: [], modified: {}, selected: null }
  }

  // 전체 거절
  if (t === '거절') {
    return { action: 'reject_all', excluded: [], modified: {}, selected: null }
  }

  const excluded: number[] = []
  const modified: Record<number, string> = {}
  let selected: number[] | null = null

  // 선택 발송: "1,3,5번만"
  const selectedMatch = t.match(/^([\d,\s]+)번만$/)
  if (selectedMatch) {
    selected = selectedMatch[1].split(',').map(n => parseInt(n.trim()))
    return { action: 'partial', excluded, modified, selected }
  }

  // 라인별 파싱
  const lines = t.split('\n')
  for (const line of lines) {
    // "N번 제외"
    const excludeMatch = line.match(/^(\d+)번 제외$/)
    if (excludeMatch) {
      excluded.push(parseInt(excludeMatch[1]))
      continue
    }

    // "N번 수정: [내용]"
    const modifyMatch = line.match(/^(\d+)번 수정:\s*(.+)$/)
    if (modifyMatch) {
      modified[parseInt(modifyMatch[1])] = modifyMatch[2].trim()
      continue
    }
  }

  return { action: 'partial', excluded, modified, selected }
}

// ─── 컨펌 대기 (폴링) ─────────────────────────────────

export async function waitForConfirm(timeoutMs = 3600000): Promise<string> {
  return new Promise((resolve, reject) => {
    const pollingBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true })
    const timer = setTimeout(() => {
      pollingBot.stopPolling()
      reject(new Error('컨펌 타임아웃 (1시간)'))
    }, timeoutMs)

    pollingBot.on('message', (msg) => {
      if (String(msg.chat.id) === CHAT_ID && msg.text) {
        clearTimeout(timer)
        pollingBot.stopPolling()
        resolve(msg.text)
      }
    })
  })
}

// ─── 일일 리포트 ──────────────────────────────────────

export type DailyReport = {
  date: string
  explored: number
  qualified: number
  avgScore: number
  followed: number
  liked: number
  commented: number
  dmSent: number
  templateBreakdown: Record<string, number>
  replied: number
  replyRate: number
  couponIssued: number
  topAccount?: { username: string; score: number }
  errors: string[]
}

export async function sendDailyReport(r: DailyReport): Promise<void> {
  const templateStr = Object.entries(r.templateBreakdown)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')

  const text = [
    `📊 *JITDA 일일 리포트*`,
    `📅 ${r.date}`,
    `──────────────────`,
    `🔍 탐색: ${r.explored}개 수집 / ${r.qualified}개 적합`,
    `⭐️ 평균 가치점수: ${r.avgScore}점`,
    `👤 팔로우: ${r.followed}개`,
    `❤️ 좋아요: ${r.liked} · 댓글: ${r.commented}`,
    `📩 DM: ${r.dmSent}건 (${templateStr})`,
    `💬 응답: ${r.replied}건 (${r.replyRate.toFixed(1)}%)`,
    `🎁 쿠폰: ${r.couponIssued}건`,
    `──────────────────`,
    r.topAccount ? `🏆 최고 계정: @${r.topAccount.username} (${r.topAccount.score}점)` : '',
    `⚠️ 오류: ${r.errors.length === 0 ? '없음' : r.errors.join(', ')}`,
  ].filter(Boolean).join('\n')

  await sendMessage(text)
}

// ─── 에러 알림 ──────────────────────────────────────

export async function sendErrorAlert(message: string): Promise<void> {
  await sendMessage(`🚨 *JITDA 에이전트 오류*\n\n${message}`)
}

// ─── 속도 제한 경고 ─────────────────────────────────

export async function sendRateLimitAlert(): Promise<void> {
  await sendMessage(
    `⛔️ *인스타그램 속도 제한 감지*\n\n` +
    `에이전트가 즉시 중단됐어요.\n` +
    `오늘 남은 작업은 취소됐습니다.\n` +
    `내일 정상 재개 예정.`
  )
}
