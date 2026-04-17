/**
 * Merit donation tracker — Telegram alerts + report generation.
 *
 * Uses the same fetch-based Telegram pattern as lib/jarvis/tools-web.ts.
 * No external libraries — raw fetch against the Bot API.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN  — Bot API token
 *   TELEGRAM_CHAT_ID    — Bo's chat ID (default recipient)
 */
import type { LedgerEntry, LedgerState } from './types'
import { DONATION_THRESHOLD_CENTS, CHILDREN_MERCY_URL } from './types'

// ─── Config ───────────────────────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN ?? ''
const TELEGRAM_DEFAULT_CHAT  = process.env.TELEGRAM_CHAT_ID ?? ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centsToDisplay(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ─── Report generators ────────────────────────────────────────────────────────

export function generateDonationReport(state: LedgerState): string {
  return [
    'MERIT — Donation Ready',
    '',
    `Net this period: ${centsToDisplay(state.totalNetProfit)}`,
    `Already donated: ${centsToDisplay(state.totalDonated)}`,
    `READY TO DONATE: ${centsToDisplay(state.pendingDonation)}`,
    '',
    `Donate: ${CHILDREN_MERCY_URL}`,
    '',
    'Reply "donated <receipt>" when done.',
  ].join('\n')
}

export function generateDailyBrief(state: LedgerState, todaySales: LedgerEntry[]): string {
  const todayGross  = todaySales.reduce((sum, e) => sum + e.grossRevenue, 0)
  const todayNet    = todaySales.reduce((sum, e) => sum + e.netProfit, 0)
  const orderCount  = todaySales.length

  return [
    `MERIT — Daily Brief (${todayLabel()})`,
    '',
    `Orders today:       ${orderCount}`,
    `Gross today:        ${centsToDisplay(todayGross)}`,
    `Net today:          ${centsToDisplay(todayNet)}`,
    '',
    `─── Running totals ───`,
    `Total net profit:   ${centsToDisplay(state.totalNetProfit)}`,
    `Total donated:      ${centsToDisplay(state.totalDonated)}`,
    `Pending donation:   ${centsToDisplay(state.pendingDonation)}`,
  ].join('\n')
}

export function shouldSendDonationAlert(state: LedgerState): boolean {
  return state.pendingDonation >= DONATION_THRESHOLD_CENTS
}

// ─── Telegram sender ──────────────────────────────────────────────────────────

export async function sendTelegramToBO(text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('sendTelegramToBO: TELEGRAM_BOT_TOKEN is not set')
  }
  if (!TELEGRAM_DEFAULT_CHAT) {
    throw new Error('sendTelegramToBO: TELEGRAM_CHAT_ID is not set')
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_DEFAULT_CHAT,
        text,
        parse_mode: 'Markdown',
      }),
    })
  } catch (err: unknown) {
    throw new Error(`sendTelegramToBO: network error: ${(err as Error).message}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)')
    throw new Error(`sendTelegramToBO: Telegram API error ${response.status}: ${body}`)
  }

  return true
}
