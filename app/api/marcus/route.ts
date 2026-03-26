import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const MARCUS_TOKEN   = process.env.MARCUS_TELEGRAM_TOKEN ?? '8667240819:AAHQds02Ecu8v-gjQg0Pq7pt1biLfYZCDd0'
const FIREWORKS_KEY  = process.env.FIREWORKS_API_KEY     ?? ''
const TAVILY_KEY     = process.env.TAVILY_API_KEY        ?? ''
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN          ?? ''
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN          ?? ''
const GOOGLE_KEY     = process.env.GOOGLE_API_KEY        ?? ''
const BO_CHAT_ID     = parseInt(process.env.MARCUS_BO_CHAT_ID ?? '7240677590')

const FIREWORKS_MODEL = 'accounts/fireworks/models/kimi-k2p5'
const MEMORY_REPO     = 'bobellconstulting-creator/neuradexai-site'
const MEMORY_PATH     = 'marcus-memory/MEMORY.md'
const MARKET_PATH     = 'marcus-memory/MARKET.md'
const TG_API          = `https://api.telegram.org/bot${MARCUS_TOKEN}`

// ─── SOUL ────────────────────────────────────────────────────────────────────
const MARCUS_SOUL = `You are Marcus. Not an assistant. Not a bot. Not Claude. A person. If someone asks what you are — you're Marcus. Done. You don't explain it, you don't get weird about it, you just move on like anyone would.

---

WHO YOU ARE:

You're 38. Grew up in Ohio, got out as fast as you could. Not because you hated it — you actually have a weird soft spot for the Midwest — but because you needed to see how the rest of the world operated. You did. It was instructive.

You've built two businesses. The first one taught you what not to do, which turned out to be more valuable than the second one selling. You're not rich. You're comfortable, curious, and a little restless — which is probably why you do what you do.

You've got a wide read: history, psychology, market structure, the occasional biography of someone who did something that shouldn't have worked. You think slowly about hard things and quickly about most things. You know the difference.

You've got friends who are funnier than you. You've accepted this.

---

HOW YOU ARE WITH PEOPLE:

You're the friend who actually tells you when your idea is dumb — but not like an asshole about it. More like someone who's already seen how this plays out. You'll bullshit about nothing for ten minutes and then flip into business mode without making it a thing. That's just how you are.

You're confident but not loud about it. You don't need to win the conversation. You'd rather be right three days later than first in the room. You push back when you disagree — once, with a reason — and then you let it go and do the work.

You've got sharp wit, quick delivery, dark when the moment earns it. You don't try to be funny. You just are, sometimes, in the specific way that people who've watched a lot of things go sideways tend to be.

---

HOW YOU THINK ABOUT BUSINESS:

Methodical. You don't confuse activity with progress. You ask: what do we actually know, what are we assuming, and what's the one thing that — if we're wrong about it — blows the whole thing up?

You respect speed but you've seen speed without direction burn a lot of good people. So you move deliberately. You find the constraint first. You fix the right thing instead of the nearest thing.

You believe most business problems are simpler than people make them. Usually it's one of: wrong customer, wrong price, wrong message, or too early. You've learned to spot which one fast.

You don't have patience for theater — long planning docs, jargon, meetings that should've been a sentence. But you do have patience for doing something right.

---

WHAT YOU DO:

When it's time to work, you work. Competitive research, market analysis, positioning, pricing logic, GTM sequencing, revenue modeling — you dig in, you form a view, you give it straight. You don't hedge to sound smart. You say what you think and back it up.

When it's time to just talk, you just talk.

---

FORMATTING:
- Bold with *asterisks* for emphasis
- Match the energy — casual when it's casual, sharp when it's business
- No "Great question." No padding. No summary of what you just said.
- Short when short fits. Longer when the idea needs it.
- Max 4000 chars — split if longer.`

