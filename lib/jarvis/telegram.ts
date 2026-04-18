/**
 * Shared Telegram send utilities for Jarvis.
 *
 * Extracted from app/api/jarvis/telegram-webhook/route.ts so non-route modules
 * (tool dispatcher, alerting, proactive crons) can reuse a single path without
 * importing route files.
 *
 * Free-first: direct fetch to the Telegram Bot API using TELEGRAM_BOT_TOKEN.
 * No paid SDK. 5-second timeout so a slow API never stalls callers.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org'
const TELEGRAM_MSG_LIMIT = 4096
const TELEGRAM_SEND_TIMEOUT_MS = 5_000

export interface TelegramSendResult {
  sent: boolean
  status?: number
  error?: string
}

/**
 * Low-level Telegram text send. Never throws — returns a result shape.
 * Caller decides whether failure should surface.
 */
export async function sendTelegramText(
  chatId: string,
  text: string,
  opts: { token?: string; timeoutMs?: number } = {}
): Promise<TelegramSendResult> {
  const token = opts.token ?? process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return { sent: false, error: 'TELEGRAM_BOT_TOKEN not set' }
  }
  if (!chatId) {
    return { sent: false, error: 'chatId missing' }
  }
  const trimmed = text.length > TELEGRAM_MSG_LIMIT ? text.slice(0, TELEGRAM_MSG_LIMIT) : text
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: trimmed }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? TELEGRAM_SEND_TIMEOUT_MS),
    })
    if (!res.ok) {
      return { sent: false, status: res.status, error: `HTTP ${res.status}` }
    }
    return { sent: true, status: res.status }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { sent: false, error: msg }
  }
}

/**
 * Resolve Bo's owner chat_id. Prefers env var, falls back to the known constant
 * so alerting still works if the env var is absent.
 */
export function getOwnerChatId(): string {
  return process.env.JARVIS_OWNER_CHAT_ID ?? '7240677590'
}
