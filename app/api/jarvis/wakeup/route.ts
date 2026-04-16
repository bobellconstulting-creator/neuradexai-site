/**
 * /api/jarvis/wakeup — Vercel cron job.
 *
 * Time-of-day aware: detects CT hour from UTC and runs either the morning brief
 * or the nightly digest.
 *
 * Morning brief  — cron fires at 12:00 UTC (7am CDT / 6am CST)
 * Nightly digest — cron fires at  3:00 UTC (9pm CDT / 8pm CST)
 *
 * Schedule: vercel.json crons[].schedule = "0 3 * * *" (nightly digest)
 * OpenClaw handles the morning brief via its own cron.
 *
 * Security: guarded by CRON_SECRET env var (set in Vercel, passed as Authorization header by Vercel).
 */
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID     = process.env.JARVIS_OWNER_CHAT_ID
const CRON_SECRET = process.env.CRON_SECRET

const MORNING_FALLBACK = 'Good morning, Bo. Systems online. Ready when you are.'
const NIGHTLY_FALLBACK = 'Evening, Bo. Day wrapped. Ready for tomorrow.'

const MORNING_BRIEF_INSTRUCTION =
  'Morning brief: Check my calendar for today using getCalendar. Check COG/RESEARCH-QUEUE.md for any queued items using readDoc. ' +
  'Give me a 3-sentence morning brief: (1) what\'s on the calendar today, (2) any blocked or pending items from the queue, ' +
  '(3) one thing you\'re watching or ready to help with. British JARVIS voice, no lists, plain text only.'

// Today's daily note path is built at runtime inside the handler.
function buildNightlyInstruction(): string {
  const today = new Date().toISOString().slice(0, 10)
  return (
    `Nightly digest: Review today's activity. Use readDoc to check COG/01-daily/${today}.md for what happened today. ` +
    'Use searchKnowledge to find the most recent learnings. ' +
    'Give Bo a 4-sentence end-of-day summary: (1) what got done today, (2) anything learned or researched, ' +
    '(3) what\'s queued for tomorrow, (4) one observation or pattern you noticed. ' +
    'British JARVIS voice, plain text, no lists.'
  )
}

/**
 * Returns true if the UTC hour corresponds to evening CT (20:00–22:00 CT).
 * CDT = UTC-5 (summer), CST = UTC-6 (winter).
 * Vercel cron firing at 03:00 UTC → 9pm CDT / 10pm CST — both within the nightly window.
 */
function isNightlyWindow(): boolean {
  const utcHour = new Date().getUTCHours()
  // 03:00 UTC → 21:00 CDT or 22:00 CST — treat 2–5 UTC as nightly
  return utcHour >= 2 && utcHour <= 5
}

/**
 * Derive the base URL for internal self-calls.
 * Vercel sets VERCEL_URL without a scheme; NEXTAUTH_URL is fully qualified.
 * Falls back to localhost for local dev.
 */
function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

/**
 * Read an NDJSON stream from the telegram endpoint.
 * The stream emits bare '\n' keepalive lines and terminates with one JSON line.
 * Returns the parsed final JSON object.
 */
async function readNdjsonStream(
  stream: ReadableStream<Uint8Array>
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
  }

  // Split on newlines, find the last non-empty line, parse it.
  const lines = buffer.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('empty stream from telegram endpoint')
  const lastLine = lines[lines.length - 1]!
  return JSON.parse(lastLine) as { ok: boolean; reply?: string; error?: string }
}

async function sendTelegramFallback(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  })
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

  // Detect morning vs nightly based on UTC hour
  const nightly     = isNightlyWindow()
  const instruction = nightly ? buildNightlyInstruction() : MORNING_BRIEF_INSTRUCTION
  const fallbackMsg = nightly ? NIGHTLY_FALLBACK : MORNING_FALLBACK
  const label       = nightly ? 'Nightly digest' : 'Morning brief'

  // ── Step 1: ask Jarvis for a brief via the telegram endpoint ──
  const baseUrl = getBaseUrl()
  const telegramUrl = `${baseUrl}/api/jarvis/telegram`

  try {
    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: instruction,
        chatId: CHAT_ID,
      }),
    })

    if (!res.ok || !res.body) {
      throw new Error(`telegram endpoint returned ${res.status}`)
    }

    const parsed = await readNdjsonStream(res.body)

    if (!parsed.ok || !parsed.reply) {
      throw new Error(parsed.error ?? 'no reply from Jarvis')
    }

    // ── Step 2: send the LLM-generated brief via Telegram ──
    await sendTelegramFallback(parsed.reply)

    console.log(`[wakeup] ${label} sent to Bo via Jarvis LLM`)
    return NextResponse.json({ ok: true, brief: parsed.reply, mode: nightly ? 'nightly' : 'morning' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[wakeup] ${label} LLM failed, sending fallback:`, msg)

    // ── Step 3: fallback — plain text ping ──
    await sendTelegramFallback(fallbackMsg)
    return NextResponse.json({ ok: true, brief: fallbackMsg, fallback: true, error: msg, mode: nightly ? 'nightly' : 'morning' })
  }
}
