/**
 * GET /api/jarvis/inbox-process — Cron endpoint.
 *
 * Reads all .md files in COG/00-inbox/, classifies each via Gemini 2.5 Flash,
 * routes them to the appropriate COG location, and creates a .done marker to
 * prevent reprocessing. Notifies Bo via Telegram if any note contained a
 * Jarvis action item.
 *
 * Schedule: OpenClaw cron (daily at 9am CT via jobs.json)
 */
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Constants ────────────────────────────────────────────────────────────────

const VAULT_ROOT  = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const INBOX_DIR   = path.join(VAULT_ROOT, '00-inbox')
const DAILY_DIR   = path.join(VAULT_ROOT, '01-daily')
const TOPICS_DIR  = path.join(VAULT_ROOT, '05-knowledge', 'topics')
const QUEUE_FILE  = path.join(VAULT_ROOT, 'RESEARCH-QUEUE.md')

const CRON_SECRET = process.env.CRON_SECRET
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID     = process.env.JARVIS_OWNER_CHAT_ID ?? '7240677590'

const GEMINI_MODEL    = 'gemini-2.5-flash-preview-04-17'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GEMINI_TIMEOUT  = 10_000

// ─── Types ────────────────────────────────────────────────────────────────────

type NoteAction = 'queue_research' | 'create_task' | 'file_to_knowledge' | 'file_to_daily' | 'no_action'
type NoteType   = 'task' | 'idea' | 'research' | 'fact' | 'reference'

