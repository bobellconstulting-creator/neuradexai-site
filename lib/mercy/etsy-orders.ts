/**
 * Merit order poller — polls Printify for new completed orders,
 * calculates net profit per line item, appends to the ledger.
 *
 * State: last-seen order ID stored in
 *   COG/04-projects/mercy-engine/.last-order-id
 *
 * Env vars:
 *   PRINTIFY_API_KEY  — Printify personal access token
 *   PRINTIFY_SHOP_ID  — Printify shop ID
 *   COG_PATH          — optional override
 */
import { promises as fs } from 'node:fs'
import path                from 'node:path'
import { randomUUID }      from 'node:crypto'
import { ETSY_FEES }       from './types'
import { appendEntry }     from './ledger'
import {
  shouldSendDonationAlert,
  sendTelegramToBO,
  generateDonationReport,
} from './donation-tracker'
import { readLedger } from './ledger'

// ─── Config ───────────────────────────────────────────────────────────────────

const PRINTIFY_BASE = 'https://api.printify.com/v1'
const COG_BASE      = process.env.COG_PATH ?? 'C:/Users/bobel/COG'
const LAST_ORDER_ID_PATH = path.join(
  COG_BASE, '04-projects', 'mercy-engine', '.last-order-id',
)

// ─── Printify order types ─────────────────────────────────────────────────────

interface PrintifyLineItem {
  product_id: string
  title:       string
  cost:        number   // production cost in cents
  retail_price: number  // gross in cents
}

interface PrintifyOrder {
  id:         string
  status:     string
  line_items: PrintifyLineItem[]
  created_at: string
}

interface PrintifyOrdersResponse {
  data: PrintifyOrder[]
}

// ─── State helpers ────────────────────────────────────────────────────────────

async function readLastOrderId(): Promise<string | null> {
  try {
    const raw = await fs.readFile(LAST_ORDER_ID_PATH, 'utf8')
    return raw.trim() || null
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function writeLastOrderId(orderId: string): Promise<void> {
  await fs.mkdir(path.dirname(LAST_ORDER_ID_PATH), { recursive: true })
  await fs.writeFile(LAST_ORDER_ID_PATH, orderId, 'utf8')
}

// ─── Printify fetch ───────────────────────────────────────────────────────────

async function fetchOrders(apiKey: string, shopId: string): Promise<PrintifyOrder[]> {
  // Printify returns orders sorted newest-first; page 1 is enough for a daily poll
  const url = `${PRINTIFY_BASE}/shops/${shopId}/orders.json?limit=100&status=fulfilled`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`Printify orders HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as PrintifyOrdersResponse
  return data.data ?? []
}

// ─── Fee calculation ──────────────────────────────────────────────────────────

function calcNetProfit(gross: number, productionCost: number): {
  etsyTxFee:     number
  listingFee:    number
  paymentFee:    number
  platformFee:   number
  netProfit:     number
} {
  const etsyTxFee   = Math.round(gross * ETSY_FEES.TRANSACTION_RATE)
  const listingFee  = ETSY_FEES.LISTING_FEE_CENTS
  const paymentFee  =
    Math.round(gross * ETSY_FEES.PAYMENT_PROCESSING_RATE) +
    ETSY_FEES.PAYMENT_PROCESSING_FIXED
  const platformFee = etsyTxFee + listingFee + paymentFee
  const netProfit   = gross - platformFee - productionCost

  return { etsyTxFee, listingFee, paymentFee, platformFee, netProfit }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function pollNewOrders(): Promise<{ newOrders: number; totalNet: number }> {
  const apiKey = process.env.PRINTIFY_API_KEY
  const shopId = process.env.PRINTIFY_SHOP_ID

  if (!apiKey || !shopId) {
    throw new Error('pollNewOrders: PRINTIFY_API_KEY / PRINTIFY_SHOP_ID not set')
  }

  const orders    = await fetchOrders(apiKey, shopId)
  const lastSeen  = await readLastOrderId()

  // Identify new orders (everything after lastSeen in the sorted list)
  const lastIdx = lastSeen ? orders.findIndex((o) => o.id === lastSeen) : -1
  const newOrders = lastIdx === -1 ? orders : orders.slice(0, lastIdx)

  if (newOrders.length === 0) {
    return { newOrders: 0, totalNet: 0 }
  }

  let totalNet = 0
  const now = new Date().toISOString()

  for (const order of newOrders) {
    for (const item of order.line_items) {
      const gross          = item.retail_price    // already in cents
      const productionCost = item.cost            // already in cents
      const { platformFee, netProfit } = calcNetProfit(gross, productionCost)

      const entry = {
        id:              randomUUID(),
        timestamp:       order.created_at ?? now,
        stream:          'etsy-pod' as const,
        source:          `printify-order-${order.id}`,
        grossRevenue:    gross,
        platformFee,
        productionCost,
        netProfit,
        productId:       item.product_id ?? null,
        productTitle:    item.title ?? 'Unknown Product',
        status:          'completed' as const,
      }

      await appendEntry(entry)
      totalNet += netProfit
    }
  }

  // Persist the most recent order ID
  await writeLastOrderId(newOrders[0].id)

  // Check donation threshold and alert Bo if crossed
  const state = await readLedger()
  if (shouldSendDonationAlert(state)) {
    try {
      await sendTelegramToBO(generateDonationReport(state))
    } catch (err: unknown) {
      // Telegram alert failure must not crash the poller
      console.error('[etsy-orders] Telegram alert failed:', (err as Error).message)
    }
  }

  return { newOrders: newOrders.length, totalNet }
}