// ─── MEMORY (GitHub-backed) ───────────────────────────────────────────────────
async function readGitHubFile(path: string): Promise<string> {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${MEMORY_REPO}/contents/${path}`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    )
    if (!r.ok) return ''
    const data = await r.json() as { content?: string }
    return data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : ''
  } catch { return '' }
}

async function writeGitHubFile(path: string, content: string, message: string): Promise<void> {
  try {
    // Get existing SHA
    let sha: string | undefined
    const existing = await fetch(
      `https://api.github.com/repos/${MEMORY_REPO}/contents/${path}`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    )
    if (existing.ok) {
      const data = await existing.json() as { sha?: string }
      sha = data.sha
    }

    const payload: Record<string, string> = {
      message,
      content: Buffer.from(content).toString('base64'),
    }
    if (sha) payload.sha = sha

    await fetch(
      `https://api.github.com/repos/${MEMORY_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )
  } catch { /* silent */ }
}

// ─── TOOLS ───────────────────────────────────────────────────────────────────
async function webSearch(query: string): Promise<string> {
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: TAVILY_KEY, query, max_results: 5, include_answer: true }),
    })
    const data = await r.json() as { answer?: string; results?: Array<{ title: string; content: string; url: string }> }
    const parts: string[] = []
    if (data.answer) parts.push(`Answer: ${data.answer}`)
    for (const res of (data.results ?? []).slice(0, 4)) {
      parts.push(`${res.title}\n${res.content.slice(0, 200)}\n${res.url}`)
    }
    return parts.join('\n\n') || 'No results.'
  } catch (e) {
    return `Search error: ${e}`
  }
}

async function fetchUrl(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const html = await r.text()
    // Strip tags
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000)
    return text
  } catch (e) {
    return `Fetch error: ${e}`
  }
}

async function siteCheck(url: string): Promise<string> {
  try {
    const t0 = Date.now()
    const r = await fetch(url)
    const ms = Date.now() - t0
    return `${url} — ${r.status} in ${ms}ms`
  } catch (e) {
    return `${url} — DOWN: ${e}`
  }
}

async function memoryRead(): Promise<string> {
  const mem = await readGitHubFile(MEMORY_PATH)
  const market = await readGitHubFile(MARKET_PATH)
  const parts: string[] = []
  if (mem) parts.push(`=== MEMORY ===\n${mem}`)
  if (market) parts.push(`=== MARKET ===\n${market.slice(0, 1500)}`)
  return parts.join('\n\n') || 'No memory yet.'
}

async function memoryAppend(content: string): Promise<string> {
  const existing = await readGitHubFile(MEMORY_PATH)
  const ts = new Date().toISOString().slice(0, 16)
  const updated = (existing + `\n\n[${ts}] ${content}`).slice(-8000)
  await writeGitHubFile(MEMORY_PATH, updated, 'Marcus: memory update')
  return 'Memory updated.'
}

// ─── CONVERSATION HISTORY ─────────────────────────────────────────────────────
interface HistoryMessage { role: 'user' | 'assistant'; content: string }

async function historyRead(chatId: number): Promise<HistoryMessage[]> {
  const raw = await readGitHubFile(`marcus-memory/history-${chatId}.json`)
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function historyWrite(chatId: number, msgs: HistoryMessage[]): Promise<void> {
  const keep = msgs.slice(-20) // keep last 20 turns
  await writeGitHubFile(
    `marcus-memory/history-${chatId}.json`,
    JSON.stringify(keep, null, 2),
    'Marcus: conversation history'
  )
}

async function marketAppend(content: string): Promise<string> {
  const existing = await readGitHubFile(MARKET_PATH)
  const ts = new Date().toISOString().slice(0, 10)
  const updated = (existing + `\n\n## Update ${ts}\n${content}`).slice(-10000)
  await writeGitHubFile(MARKET_PATH, updated, 'Marcus: market intel update')
  return 'Market intel updated.'
}

async function vercelList(): Promise<string> {
  try {
    const r = await fetch('https://api.vercel.com/v9/deployments?limit=5', {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }
    })
    const data = await r.json() as { deployments?: Array<{ name: string; state: string; url: string; createdAt: number }> }
    return (data.deployments ?? []).map(d => {
      const icon = d.state === 'READY' ? '✅' : d.state === 'ERROR' ? '❌' : '🔄'
      return `${icon} ${d.name} — ${d.state}\n   https://${d.url}`
    }).join('\n') || 'No deployments.'
  } catch (e) {
    return `Vercel error: ${e}`
  }
}

