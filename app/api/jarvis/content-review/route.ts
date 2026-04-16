/**
 * POST /api/jarvis/content-review
 *
 * Handles Bo's approval/rejection responses from Telegram for content drafts.
 * Called by the telegram webhook when it detects APPROVE / EDIT: / SKIP patterns.
 *
 * Body: { taskId: string, action: 'approve' | 'reject', edit?: string }
 *
 * - approve  → kicks the task back into in_progress and sends the approved draft
 *              to Jarvis for posting via /api/jarvis/telegram
 * - reject + edit → updates the draft in approvalPayload and re-prompts Bo
 * - reject (no edit) → marks task blocked
 */

import { NextRequest, NextResponse } from 'next/server'
import { listTasks, updateTask } from '@/lib/missionTasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN ?? ''
const OWNER_CHAT   = process.env.JARVIS_OWNER_CHAT_ID ?? '7240677590'

async function tgSend(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => { /* non-fatal */ })
}

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
  return 'http://localhost:3000'
}

interface ReviewBody {
  taskId?: unknown
  action?: unknown
  edit?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ReviewBody
  try {
    body = (await req.json()) as ReviewBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 })
  }

  const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : ''
  const action  = body.action === 'approve' || body.action === 'reject' ? body.action : null
  const edit    = typeof body.edit === 'string' && body.edit.trim() ? body.edit.trim() : null

  if (!taskId || !action) {
    return NextResponse.json({ ok: false, error: 'taskId and action are required' }, { status: 400 })
  }

  // Find the task
  const allTasks = await listTasks()
  const task = allTasks.find((t) => t.id === taskId)
  if (!task) {
    return NextResponse.json({ ok: false, error: `task ${taskId} not found` }, { status: 404 })
  }

  const chatId = OWNER_CHAT

  if (action === 'approve') {
    await updateTask(taskId, { status: 'in_progress' })

    const draft = task.approvalPayload ?? task.description
    const promptMsg = `Execute this content task: ${task.description}. The approved draft is: ${draft}. Post it now using the appropriate tool (postToX or postToTikTok).`

    // Fire off to Jarvis telegram endpoint to execute the posting
    const baseUrl = getBaseUrl()
    fetch(`${baseUrl}/api/jarvis/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: promptMsg, chatId }),
    }).catch(() => { /* non-fatal — task is already in_progress */ })

    return NextResponse.json({ ok: true, action: 'approved', taskId })
  }

  if (action === 'reject' && edit) {
    await updateTask(taskId, {
      status: 'awaiting_approval',
      approvalPayload: edit,
    })
    await tgSend(
      chatId,
      `Content updated. New draft: ${edit}\n\nReply APPROVE to post or EDIT: [changes] to revise again.`,
    )
    return NextResponse.json({ ok: true, action: 'edited', taskId })
  }

  // reject without edit → block
  await updateTask(taskId, {
    status: 'blocked',
    blockedReason: 'Bo rejected draft',
  })
  await tgSend(chatId, 'Draft rejected. Task blocked.')
  return NextResponse.json({ ok: true, action: 'rejected', taskId })
}
