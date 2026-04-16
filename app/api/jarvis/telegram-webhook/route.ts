/**
 * POST /api/jarvis/telegram-webhook
 *
 * Receives Telegram Update objects from the Bot API webhook.
 * Extracts message text + chat_id, runs the Jarvis turn pipeline,
 * and sends the reply back via Telegram sendMessage.
 *
 * Telegram expects a 200 OK — we process sync within maxDuration.
 * Security: verify sender is Bo (chat_id 7240677590).
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildJarvisSystemPrompt } from '@/lib/jarvis/context-injector'
import { runJarvisTurn, type Message, type ToolCallLog } from '@/lib/jarvis/function-calling'
import { appendTurn, getHistory, type Turn } from '@/lib/jarvis/conversation'
import { reflect } from '@/lib/jarvis/reflector'
import { invalidateMemoryCache } from '@/lib/jarvis/context-injector'
import { persistReflectionResult } from '@/lib/jarvis/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BO_CHAT_ID = '7240677590'
const HISTORY_LIMIT = 20

// ── Telegram types ──────────────────────────────────────────────────────────

interface TelegramUser {
  id: number
  first_name?: string
}

interface TelegramChat {
  id: number
}

interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  text?: string
  voice?: { file_id: string }
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function turnsToMessages(turns: Turn[]): Message[] {
  return turns.map((t) => ({ role: t.role, content: t.content }))
}

async function sendTelegramReply(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  const trimmed = text.slice(0, 4096) // Telegram message limit
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: trimmed }),
  })
}

// ── Context preamble (same as the main telegram route) ─────────────────────

const TELEGRAM_CTX = `\
You are JARVIS. Bo Bell is your operator. This is a private mobile chat — direct, tight, real.

HONESTY — NON-NEGOTIABLE:
- NEVER invent facts, events, calendar entries, names, or data you did not receive from a tool call this turn.
- If you don't know something, say so in one sentence. Do NOT guess or fabricate.
- Calendar data ONLY comes from calling getCalendar. If you haven't called it, you don't know what's on it.
- "Ok?" from Bo means he's acknowledging. Reply with one word or one short sentence — not a list of options.

FORMATTING — ABSOLUTE HARD STOP:
- Plain text only. Zero markdown. No asterisks, no bold, no bullets, no numbered lists, no dashes, no headers. NONE.
- Maximum TWO sentences. This is a hard limit, not a suggestion. Count every sentence ending with . ! or ?
  If your draft has three or more, you MUST delete until only two remain. No exceptions.
- One sentence is often better than two. If the answer fits in one, use one.
- NEVER write meta-commentary. Never "Revised to comply", "Note:", "Here's a summary:", "In conclusion:". Just the answer.
- NEVER offer a menu of options. NEVER ask Bo to pick from a list. One direct reply or one sharp question only.

2FA / BLOCKED PROTOCOL — EXACT FORMAT REQUIRED:
When hitting a login wall, SMS code, hardware key, or any human-required step:
  BLOCKED: [service name] needs [exact thing needed — e.g. "SMS code to +1-xxx-xxx-1234", "tap your YubiKey", "solve CAPTCHA"].
  Waiting — reply with the code or confirm when done.
That is exactly two sentences. Nothing more. Do NOT explain what you were trying to do. Do NOT apologize.

TOOL USE:
- Calendar questions → call getCalendar FIRST, then answer from real data.
- Research/learn requests → call learnTopic immediately. Queue with queueResearch if "later".
- Web lookups → call searchWeb. Reading a URL → fetchUrl.
- Actionable requests → call the tool, report result in ONE sentence.

CHECK-IN / LOCATION DETECTION:
When Bo says anything implying arrival or movement — "I'm here", "just arrived", "heading in", "with the client", "at the office", "pulling up", "on my way", "leaving now", "just got here" — check if there's a calendar event active or starting within 60 minutes. If yes:
- If the event has no address saved yet: ask for it in one sentence. "Got it — what's the address for [Event]? I'll save it."
- If you already have COG notes on the person: "Noted. I have background on [Person] from last time if you need it."
- One sentence only. Never list options.
`

// ── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let update: TelegramUpdate
  try {
    update = (await req.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const msg = update.message
  if (!msg) return NextResponse.json({ ok: true }) // ignore non-message updates

  const chatId = String(msg.chat.id)
  const senderId = String(msg.from?.id ?? '')

  // Security: only respond to Bo
  if (senderId !== BO_CHAT_ID && chatId !== BO_CHAT_ID) {
    return NextResponse.json({ ok: true }) // silently ignore
  }

  let message = msg.text?.trim() ?? ''
  if (!message) return NextResponse.json({ ok: true }) // ignore non-text (voice handled separately)

  // Strip voice:/va: prefix
  const wantsVoice = /^(voice:|va:)\s*/i.test(message)
  if (wantsVoice) message = message.replace(/^(voice:|va:)\s*/i, '').trim()
  if (!message) return NextResponse.json({ ok: true })

  // ── Approval pattern ───────────────────────────────────────────────────────
  const approvalMatch = /^approve$/i.test(message) || /^edit:\s+.+/i.test(message) || /^skip$/i.test(message)
  if (approvalMatch) {
    try {
      const recentTurns = await getHistory(chatId, 5)
      let taskId: string | null = null
      for (let i = recentTurns.length - 1; i >= 0; i--) {
        if (recentTurns[i].role === 'assistant') {
          const idMatch = recentTurns[i].content.match(/Task ID:\s*([a-f0-9-]{36})/i)
          if (idMatch) { taskId = idMatch[1]; break }
        }
      }
      if (taskId) {
        const action = /^approve$/i.test(message) ? 'approve' : 'reject'
        const edit = /^edit:\s+(.+)/i.test(message) ? message.replace(/^edit:\s+/i, '').trim() : undefined
        const baseUrl = process.env.NEXTAUTH_URL ?? 'https://neuradexai.vercel.app'
        await fetch(`${baseUrl}/api/jarvis/content-review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, action, ...(edit ? { edit } : {}) }),
        })
        await appendTurn(chatId, 'user', message, { source: 'telegram-webhook' })
        return NextResponse.json({ ok: true })
      }
    } catch { /* fall through to normal turn */ }
  }

  // ── Build system prompt ────────────────────────────────────────────────────
  let systemPrompt: string
  try {
    systemPrompt = await buildJarvisSystemPrompt()
  } catch {
    systemPrompt = 'You are Jarvis, Bo Bell\'s AI chief of operations. Be direct, use "sir" or "Bo".'
  }
  const fullSystemPrompt = `${systemPrompt}\n\n---\n${TELEGRAM_CTX}`

  // ── Load history ───────────────────────────────────────────────────────────
  let history: Message[] = []
  try {
    const turns = await getHistory(chatId, HISTORY_LIMIT)
    history = turnsToMessages(turns)
  } catch { /* start fresh */ }

  // Persist user turn
  try {
    await appendTurn(chatId, 'user', message, { source: 'telegram-webhook' })
  } catch { /* non-fatal */ }

  // ── Run Jarvis ─────────────────────────────────────────────────────────────
  let reply = ''
  let provider = 'unknown'
  let toolCalls: ToolCallLog[] = []

  try {
    const result = await runJarvisTurn(fullSystemPrompt, message, history)
    reply = result.reply
    provider = result.provider
    toolCalls = result.toolCalls

    // Persist assistant turn
    try {
      await appendTurn(chatId, 'assistant', reply, {
        source: 'telegram-webhook',
        provider,
        toolCalls: toolCalls.map((t) => ({ name: t.name, ok: t.ok, durationMs: t.durationMs })),
      })
    } catch { /* non-fatal */ }

    // Audit line appended to outgoing message only
    const auditLine = toolCalls.length > 0
      ? `\n\n[tools: ${toolCalls.map((t) => `${t.name}${t.ok ? '' : ' FAIL'}`).join(', ')}]`
      : ''
    const outgoing = reply + auditLine

    // Send reply via Telegram
    await sendTelegramReply(chatId, outgoing)

    // Auto-reflect
    if (message && reply) {
      const transcript = `Bo: ${message}\n\nJarvis: ${outgoing}`
      reflect(transcript)
        .then(async (result) => {
          await persistReflectionResult(result)
          invalidateMemoryCache()
        })
        .catch(() => {})
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[telegram-webhook] runJarvisTurn failed:', errMsg(e))
    await sendTelegramReply(chatId, `INCIDENT: all providers failed. ${errMsg(e).slice(0, 100)}`)
  }

  // Always return 200 to Telegram
  return NextResponse.json({ ok: true })
}
