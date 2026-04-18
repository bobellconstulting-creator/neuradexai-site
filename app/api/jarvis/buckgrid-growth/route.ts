/**
 * GET /api/jarvis/buckgrid-growth
 *
 * Vercel cron — fires every Sunday at 13:00 UTC (8am CT).
 * Runs a Jarvis agent turn to research BuckGrid's growth landscape:
 *   competitor analysis, community discovery, post ideas.
 * Writes a playbook to COG and sends a Telegram summary to Bo.
 *
 * Security: guarded by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runJarvisTurn } from '@/lib/jarvis/function-calling'
import { buildJarvisSystemPrompt } from '@/lib/jarvis/context-injector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN ?? ''
const CRON_SECRET = process.env.CRON_SECRET
const BO_CHAT_ID  = '7240677590'

const GROWTH_INSTRUCTION =
  'BuckGrid growth research. BuckGrid Pro (codespacebuckgrid.vercel.app) is a hunting land management app. Currently 0 users.' +
  ' Task: (1) searchWeb for \'hunting land management app\' and \'deer hunting app Kansas\' to understand competitor landscape.' +
  ' (2) searchWeb for \'hunting forums reddit facebook groups Kansas deer hunting\' to find where our target users hang out.' +
  ' (3) Write a concise growth playbook to COG/04-projects/buckgrid/growth-playbook.md with: top 3 competitors, top 5 communities to post in, and 3 specific posts Bo should make this week.' +
  ' (4) Send Bo a Telegram summarizing the top 3 communities and the 3 post ideas in under 100 words.'

async function tgSend(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => { /* non-fatal */ })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify Vercel cron secret
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  let systemPrompt: string
  try {
    systemPrompt = await buildJarvisSystemPrompt()
  } catch {
    systemPrompt = 'You are Jarvis, Bo Bell\'s AI executive. Be direct and thorough.'
  }

  let reply = ''
  let provider = 'none'
  try {
    const result = await runJarvisTurn(systemPrompt, GROWTH_INSTRUCTION, [])
    reply = result.reply
    provider = result.provider
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[buckgrid-growth] agent turn failed:', msg)
    await tgSend(BO_CHAT_ID, `BuckGrid growth run failed: ${msg.slice(0, 200)}`)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  // If the LLM didn't call sendTelegramMessage itself, send the reply directly.
  if (reply) {
    const maxLen = 3800
    const truncated = reply.length > maxLen ? reply.slice(0, maxLen) + '…' : reply
    await tgSend(BO_CHAT_ID, truncated)
  }

  console.log(`[buckgrid-growth] done provider=${provider} replyLen=${reply.length}`)
  return NextResponse.json({ ok: true, provider, replyLen: reply.length })
}
