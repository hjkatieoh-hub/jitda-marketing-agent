import * as dotenv from 'dotenv'
dotenv.config()

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  console.log('token:', token?.slice(0, 10))
  console.log('chatId:', chatId)

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: '✅ JITDA 에이전트 v2 테스트!' })
  })

  const data = await res.json()
  console.log(data)
}

main()
