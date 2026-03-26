import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MARCUS_TOKEN = process.env.MARCUS_TELEGRAM_TOKEN ?? '8667240819:AAHQds02Ecu8v-gjQg0Pq7pt1biLfYZCDd0'
const BO_CHAT_ID   = parseInt(process.env.MARCUS_BO_CHAT_ID ?? '7240677590')
const TG_API       = `https://api.telegram.org/bot${MARCUS_TOKEN}`
const FIREWORKS_KEY   = process.env.FIREWORKS_API_KEY ?? ''
const FIREWORKS_MODEL = 'accounts/fireworks/models/kimi-k2p5'
const TAVILY_KEY      = process.env.TAVILY_API_KEY ?? ''
const GITHUB_TOKEN    = process.env.GITHUB_TOKEN ?? ''
const MEMORY_REPO     = 'bobellconstulting-creator/neuradexai-site'

async function readMemory(): Promise<string> {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${MEMORY_REPO}/contents/marcus-memory/MEMORY.md`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    )
    if (!r.ok) return ''
    const data = await r.json() as { content?: string }
    return data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : ''
  } catch { return '' }
}

async function webSearch(query: string): Promise<string> {
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: TAVILY_KEY, query, max_results: 3, include_answer: true }),
    })
    const data = await r.json() as { answer?: string; results?: Array<{ title: string; content: string }> }
    const parts: string[] = []
    if (data.answer) parts.push(data.answer)
    for (const res of (data.results ?? []).slice(0, 3)) parts.push(`${res.title}: ${res.content.slice(0, 150)}`)
    return parts.join('\n\n') || 'No results.'
  } catch { return 'Search failed.' }
}

async function tgSend(text: string): Promise<void> {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: BO_CHAT_ID, text, parse_mode: 'Markdown' }),
  })
}

async function morningBrief(): Promise<void> {
  const memory = await readMemory()
  const hour = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: true })

  // Search for relevant news
  const news = await webSearch('AI agent business tools revenue 2025 site:twitter.com OR site:reddit.com OR site:hackernews.com')

  const prompt = `You are Marcus. It is ${hour} CT. Morning brief time.

MEMORY:
${memory.slice(0, 2000)}

RECENT NEWS/INTEL:
${news.slice(0, 1000)}

Write a morning brief for Bo. 3-5 sentences max. What's worth knowing today? Any market moves, opportunities, or things to watch? Be specific. Lead with the most interesting thing. Casual but sharp — like a buddy who's been up reading since 6am. No padding. No "Good morning!"`

  const r = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FIREWORKS_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 300,
    }),
  })
  const data = await r.json() as { choices: Array<{ message: { content: string } }> }
  const brief = data.choices[0].message.content
  await tgSend(brief)
}

async function heartbeat(): Promise<void> {
  const sites = [
    'https://neuradexai.vercel.app',
    'https://codespacebuckgrid.vercel.app',
  ]
  const down: string[] = []
  for (const url of sites) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!r.ok) down.push(`${url} — ${r.status}`)
    } catch {
      down.push(`${url} — DOWN`)
    }
  }
  if (down.length > 0) {
    await tgSend(`*Site alert:*\n${down.join('\n')}`)
  }
  // Silence is fine — only ping Bo if something's wrong
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const job = req.nextUrl.searchParams.get('job') ?? 'heartbeat'

  try {
    if (job === 'morning') await morningBrief()
    else await heartbeat()
    return NextResponse.json({ ok: true, job, ran: new Date().toISOString() })
  } catch (e) {
    console.error('Marcus cron error:', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
