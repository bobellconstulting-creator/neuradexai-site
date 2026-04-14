import { NextResponse } from 'next/server'
import { getBudget, DAILY_CAP } from '@/lib/nanoBananaBudget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const state = await getBudget()
    return NextResponse.json({
      ok: true,
      used: state.count,
      cap: DAILY_CAP,
      remaining: Math.max(0, DAILY_CAP - state.count),
      date: state.date,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'budget error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
