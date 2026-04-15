/**
 * /api/jarvis/wakeup — Vercel cron job, fires daily at 7:00 AM CT (12:00 UTC CDT / 13:00 UTC CST).
 *
 * Sends Bo a Telegram wake-up ping via the Jarvis bot.
 * Schedule: vercel.json crons[].schedule = "0 12 * * *"
 *
 * Security: guarded by CRON_SECRET env var (set in Vercel, passed as Authorization header by Vercel).
 */
import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID    = process.env.JARVIS_OWNER_CHAT_ID
const CRON_SECRET = process.env.CRON_SECRET

const WAKE_MESSAGES = [
  "Good morning, Bo. 07:00. I'm online and operational. What's on the agenda today?",
  "Morning, Bo. Systems nominal. Calendar synced. Ready when you are.",
  "07:00, Bo. Good morning. I've got your back — what do you need?",
  "Rise and shine, Bo. I'm up. What are we building today?",
  "Good morning. 07:00 — another day to make things happen. I'm listening.",
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify Vercel cron secret (prevents unauthorized triggers)
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!BOT_TOKEN) {
    console.error('[wakeup] TELEGRAM_BOT_TOKEN not set')
    return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })
  }

  if (!CHAT_ID) {
    console.error('[wakeup] JARVIS_OWNER_CHAT_ID not set')
    return NextResponse.json({ ok: false, error: 'JARVIS_OWNER_CHAT_ID not configured' }, { status: 500 })
  }

  const text = pick(WAKE_MESSAGES)

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  })

  const data = await res.json() as { ok: boolean; description?: string }

  if (!data.ok) {
    console.error('[wakeup] Telegram error:', data.description)
    return NextResponse.json({ ok: false, error: data.description }, { status: 500 })
  }

  console.log('[wakeup] Morning ping sent to Bo')
  return NextResponse.json({ ok: true, sent: text })
}
