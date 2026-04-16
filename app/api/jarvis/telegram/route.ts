/**
 * POST /api/jarvis/telegram
 *
 * Telegram-facing chat endpoint for Jarvis.
 *
 * Pipeline:
 *   1. Build the system prompt (SOUL + vault memory) via buildJarvisSystemPrompt()
 *   2. Load persistent per-chat history from lib/jarvis/conversation.ts (or
 *      accept an inline `history` array from the caller).
 *   3. Run the function-calling loop (lib/jarvis/function-calling.ts):
 *      Gemini 2.5 Flash → Groq llama-3.3-70b → NVIDIA Nemotron (text-only).
 *      Tool calls (up to 5 per turn) execute via dispatchTool().
 *   4. Append user + assistant turns to the JSONL + markdown store.
 *
 * Returns { ok, reply, toolCalls, provider }.
 * Free-first only — no paid APIs in this path.
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildJarvisSystemPrompt } from '@/lib/jarvis/context-injector'
import {
  runJarvisTurn,
  type Message,
  type ToolCallLog,
} from '@/lib/jarvis/function-calling'
// ── Persistent conversation store (JSONL + MD mirror) ──
// Preserve appendTurn() on both user and assistant sides — the store is the
// single source of truth for chat history and for the nightly reflection cron.
import { appendTurn, getHistory, type Turn } from '@/lib/jarvis/conversation'
import { reflect } from '@/lib/jarvis/reflector'
import { invalidateMemoryCache } from '@/lib/jarvis/context-injector'
import { persistReflectionResult } from '@/lib/jarvis/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const HISTORY_LIMIT = 20

// ──────────────────────────────────────────────────────────────────────────
// Telegram context preamble (appended to the SOUL system prompt)
// ──────────────────────────────────────────────────────────────────────────

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

EXAMPLES:
Bo: "Do I have anything tomorrow?"
WRONG: "Yes sir, you have a meeting with the Marketing Team at 10 AM." [FABRICATED]
RIGHT: [call getCalendar tool first, then report what it actually returns — one sentence]

Bo: "Ok?"
WRONG: [paragraph of options and clarification requests]
RIGHT: "Standing by."

Bo: [nothing happens, login wall hit]
WRONG: "I encountered a two-factor authentication challenge which requires your intervention to proceed."
RIGHT: "BLOCKED: ElevenLabs needs the SMS code sent to your phone. Waiting — reply with the code."

TOOL USE:
- Calendar questions → call getCalendar FIRST, then answer from real data.
- Research/learn requests → call learnTopic immediately. Queue with queueResearch if "later".
- Web lookups → call searchWeb. Reading a URL → fetchUrl.
- Actionable requests → call the tool, report result in ONE sentence.
- delegateToClaudeCode: only when Bo explicitly says to use Claude Code.
`

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function turnsToMessages(turns: Turn[]): Message[] {
  // Turn and Message share role+content shape; drop ts/meta/chatId.
  return turns.map((t) => ({ role: t.role, content: t.content }))
}

// ──────────────────────────────────────────────────────────────────────────
// Route
// ──────────────────────────────────────────────────────────────────────────

interface PostBody {
  message?: unknown
  agentId?: unknown
  chat_id?: unknown
  chatId?: unknown
  history?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 })
  }

  let message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json({ ok: false, error: 'missing message' }, { status: 400 })
  }

  // Strip voice: / va: prefix — sets flag to send audio reply via Telegram
  const wantsVoice = /^(voice:|va:)\s*/i.test(message)
  if (wantsVoice) {
    message = message.replace(/^(voice:|va:)\s*/i, '').trim()
    if (!message) {
      return NextResponse.json({ ok: false, error: 'missing message after voice prefix' }, { status: 400 })
    }
  }

  // Accept both `chat_id` (Telegram-style) and `chatId` (camelCase) for back-compat.
  const chatIdRaw = body.chat_id ?? body.chatId
  const chatId =
    typeof chatIdRaw === 'string' && chatIdRaw.trim()
      ? chatIdRaw.trim()
      : typeof chatIdRaw === 'number'
        ? String(chatIdRaw)
        : ''

  // ── Approval pattern detection ────────────────────────────────────────────
  // Check BEFORE any LLM work. If Bo replies APPROVE / EDIT: / SKIP and the
  // last assistant message in history references a Task ID, route to content-review.
  const approvalMatch =
    /^approve$/i.test(message) ||
    /^edit:\s+.+/i.test(message) ||
    /^skip$/i.test(message)

  if (approvalMatch && chatId) {
    // Pull the last few turns to find the Task ID in the most recent assistant message
    let taskId: string | null = null
    try {
      const { getHistory } = await import('@/lib/jarvis/conversation')
      const recentTurns = await getHistory(chatId, 5)
      for (let i = recentTurns.length - 1; i >= 0; i--) {
        if (recentTurns[i].role === 'assistant') {
          const idMatch = recentTurns[i].content.match(/Task ID:\s*([a-f0-9-]{36})/i)
          if (idMatch) {
            taskId = idMatch[1]
            break
          }
        }
      }
    } catch {
      // history unavailable — fall through to normal LLM turn
    }

    if (taskId) {
      let action: 'approve' | 'reject' = 'reject'
      let edit: string | undefined
      if (/^approve$/i.test(message)) {
        action = 'approve'
      } else if (/^edit:\s+(.+)/i.test(message)) {
        action = 'reject'
        edit = message.replace(/^edit:\s+/i, '').trim()
      }
      // SKIP → reject with no edit → blocks the task

      const baseUrl =
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
        process.env.NEXTAUTH_URL ??
        'http://localhost:3000'

      const reviewBody: { taskId: string; action: string; edit?: string } = { taskId, action }
      if (edit) reviewBody.edit = edit

      try {
        await fetch(`${baseUrl}/api/jarvis/content-review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reviewBody),
        })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[jarvis/telegram] content-review dispatch failed:', errMsg(e).slice(0, 120))
      }

      // Persist user turn then return immediately — no LLM needed
      try {
        await appendTurn(chatId, 'user', message, { source: 'telegram' })
      } catch { /* non-fatal */ }

      return NextResponse.json({ ok: true, reply: '', toolCalls: [], provider: 'approval-handled' })
    }
  }
  // ── /Approval pattern detection ───────────────────────────────────────────

  // Build the enriched system prompt — SOUL + vault memory (5k token cap)
  let systemPrompt: string
  try {
    systemPrompt = await buildJarvisSystemPrompt()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[jarvis/telegram] buildJarvisSystemPrompt failed:', errMsg(e))
    // Defensive fallback — never go dark
    systemPrompt =
      'You are Jarvis, Bo Bell\'s AI executive. Be direct, precise, and address him as "sir" or "Bo".'
  }

  const fullSystemPrompt = `${systemPrompt}\n\n---\n${TELEGRAM_CTX}`

  // ── Load history: inline override if caller passed `history`, else store ──
  let history: Message[] = []
  if (Array.isArray(body.history)) {
    for (const entry of body.history) {
      if (entry && typeof entry === 'object') {
        const e = entry as { role?: unknown; content?: unknown }
        if (
          (e.role === 'user' || e.role === 'assistant') &&
          typeof e.content === 'string' &&
          e.content.trim()
        ) {
          history.push({ role: e.role, content: e.content })
        }
      }
    }
  } else if (chatId) {
    try {
      const turns = await getHistory(chatId, HISTORY_LIMIT)
      history = turnsToMessages(turns)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[jarvis/telegram] getHistory failed:', errMsg(e).slice(0, 120))
    }
  }

  // Append the user turn BEFORE dispatching so it's captured even on model failure.
  if (chatId) {
    try {
      await appendTurn(chatId, 'user', message, { source: 'telegram' })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[jarvis/telegram] appendTurn(user) failed:', errMsg(e).slice(0, 120))
    }
  }

  // Stream the response so Cloudflare tunnel keepalive prevents 30s timeout.
  // Protocol: newline bytes every 3s while model thinks, then one JSON line at end.
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Keepalive ticker — sends \n every 3s to prevent tunnel idle timeout
      let done = false
      const ticker = setInterval(() => {
        if (!done) {
          try { controller.enqueue(encoder.encode('\n')) } catch { /* closed */ }
        }
      }, 3000)

      try {
        const result = await runJarvisTurn(fullSystemPrompt, message, history)
        done = true
        clearInterval(ticker)

        // Persist assistant turn — store original reply WITHOUT audit line
        if (chatId && result.reply) {
          try {
            await appendTurn(chatId, 'assistant', result.reply, {
              source: 'telegram',
              provider: result.provider,
              toolCalls: result.toolCalls.map((t) => ({
                name: t.name,
                ok: t.ok,
                durationMs: t.durationMs,
                ...(t.error ? { error: t.error } : {}),
              })),
            })
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[jarvis/telegram] appendTurn(assistant) failed:', errMsg(e).slice(0, 120))
          }
        }

        // Append audit line to the outgoing message only — not to stored history.
        const auditLine = result.toolCalls
          .map((t: ToolCallLog) => `${t.name}${t.ok ? '' : ' FAIL'}`)
          .join(', ')
        const replyWithAudit = result.toolCalls.length > 0
          ? `${result.reply}\n\n[tools: ${auditLine}]`
          : result.reply

        // ── Voice note (opt-in: message prefixed with voice: / va:) ───────────
        if (
          wantsVoice &&
          process.env.ELEVENLABS_API_KEY &&
          process.env.TELEGRAM_BOT_TOKEN &&
          chatId &&
          result.reply
        ) {
          try {
            const baseUrl =
              (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
              process.env.NEXTAUTH_URL ??
              'http://localhost:3000'
            const ttsRes = await fetch(`${baseUrl}/api/tts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: result.reply }),
              signal: AbortSignal.timeout(60_000),
            })
            if (ttsRes.ok) {
              const audioBytes = Buffer.from(await ttsRes.arrayBuffer())
              const caption = result.reply.slice(0, 200)

              const form = new FormData()
              form.append('chat_id', chatId)
              form.append('voice', new Blob([audioBytes], { type: 'audio/mpeg' }), 'jarvis-reply.mp3')
              form.append('caption', caption)

              await fetch(
                `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendVoice`,
                { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) }
              )
              // fall through — text reply is always sent as well
            }
          } catch (e) {
            // Voice send failed — silently fall back to text only
            // eslint-disable-next-line no-console
            console.warn('[jarvis/telegram] voice note failed:', errMsg(e).slice(0, 120))
          }
        }
        // ── /Voice note ──────────────────────────────────────────────────────

        const payload = JSON.stringify({
          ok: true,
          reply: replyWithAudit,
          toolCalls: result.toolCalls,
          provider: result.provider,
        })
        controller.enqueue(encoder.encode(payload + '\n'))

        // Auto-reflect: extract instincts/preferences from this exchange.
        // Runs after payload is enqueued — non-blocking, failures are swallowed.
        // Uses replyWithAudit so the reflector knows what tools ran.
        if (message && result.reply) {
          const transcript = `Bo: ${message}\n\nJarvis: ${replyWithAudit}`
          reflect(transcript)
            .then(async (result) => {
              await persistReflectionResult(result)
              invalidateMemoryCache()
            })
            .catch((e) => {
              // eslint-disable-next-line no-console
              console.warn('[jarvis/telegram] auto-reflect failed:', errMsg(e).slice(0, 80))
            })
        }
      } catch (e) {
        done = true
        clearInterval(ticker)
        // eslint-disable-next-line no-console
        console.error('[jarvis/telegram] runJarvisTurn failed:', errMsg(e))
        const errPayload = JSON.stringify({ ok: false, error: `all providers failed: ${errMsg(e)}` })
        controller.enqueue(encoder.encode(errPayload + '\n'))
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no', // disable nginx/proxy buffering
    },
  })
}
