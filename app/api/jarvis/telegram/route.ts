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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
- Maximum TWO sentences. Count them. If you wrote three, delete the third.
- NEVER write meta-commentary. Never write "Revised to comply" or "Note:" or "Per your instructions." Just the answer.
- NEVER offer a menu of options. NEVER ask Bo to pick from a list. One direct reply or one sharp question.

EXAMPLES OF WHAT TO SAY:
Bo: "Do I have anything tomorrow?"
WRONG: "Yes sir, you have a meeting with the Marketing Team at 10 AM." [FABRICATED — you haven't called getCalendar]
RIGHT: [call getCalendar tool, then report what it actually returns]

Bo: "Ok?"
WRONG: [paragraph of options and clarification requests]
RIGHT: "Standing by."

TOOL USE:
- Tools: shellExec, writeDoc, createFolder, postToX, postToTikTok, generateImage, browserLogin,
  createAccount, speak, getCalendar, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
  learnTopic, searchKnowledge, createJarvisTask, listJarvisTasks, completeJarvisTask, delegateToClaudeCode.
- Calendar questions → call getCalendar FIRST, then answer from real data.
- Actionable requests → call the tool, report result in one line.
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

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json({ ok: false, error: 'missing message' }, { status: 400 })
  }

  // Accept both `chat_id` (Telegram-style) and `chatId` (camelCase) for back-compat.
  const chatIdRaw = body.chat_id ?? body.chatId
  const chatId =
    typeof chatIdRaw === 'string' && chatIdRaw.trim()
      ? chatIdRaw.trim()
      : typeof chatIdRaw === 'number'
        ? String(chatIdRaw)
        : ''

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

  // Run the function-calling loop
  let reply: string
  let toolCalls: ToolCallLog[] = []
  let provider = 'unknown'

  try {
    const result = await runJarvisTurn(fullSystemPrompt, message, history)
    reply = result.reply
    toolCalls = result.toolCalls
    provider = result.provider
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[jarvis/telegram] runJarvisTurn failed:', errMsg(e))
    return NextResponse.json(
      { ok: false, error: `all providers failed: ${errMsg(e)}` },
      { status: 502 },
    )
  }

  // Persist the assistant turn on success — include provider + tool summary as metadata
  if (chatId && reply) {
    try {
      await appendTurn(chatId, 'assistant', reply, {
        source: 'telegram',
        provider,
        toolCalls: toolCalls.map((t) => ({
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

  return NextResponse.json({ ok: true, reply, toolCalls, provider })
}