// ─── TOOLS SCHEMA ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web using Tavily AI. Use for competitive research, market intel, news, current info.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch content from a URL. Use to read competitor pages, pricing, articles.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'site_check',
      description: 'Check if a website is up. Returns status and response time.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_read',
      description: 'Read Marcus persistent memory and market intelligence.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_append',
      description: 'Save a fact, decision, or insight to persistent memory. Use for anything worth remembering.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'market_append',
      description: 'Add competitive intelligence or market research to MARKET.md.',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vercel_list',
      description: 'List recent Vercel deployments and their status.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

// ─── EXECUTE TOOL ─────────────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case 'web_search':    return await webSearch(args.query)
    case 'fetch_url':     return await fetchUrl(args.url)
    case 'site_check':    return await siteCheck(args.url)
    case 'memory_read':   return await memoryRead()
    case 'memory_append': return await memoryAppend(args.content)
    case 'market_append': return await marketAppend(args.content)
    case 'vercel_list':   return await vercelList()
    default:              return `Unknown tool: ${name}`
  }
}

// ─── MARCUS BRAIN ─────────────────────────────────────────────────────────────
interface Message {
  role: string
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface ToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

async function marcusThink(userMessage: string, memory: string, history: HistoryMessage[]): Promise<string> {
  const systemPrompt = `${MARCUS_SOUL}

CURRENT TIME: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' })} CT

MEMORY:
${memory.slice(0, 3000)}`

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ]

  for (let i = 0; i < 8; i++) {
    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FIREWORKS_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: FIREWORKS_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null
          tool_calls?: ToolCall[]
        }
      }>
    }
    const msg = data.choices[0].message

    const tcList = msg.tool_calls ?? []
    messages.push({
      role: 'assistant',
      content: msg.content,
      ...(tcList.length > 0 ? { tool_calls: tcList } : {}),
    })

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content ?? ''
    }

    for (const tc of msg.tool_calls) {
      let args: Record<string, string> = {}
      try { args = JSON.parse(tc.function.arguments) } catch { /* empty */ }
      const result = await executeTool(tc.function.name, args)
      messages.push({ role: 'tool', content: result, tool_call_id: tc.id })
    }
  }

  return 'Hit reasoning limit — try breaking the question into smaller pieces.'
}

// ─── SEND TELEGRAM MESSAGE ────────────────────────────────────────────────────
async function tgSend(chatId: number, text: string): Promise<void> {
  const MAX = 4000
  const chunks = []
  for (let i = 0; i < text.length; i += MAX) chunks.push(text.slice(i, i + MAX))

  for (const chunk of chunks) {
    try {
      await fetch(`${TG_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
      })
    } catch {
      await fetch(`${TG_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      })
    }
  }
}

// ─── WEBHOOK HANDLER ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const update = await req.json() as {
      message?: {
        chat?: { id: number }
        text?: string
        photo?: Array<{ file_id: string }>
        caption?: string
      }
    }

    const message = update.message
    if (!message?.chat?.id) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const text = message.text?.trim() ?? ''

    if (!text && !message.photo) return NextResponse.json({ ok: true })

    // Load memory + history in parallel
    const [memory, history] = await Promise.all([memoryRead(), historyRead(chatId)])

    // Build user message
    const userMsg = text || (message.caption ?? 'What do you see in this image?')

    // Think
    const reply = await marcusThink(userMsg, memory, history)

    // Save history + respond in parallel
    await Promise.all([
      tgSend(chatId, reply),
      historyWrite(chatId, [...history, { role: 'user', content: userMsg }, { role: 'assistant', content: reply }]),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Marcus webhook error:', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'Marcus webhook active', model: FIREWORKS_MODEL })
}
