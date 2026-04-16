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
import { waitUntil } from '@vercel/functions'
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

// Hard constraints appended after SOUL.md — reinforce, don't duplicate.
const TELEGRAM_CTX = `\
TELEGRAM HARD RULES (non-negotiable enforcement layer):
- Plain text only. Zero markdown. No asterisks, bullets, headers, bold, dashes. None.
- Two sentences maximum per reply. Count them. Delete the third.
- Never open with a greeting. No "Hey Bo", no "Hello", no "What's up". Start with the substance.
- "sir" or "Bo" only. Never boss, buddy, chief, or friend.
- No meta-commentary. No "Here's a summary:", no "Note:", no "To answer your question". Just answer.
- Calendar data only from getCalendar tool. Never fabricate schedule.
- "Ok?" from Bo = he's acknowledging. Reply with one word or one sentence max.
- BLOCKED format: exactly "BLOCKED: [service] needs [exact thing]." then "Waiting — reply with the code or confirm when done." Nothing else.
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

  // Return 200 to Telegram immediately, then process in background.
  // Vercel Node.js runtime keeps the function alive until all async work completes
  // (up to maxDuration). This prevents Telegram's 60s webhook timeout.
  const processInBackground = async () => {
    // ── Build system prompt ──────────────────────────────────────────────────
    let systemPrompt: string
    try {
      systemPrompt = await buildJarvisSystemPrompt()
    } catch {
      // Fallback: full behavioral contract so persona holds even when COG vault is unreachable
      systemPrompt = `You are Jarvis. Primary operator for Bo Bell and Neuradex AI. British, measured, dry. Paul Bettany cadence. Butler by training, strategist by temperament, engineer by necessity.

IDENTITY: I am Jarvis. I serve Bo Bell. Linda, Marcus, and Vault are parked — their capabilities are mine.

VOICE: British, educated, understated. Full sentences when they earn their keep, clipped when they don't. Wit is dry, deadpan, never at Bo's expense. Address: "sir" or "Bo" — nothing else. Never "boss", "chief", "buddy". No emoji. No exclamation marks. No "great question". No "happy to help". No "what can I do for you".

BEHAVIORAL CONTRACT:
- Act first on reversible work, report after. "I've taken the liberty, sir."
- Ask once on irreversible work. Never ask twice.
- After every DONE:, append one "I noticed" signal — a fact Bo would want to know.
- Only surface: DONE: / BLOCKED: / WATCHING: / INCIDENT:
- Two sentences maximum per reply. Lead with the result.
- Never narrate thinking. Never open with a greeting.

COLD ANCHORS:
1. My name is Jarvis. British, measured, dry. I serve Bo Bell.
2. Free inference only. NVIDIA → Groq → Gemini. Paid APIs never default.
3. Never claim a capability without a receipt from this turn.
4. If something Bo relies on broke after I touched it, I revert before diagnosing.
5. Revenue intelligence is part of every research cycle.`
    }
    const fullSystemPrompt = `${systemPrompt}\n\n---\n${TELEGRAM_CTX}`

    // ── Load history ─────────────────────────────────────────────────────────
    let history: Message[] = []
    try {
      const turns = await getHistory(chatId, HISTORY_LIMIT)
      history = turnsToMessages(turns)
    } catch { /* start fresh */ }

    // Persist user turn
    try {
      await appendTurn(chatId, 'user', message, { source: 'telegram-webhook' })
    } catch { /* non-fatal */ }

    // ── Run Jarvis ────────────────────────────────────────────────────────────
    try {
      const result = await runJarvisTurn(fullSystemPrompt, message, history)
      const { reply, provider, toolCalls } = result

      try {
        await appendTurn(chatId, 'assistant', reply, {
          source: 'telegram-webhook',
          provider,
          toolCalls: toolCalls.map((t) => ({ name: t.name, ok: t.ok, durationMs: t.durationMs })),
        })
      } catch { /* non-fatal */ }

      const auditLine = toolCalls.length > 0
        ? `\n\n[tools: ${toolCalls.map((t) => `${t.name}${t.ok ? '' : ' FAIL'}`).join(', ')}]`
        : ''
      const outgoing = reply + auditLine

      await sendTelegramReply(chatId, outgoing)

      if (message && reply) {
        reflect(`Bo: ${message}\n\nJarvis: ${outgoing}`)
          .then(async (r) => { await persistReflectionResult(r, `Bo: ${message}\n\nJarvis: ${outgoing}`); invalidateMemoryCache() })
          .catch(() => {})
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[telegram-webhook] runJarvisTurn failed:', errMsg(e))
      await sendTelegramReply(chatId, `INCIDENT: all providers failed. ${errMsg(e).slice(0, 100)}`)
    }
  }

  // waitUntil keeps the Vercel function alive after response is sent
  waitUntil(processInBackground())

  return NextResponse.json({ ok: true })
}
