/**
 * GET /api/jarvis/task-runner
 *
 * Vercel cron — fires every 5 minutes.
 * Picks up the oldest open task assigned to 'jarvis' with a RUNTASK: prefix,
 * runs it through the deep function-calling loop (25 rounds / 20 tool calls),
 * and sends the result back to Bo via Telegram.
 *
 * Security: guarded by CRON_SECRET.
 * Max execution: 300 seconds (set via maxDuration export).
 */

import { NextRequest, NextResponse } from 'next/server'
import { listTasks, updateTask } from '@/lib/missionTasks'
import { runJarvisDeepTurn, runJarvisTurn } from '@/lib/jarvis/function-calling'
import { buildJarvisSystemPrompt } from '@/lib/jarvis/context-injector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN ?? ''
const CRON_SECRET = process.env.CRON_SECRET
const DEFAULT_CHAT = process.env.JARVIS_OWNER_CHAT_ID ?? '7240677590'

async function tgSend(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => { /* non-fatal */ })
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Find oldest open jarvis task — RUNTASK: or CONTENT:
  const tasks = await listTasks({ assignedTo: 'jarvis', status: 'open', limit: 10 })
  const task = tasks.find(
    (t) => t.description.startsWith('RUNTASK:') || t.description.startsWith('CONTENT:'),
  )

  if (!task) {
    return NextResponse.json({ ok: true, ran: 0, message: 'no pending tasks' })
  }

  // Mark in_progress immediately so concurrent cron invocations don't double-run
  await updateTask(task.id, { status: 'in_progress' })

  // Parse chatId from description: "<PREFIX>:<chatId>\n<instruction>"
  const firstNewline = task.description.indexOf('\n')
  const header = task.description.slice(0, firstNewline)
  const instruction = task.description.slice(firstNewline + 1).trim()

  const isContent = task.description.startsWith('CONTENT:')
  const chatId = header.replace(isContent ? 'CONTENT:' : 'RUNTASK:', '').trim() || DEFAULT_CHAT

  // ── CONTENT: draft-and-approve flow ──────────────────────────────────────
  if (isContent) {
    let systemPrompt: string
    try {
      systemPrompt = await buildJarvisSystemPrompt()
    } catch {
      systemPrompt = 'You are Jarvis, Bo Bell\'s AI executive. Be direct and thorough.'
    }

    let draft = ''
    try {
      const result = await runJarvisTurn(systemPrompt, `Draft content for this request: ${instruction}. Write the draft text only — no posting yet. Return ONLY the draft text, no commentary, no "here's the draft", just the content itself.`, [])
      draft = result.reply.trim()
    } catch (e) {
      const msg = errMsg(e)
      console.error('[task-runner] content draft failed:', msg)
      await updateTask(task.id, { status: 'blocked', blockedReason: msg.slice(0, 500) })
      await tgSend(chatId, `Draft failed: ${msg.slice(0, 200)}`)
      return NextResponse.json({ ok: false, taskId: task.id, error: msg })
    }

    await updateTask(task.id, {
      status: 'awaiting_approval',
      approvalPayload: draft,
    })

    await tgSend(
      chatId,
      `Draft ready for review:\n\n${draft}\n\nReply:\n• APPROVE to post\n• EDIT: [your changes] to revise\n• SKIP to cancel\n\nTask ID: ${task.id}`,
    )

    console.log(`[task-runner] content draft sent taskId=${task.id}`)
    return NextResponse.json({ ok: true, taskId: task.id, status: 'awaiting_approval' })
  }

  // ── RUNTASK: deep execution loop ─────────────────────────────────────────

  // Build system prompt (SOUL + vault memory)
  let systemPrompt: string
  try {
    systemPrompt = await buildJarvisSystemPrompt()
  } catch {
    systemPrompt = 'You are Jarvis, Bo Bell\'s AI executive. Be direct and thorough.'
  }

  const taskSystemPrompt = `${systemPrompt}

--- LONG TASK MODE ---
You are executing an autonomous background task Bo queued. Run it end-to-end using all available tools.
Use learnTopic, searchWeb, fetchUrl, writeDoc, shellExec, and any other tools needed to fully complete it.
When done, produce a complete summary of what you accomplished. Be thorough — Bo asked you to do this so he doesn't have to.
Do NOT ask clarifying questions. Make reasonable assumptions and execute.`

  // Run deep loop
  let reply = ''
  let provider = 'none'
  try {
    const result = await runJarvisDeepTurn(taskSystemPrompt, instruction)
    reply = result.reply
    provider = result.provider
    await updateTask(task.id, {
      status: 'done',
      proof: `provider:${provider} toolCalls:${result.toolCalls.length}`,
      agentReport: reply.slice(0, 2000),
    })
  } catch (e) {
    const msg = errMsg(e)
    console.error('[task-runner] deep turn failed:', msg)
    await updateTask(task.id, { status: 'blocked', blockedReason: msg.slice(0, 500) })
    await tgSend(chatId, `Task failed: ${msg.slice(0, 200)}`)
    return NextResponse.json({ ok: false, taskId: task.id, error: msg })
  }

  // Send result to Bo
  const maxLen = 3800
  const truncated = reply.length > maxLen ? reply.slice(0, maxLen) + '…' : reply
  await tgSend(chatId, truncated || 'Task complete.')

  console.log(`[task-runner] done taskId=${task.id} provider=${provider} replyLen=${reply.length}`)
  return NextResponse.json({ ok: true, taskId: task.id, provider, replyLen: reply.length })
}
