/**
 * Merit — Affiliate income logging.
 *
 * Provides two public functions:
 *   - logAffiliateIncome()    — records an affiliate payment in the ledger
 *   - parseAffiliateCommand() — parses a Telegram natural-language command
 *
 * Telegram command format (case-insensitive):
 *   "affiliate $12.50 from Amazon April 2026"
 *   "affiliate $7.00 from Bass Pro March 2026 for Hunting Boots"
 *
 * All monetary values stored as integer cents.
 */
import { randomUUID } from 'node:crypto'
import { appendEntry } from './ledger'
import { ETSY_FEES, type LedgerState } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AffiliateIncomeOptions {
  source: string       // "Amazon Associates", "Bass Pro"
  amount: number       // cents
  period: string       // "April 2026"
  productTitle: string
}

export interface ParsedAffiliateCommand {
  amount: number   // cents
  source: string
  period: string
  productTitle: string
}

// ─── Income logging ───────────────────────────────────────────────────────────

export async function logAffiliateIncome(opts: AffiliateIncomeOptions): Promise<LedgerState> {
  if (opts.amount <= 0) {
    throw new Error('logAffiliateIncome: amount must be a positive number of cents')
  }
  if (!opts.source.trim()) {
    throw new Error('logAffiliateIncome: source is required')
  }
  if (!opts.period.trim()) {
    throw new Error('logAffiliateIncome: period is required')
  }

  // Affiliate income has no platform fee and no production cost — it's pure net.
  // We record gross === net to keep ledger accounting clean.
  const platformFee = 0
  const productionCost = 0
  const netProfit = opts.amount

  const entry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    stream: 'pinterest-affiliate' as const,
    source: opts.source,
    grossRevenue: opts.amount,
    platformFee,
    productionCost,
    netProfit,
    productId: null,
    productTitle: opts.productTitle || `${opts.source} affiliate — ${opts.period}`,
    status: 'completed' as const,
  }

  return appendEntry(entry)
}

// ─── Telegram command parser ──────────────────────────────────────────────────

/**
 * Parses a natural-language Telegram affiliate command.
 *
 * Accepted formats:
 *   affiliate $12.50 from Amazon April 2026
 *   affiliate $7.00 from Bass Pro March 2026 for Hunting Boots
 *   affiliate $3.99 from ShareASale February 2026
 *
 * Returns null if the string doesn't match the expected pattern.
 */
export function parseAffiliateCommand(text: string): ParsedAffiliateCommand | null {
  const normalized = text.trim().toLowerCase()

  if (!normalized.startsWith('affiliate')) return null

  // Match: affiliate $<amount> from <source> <month> <year> [for <product>]
  const pattern =
    /^affiliate\s+\$([0-9]+(?:\.[0-9]{1,2})?)\s+from\s+(.+?)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})(?:\s+for\s+(.+))?$/i

  const match = text.trim().match(pattern)
  if (!match) return null

  const [, amountStr, source, month, year, productRaw] = match

  const amountFloat = parseFloat(amountStr ?? '0')
  if (isNaN(amountFloat) || amountFloat <= 0) return null

  // Convert to cents, rounding to nearest cent
  const amount = Math.round(amountFloat * 100)

  const capitalizedMonth =
    (month ?? '').charAt(0).toUpperCase() + (month ?? '').slice(1).toLowerCase()

  return {
    amount,
    source: (source ?? '').trim(),
    period: `${capitalizedMonth} ${year ?? ''}`.trim(),
    productTitle: productRaw?.trim() ?? '',
  }
}

// ─── Etsy digital fee calculator (utility, exported for cron use) ─────────────

/**
 * Calculates net profit for an Etsy digital download sale.
 * No production cost for digital goods — only platform fees apply.
 */
export function calcEtsyDigitalNet(priceInCents: number): {
  gross: number
  fee: number
  net: number
} {
  const transactionFee  = Math.round(priceInCents * ETSY_FEES.TRANSACTION_RATE)
  const paymentFee      = Math.round(priceInCents * ETSY_FEES.PAYMENT_PROCESSING_RATE)
                        + ETSY_FEES.PAYMENT_PROCESSING_FIXED
  const listingFee      = ETSY_FEES.LISTING_FEE_CENTS
  const totalFee        = transactionFee + paymentFee + listingFee
  const net             = priceInCents - totalFee

  return {
    gross: priceInCents,
    fee: totalFee,
    net,
  }
}