interface ClassifiedNote {
  type: NoteType
  title: string
  summary: string
  action: NoteAction
  tags: string[]
  jarvis_todo: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// ─── Gemini classification ─────────────────────────────────────────────────────

async function classifyNote(content: string, apiKey: string): Promise<ClassifiedNote> {
  const prompt = `Classify this note and return JSON only (no markdown fences):
{
  "type": "task" | "idea" | "research" | "fact" | "reference",
  "title": "short title (max 80 chars)",
  "summary": "one sentence summary",
  "action": "queue_research" | "create_task" | "file_to_knowledge" | "file_to_daily" | "no_action",
  "tags": ["tag1", "tag2"],
  "jarvis_todo": true | false
}

Rules:
- jarvis_todo = true if the note contains #jarvis, #todo, or action items directed at Jarvis
- action "queue_research" for topics needing investigation
- action "create_task" for concrete tasks Bo needs done
- action "file_to_knowledge" for facts, references, or ideas to keep
- action "file_to_daily" for quick journal-style notes
- Return ONLY the JSON object

Note content:
${content.slice(0, 4000)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT)

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
    })

    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`)
    }

    const data: unknown = await res.json()

    // Navigate Gemini response envelope safely
    if (
      typeof data !== 'object' || data === null ||
      !('candidates' in data) || !Array.isArray((data as Record<string, unknown>).candidates)
    ) {
      throw new Error('unexpected Gemini response shape')
    }

    const candidates = (data as { candidates: unknown[] }).candidates
    const first = candidates[0]
    if (
      typeof first !== 'object' || first === null ||
      !('content' in first)
    ) {
      throw new Error('no candidates in Gemini response')
    }

    const contentObj = (first as { content: unknown }).content
    if (
      typeof contentObj !== 'object' || contentObj === null ||
      !('parts' in contentObj) || !Array.isArray((contentObj as Record<string, unknown>).parts)
    ) {
      throw new Error('no parts in Gemini candidate')
    }

    const parts = (contentObj as { parts: unknown[] }).parts
    const textPart = parts[0]
    if (typeof textPart !== 'object' || textPart === null || !('text' in textPart)) {
      throw new Error('no text in Gemini part')
    }

    const rawJson = (textPart as { text: string }).text
    const parsed: unknown = JSON.parse(rawJson)

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Gemini returned non-object JSON')
    }

    const p = parsed as Record<string, unknown>
    return {
      type:        (p.type        as NoteType)   ?? 'reference',
      title:       (p.title       as string)     ?? 'Untitled',
      summary:     (p.summary     as string)     ?? '',
      action:      (p.action      as NoteAction) ?? 'no_action',
      tags:        Array.isArray(p.tags) ? (p.tags as string[]) : [],
      jarvis_todo: (p.jarvis_todo as boolean)    ?? false,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Routing actions ───────────────────────────────────────────────────────────

async function queueResearch(title: string, filename: string, date: string): Promise<void> {
  await fs.mkdir(path.dirname(QUEUE_FILE), { recursive: true })
  const existing = await readIfExists(QUEUE_FILE) ?? ''
  const entry = `- [ ] ${title} <!-- from inbox: ${filename}, added: ${date} -->\n`
  await fs.appendFile(QUEUE_FILE, entry, 'utf8')
  // If queue file was empty/new, ensure it has a header
  if (!existing.trim()) {
    const header = `# Research Queue\n\n`
    await fs.writeFile(QUEUE_FILE, header + entry, 'utf8')
  }
}

async function fileToKnowledge(slug: string, title: string, content: string, tags: string[], date: string): Promise<void> {
  const topicDir  = path.join(TOPICS_DIR, slug)
  const indexFile = path.join(topicDir, 'index.md')

  await fs.mkdir(topicDir, { recursive: true })

  const existing = await readIfExists(indexFile)
  if (existing) {
    // Append a dated section rather than overwrite
    await fs.appendFile(indexFile, `\n---\n_Added ${date}_\n\n${content}\n`, 'utf8')
  } else {
    const tagLine = tags.length > 0 ? `tags: [${tags.join(', ')}]\n` : ''
    const header  = `---\ntitle: ${title}\ndate: ${date}\n${tagLine}---\n\n`
    await fs.writeFile(indexFile, header + content, 'utf8')
  }
}

async function fileToDaily(content: string, title: string, date: string): Promise<void> {
  await fs.mkdir(DAILY_DIR, { recursive: true })
  const dailyFile = path.join(DAILY_DIR, `${date}.md`)
  const existing  = await readIfExists(dailyFile)
  const entry     = `\n## Inbox: ${title}\n\n${content}\n`

  if (existing) {
    await fs.appendFile(dailyFile, entry, 'utf8')
  } else {
    await fs.writeFile(dailyFile, `# ${date}\n${entry}`, 'utf8')
  }
}

async function createTaskViaApi(title: string, summary: string, baseUrl: string): Promise<void> {
  await fetch(`${baseUrl}/api/jarvis/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description: summary, priority: 'medium' }),
  })
  // Non-fatal — don't throw; task creation failure shouldn't abort inbox processing
}

// ─── Telegram notification ─────────────────────────────────────────────────────

async function sendTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  }).catch(() => {
    // Telegram failure is non-fatal
  })
}

// ─── Base URL ──────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL)   return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('[inbox-process] GOOGLE_API_KEY not set')
    return NextResponse.json({ ok: false, error: 'GOOGLE_API_KEY not configured' }, { status: 500 })
  }

  // If inbox directory doesn't exist yet, nothing to process
  try {
    await fs.mkdir(INBOX_DIR, { recursive: true })
  } catch {
    // already exists
  }

  let entries: string[]
  try {
    entries = await fs.readdir(INBOX_DIR)
  } catch {
    return NextResponse.json({ ok: true, processed: 0, actions: [] })
  }

  const mdFiles = entries.filter((f) => f.endsWith('.md'))

  if (mdFiles.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, actions: [] })
  }

  const date     = todayDate()
  const baseUrl  = getBaseUrl()
  const actions: string[] = []
  const todoNotes: string[] = []
  let processed = 0

  for (const filename of mdFiles) {
    const donePath    = path.join(INBOX_DIR, `${filename}.done`)
    const filePath    = path.join(INBOX_DIR, filename)

    // Skip already-processed files
    const alreadyDone = await readIfExists(donePath)
    if (alreadyDone !== null) continue

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      console.error(`[inbox-process] failed to read ${filename}:`, getErrorMessage(err))
      continue
    }

    let classified: ClassifiedNote
    try {
      classified = await classifyNote(content, apiKey)
    } catch (err) {
      console.error(`[inbox-process] Gemini failed for ${filename}:`, getErrorMessage(err))
      // Mark done anyway to avoid infinite retry on bad files
      await fs.writeFile(donePath, `error: ${getErrorMessage(err)}`, 'utf8').catch(() => {})
      continue
    }

    const { title, summary, action, tags, jarvis_todo } = classified
    const slug = slugify(title || path.basename(filename, '.md'))

    try {
      switch (action) {
        case 'queue_research':
          await queueResearch(title, filename, date)
          actions.push(`queued research: "${title}"`)
          break

        case 'create_task':
          await createTaskViaApi(title, summary, baseUrl)
          actions.push(`created task: "${title}"`)
          break

        case 'file_to_knowledge':
          await fileToKnowledge(slug, title, content, tags, date)
          actions.push(`filed to knowledge: "${title}" → topics/${slug}/`)
          break

        case 'file_to_daily':
          await fileToDaily(content, title, date)
          actions.push(`appended to daily: "${title}"`)
          break

        default:
          actions.push(`no action taken: "${title}"`)
          break
      }
    } catch (err) {
      console.error(`[inbox-process] routing failed for ${filename}:`, getErrorMessage(err))
      actions.push(`routing error for "${title}": ${getErrorMessage(err)}`)
    }

    if (jarvis_todo) {
      todoNotes.push(`• ${title} — ${summary} (action: ${action})`)
    }

    // Write .done marker regardless of routing outcome
    await fs.writeFile(
      donePath,
      JSON.stringify({ processedAt: new Date().toISOString(), title, action, tags }),
      'utf8',
    ).catch((err) => {
      console.error(`[inbox-process] failed to write .done for ${filename}:`, getErrorMessage(err))
    })

    processed++
  }

  // Notify Bo if any notes had Jarvis action items
  if (todoNotes.length > 0) {
    const msg = [
      `JARVIS inbox processed ${processed} note(s). Items requiring your attention:`,
      '',
      ...todoNotes,
      '',
      `Actions taken: ${actions.length}`,
    ].join('\n')

    await sendTelegram(msg)
  }

  console.log(`[inbox-process] processed=${processed} actions=${actions.length}`)
  return NextResponse.json({ ok: true, processed, actions })
}
