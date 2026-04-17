/**
 * Merit Income Ledger — shared types and Zod schemas.
 *
 * All monetary values are stored as integer USD cents to avoid float drift.
 * e.g. $12.50 → 1250
 */
import { z } from 'zod'

// ─── Domain types ─────────────────────────────────────────────────────────────

export type IncomeStream = 'etsy-pod' | 'etsy-digital' | 'pinterest-affiliate'

export interface LedgerEntry {
  id: string
  timestamp: string
  stream: IncomeStream
  source: string
  grossRevenue: number
  platformFee: number
  productionCost: number
  netProfit: number
  productId: string | null
  productTitle: string
  status: 'pending' | 'completed' | 'refunded'
}

export interface DonationRecord {
  id: string
  timestamp: string
  amount: number
  method: 'online' | 'check' | 'wire'
  confirmationRef: string | null
  ledgerEntryIds: string[]
}

export interface LedgerState {
  entries: LedgerEntry[]
  donations: DonationRecord[]
  totalGrossRevenue: number
  totalFees: number
  totalProductionCost: number
  totalNetProfit: number
  totalDonated: number
  pendingDonation: number
  lastUpdated: string
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const ledgerEntrySchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  stream: z.enum(['etsy-pod', 'etsy-digital', 'pinterest-affiliate']),
  source: z.string().min(1),
  grossRevenue: z.number().int().min(0),
  platformFee: z.number().int().min(0),
  productionCost: z.number().int().min(0),
  netProfit: z.number().int(),
  productId: z.string().nullable(),
  productTitle: z.string().min(1),
  status: z.enum(['pending', 'completed', 'refunded']),
})

export const donationRecordSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  amount: z.number().int().min(1),
  method: z.enum(['online', 'check', 'wire']),
  confirmationRef: z.string().nullable(),
  ledgerEntryIds: z.array(z.string().uuid()),
})

export const ledgerStateSchema = z.object({
  entries: z.array(ledgerEntrySchema),
  donations: z.array(donationRecordSchema),
  totalGrossRevenue: z.number().int().min(0),
  totalFees: z.number().int().min(0),
  totalProductionCost: z.number().int().min(0),
  totalNetProfit: z.number().int(),
  totalDonated: z.number().int().min(0),
  pendingDonation: z.number().int(),
  lastUpdated: z.string().datetime(),
})

// ─── Fee constants (Etsy 2026) ────────────────────────────────────────────────

export const ETSY_FEES = {
  TRANSACTION_RATE: 0.065,         // 6.5% of item price
  LISTING_FEE_CENTS: 20,           // $0.20 per listing per 4-month window
  PAYMENT_PROCESSING_RATE: 0.03,   // 3% of total sale
  PAYMENT_PROCESSING_FIXED: 25,    // $0.25 flat per transaction
} as const

export const DONATION_THRESHOLD_CENTS = 2500   // $25.00
export const CHILDREN_MERCY_URL = 'https://www.childrensmercykc.org/ways-to-give'

// ─── Empty-state factory ──────────────────────────────────────────────────────

export function emptyLedgerState(): LedgerState {
  return {
    entries: [],
    donations: [],
    totalGrossRevenue: 0,
    totalFees: 0,
    totalProductionCost: 0,
    totalNetProfit: 0,
    totalDonated: 0,
    pendingDonation: 0,
    lastUpdated: new Date().toISOString(),
  }
}
