export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

const VAULT_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const PROMOTED_DIR = path.join(VAULT_ROOT, '05-knowledge', 'instincts', 'promoted')
const PENDING_DIR = path.join(VAULT_ROOT, '05-knowledge', 'instincts', 'pending')
const DAILY_DIR = path.join(VAULT_ROOT, '01-daily')

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseFrontmatterField(raw: string, key: string): string | undefined {
  const m = raw.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return m?.[1]?.trim()
}

async function readMdFiles(dir: string, today: string): Promise<Array<{ title: string; body: string }>> {
  let entries: string[]
  try {
    entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }

  const results: Array<{ title: string; body: string }> = []
  for (const file of entries) {
    let raw: string
    try {
      raw = await fs.readFile(path.join(dir, file), 'utf8')
    } catch {
      continue
    }
    const createdAt = parseFrontmatterField(raw, 'createdAt') ?? ''
    if (!createdAt.startsWith(today)) continue
    const titleLine = parseFrontmatterField(raw, 'title') ?? file.replace('.md', '')
    const title = titleLine.startsWith('"') ? (JSON.parse(titleLine) as string) : titleLine
    const bodyMatch = raw.match(/^---[\s\S]*?---\n([\s\S]*)$/)
    const body = bodyMatch ? bodyMatch[1].replace(/^#\s.*\n/, '').trim() : ''
    results.push({ title, body })
  }
  return results
}

async function buildBrief(today: string): Promise<{ brief: string; instinctsRead: number }> {
  const [promoted, pending] = await Promise.all([
    readMdFiles(PROMOTED_DIR, today),
    readMdFiles(PENDING_DIR, today),
  ])
  const instincts = [...promoted, ...pending]

  let dailyContent = ''
  try {
    const raw = await fs.readFile(path.join(DAILY_DIR, `${today}.md`), 'utf8')
    dailyContent = raw.slice(0, 2000)
  } catch {
    // no daily note — fine
  }

  if (instincts.length === 0 && !dailyContent) {
    return {
      brief: `JARVIS DAILY BRIEF — ${today}\n\nNo activity logged today.`,
      instinctsRead: 0,
    }
  }

  const instinctBlock = instincts.length > 0
    ? instincts.map((i) => `- **${i.title}**: ${i.body.slice(0, 200)}`).join('\n')
    : '(none)'

  const prompt = `You are Jarvis's end-of-day synthesis module. Review today's activity and produce a tight 5-bullet brief for Bo Bell.

TODAY'S INSTINCTS LEARNED:
${instinctBlock}

TODAY'S ACTIVITY:
${dailyContent || '(no daily note)'}

Output EXACTLY this format (no other text):
JARVIS DAILY BRIEF — ${today}

• <learning or decision 1>
• <learning or decision 2>
• <learning or decision 3>
• <learning or decision 4>
• <learning or decision 5>

<one-sentence closing observation about today's trajectory>`

  let brief: string
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    )
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    brief = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    if (!brief) throw new Error('empty response')
  } catch {
    // Fallback: title-only brief
    const bullets = instincts.slice(0, 5).map((i) => `• ${i.title}`).join('\n')
    brief = `JARVIS DAILY BRIEF — ${today}\n\n${bullets || '• (no instincts today)'}\n\nGemini unavailable — title-only fallback.`
  }

  return { brief, instinctsRead: instincts.length }
}

export async function GET(): Promise<NextResponse> {
  try {
    const today = todayUTC()
    const { brief, instinctsRead } = await buildBrief(today)

    // Write synthesis file
    const synthPath = path.join(DAILY_DIR, `${today}-synthesis.md`)
    await fs.mkdir(DAILY_DIR, { recursive: true })
    await fs.writeFile(synthPath, brief, 'utf8')

    // Send Telegram
    let sent = false
    try {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: '7240677590', text: brief }),
        },
      )
      sent = tgRes.ok
    } catch {
      // best effort
    }

    return NextResponse.json({ ok: true, date: today, instinctsRead, sent })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message ?? String(err) }, { status: 500 })
  }
}
