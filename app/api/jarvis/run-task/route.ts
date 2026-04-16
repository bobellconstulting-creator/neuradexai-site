/**
 * POST /api/jarvis/run-task
 *
 * Queues a long-running task for Jarvis to execute asynchronously.
 * Returns immediately with { ok: true, taskId } — actual execution
 * happens in the /api/jarvis/task-runner cron (every 5 min).
 *
 * Body: { task: string, chatId?: string }
 *
 * Flow:
 *   1. Create task record with assignedTo:'jarvis', status:'open'
 *      description encodes: RUNTASK:<chatId>\n<full task instruction>
 *   2. Send immediate Telegram ack to Bo
 *   3. Return taskId — done in < 1 second
 *   4. /api/jarvis/task-runner picks it up within 5 min, runs deep loop, sends result
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createTask } from '@/lib/missionTasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const DEFAULT_CHAT_ID = process.env.JARVIS_OWNER_CHAT_ID ?? '7240677590'

const bodySchema = z.object({
  task: z.string().min(1).max(2000),
  chatId: z.string().optional(),
})

async function tgSend(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => { /* non-fatal */ })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 })
  }

  const { task, chatId = DEFAULT_CHAT_ID } = parsed.data

  // Encode chatId in description so task-runner knows where to reply
  const description = `RUNTASK:${chatId}\n${task}`

  let taskId = ''
  try {
    const created = await createTask({
      title: task.slice(0, 100),
      description,
      assignedTo: 'jarvis',
      createdBy: 'bo',
      status: 'open',
      priority: 'high',
      revenue: false,
    })
    taskId = created.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[run-task] createTask failed:', msg)
    return NextResponse.json({ ok: false, error: `Failed to queue task: ${msg}` }, { status: 500 })
  }

  // Immediate ack
  await tgSend(chatId, `On it. I'll come back when it's done.`)

  return NextResponse.json({ ok: true, taskId })
}
