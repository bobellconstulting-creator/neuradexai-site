/**
 * Proactive pattern detection for Jarvis.
 *
 * Runs after every reflection and fires Telegram alerts / appends to COG files
 * when notable patterns are detected. All checks are non-throwing and run in
 * parallel.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ReflectionResult } from './types'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const BO_CHAT_ID = '7240677590'

// Session-scoped counters — reset per process.
let revenueAppendCount = 0
let openQuestionQueued = false

const REVENUE_KEYWORDS = /revenue|affiliate|money|earn|income|pricing|competitor|sell/i

// ─── Telegram helper ────────────────────────────────────────────────────────

async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const body = JSON.stringify({ chat_id: BO_CHAT_ID, text: message })

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

// ─── Check 1: Repeated mistake alert ────────────────────────────────────────

async function checkRepeatedMistakes(result: ReflectionResult): Promise<void> {
  try {
    const promotedDir = path.join(VAULT_ROOT, '05-knowledge', 'instincts', 'promoted')

    let files: string[]
    try {
      files = await fs.readdir(promotedDir)
    } catch {
      return // dir doesn't exist yet — nothing to count
    }

    // Count .md files with `kind: mistake` in frontmatter.
    let mistakeCount = 0
    for (const f of files) {
      if (!f.endsWith('.md')) continue
      try {
        const raw = await fs.readFile(path.join(promotedDir, f), 'utf8')
        if (/^kind:\s*mistake\s*$/m.test(raw)) mistakeCount++
      } catch {
        // skip unreadable files
      }
    }

    if (mistakeCount < 3) return

    const highConfidenceMistake = result.mistakes.find((m) => m.confidence >= 0.7)
    if (!highConfidenceMistake) return

    // Check daily note for today's alert marker — skip if already sent.
    const today = new Date().toISOString().slice(0, 10)
    const dailyFile = path.join(VAULT_ROOT, '01-daily', `${today}.md`)
    const ALERT_MARKER = '<!-- mistake-pattern-alerted -->'

    let dailyContent = ''
    try {
      dailyContent = await fs.readFile(dailyFile, 'utf8')
    } catch {
      // file may not exist — that's fine, we'll append to it below
    }

    if (dailyContent.includes(ALERT_MARKER)) return

    // Send alert.
    const snippet = highConfidenceMistake.avoidance.slice(0, 120)
    await sendTelegram(
      `PATTERN: ${mistakeCount} mistakes logged. Latest: "${snippet}". Want me to add a standing rule?`,
    )

    // Write the marker to today's daily note (append, don't overwrite).
    try {
      await fs.appendFile(dailyFile, `\n${ALERT_MARKER}\n`, 'utf8')
    } catch {
      // best-effort; don't let this kill the check
    }
  } catch {
    // non-throwing
  }
}

// ─── Check 2: Revenue intel detection ───────────────────────────────────────

async function checkRevenueIntel(result: ReflectionResult): Promise<void> {
  try {
    if (revenueAppendCount >= 3) return

    const revenuePatterns = result.cognitivePatterns.filter((cp) =>
      REVENUE_KEYWORDS.test(cp.pattern),
    )
    if (revenuePatterns.length === 0) return

    const intelFile = path.join(VAULT_ROOT, 'REVENUE_INTEL.md')
    const date = new Date().toISOString().slice(0, 10)

    // Append up to the remaining budget.
    const remaining = 3 - revenueAppendCount
    const toAppend = revenuePatterns.slice(0, remaining)

    const lines = toAppend
      .map(
        (cp) =>
          `\n[${date}] [reflection] ${cp.pattern} — confidence ${cp.confidence.toFixed(2)}`,
      )
      .join('')

    await fs.appendFile(intelFile, lines, 'utf8')
    revenueAppendCount += toAppend.length
  } catch {
    // non-throwing
  }
}

// ─── Check 3: Open question auto-queue ──────────────────────────────────────

async function checkOpenQuestions(result: ReflectionResult): Promise<void> {
  try {
    if (openQuestionQueued) return

    const highConfQuestion = result.openQuestions.find((q) => q.confidence >= 0.8)
    if (!highConfQuestion) return

    const queueFile = path.join(VAULT_ROOT, 'RESEARCH-QUEUE.md')
    const timestamp = new Date().toISOString()
    const line = `\n- [ ] ${highConfQuestion.question} <!-- added: ${timestamp}, notes: auto-queued from reflection -->`

    await fs.appendFile(queueFile, line, 'utf8')
    openQuestionQueued = true
  } catch {
    // non-throwing
  }
}

// ─── Check 4: Etsy opportunity scanner ──────────────────────────────────────

const ETSY_KEYWORDS = ['etsy', 'listing', 'print', 'product', 'sell', 'store', 'shop', 'hunting', 'niche', 'merch']

async function checkEtsyOpportunities(transcript: string): Promise<void> {
  try {
    const lower = transcript.toLowerCase()
    const matched = ETSY_KEYWORDS.filter((kw) => lower.includes(kw))
    if (matched.length < 2) return

    const intelFile = path.join(VAULT_ROOT, 'REVENUE_INTEL.md')
    const date = new Date().toISOString().slice(0, 10)
    const line = `\n- [${date}] Etsy signal detected in conversation: ${matched.join(', ')}`

    await fs.appendFile(intelFile, line, 'utf8')
  } catch {
    // non-throwing
  }
}

// ─── Public entry point ──────────────────────────────────────────────────────

export async function checkAndTriggerPatterns(
  result: ReflectionResult,
  transcript?: string,
): Promise<void> {
  await Promise.all([
    checkRepeatedMistakes(result),
    checkRevenueIntel(result),
    checkOpenQuestions(result),
    checkEtsyOpportunities(transcript ?? ''),
  ])
}
