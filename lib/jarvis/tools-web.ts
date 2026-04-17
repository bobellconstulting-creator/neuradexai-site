/**
 * Jarvis web, system, GitHub, and Telegram tools.
 *
 * Covers: web search (Tavily), URL fetching, GitHub ops, Telegram messaging,
 * system info, and Vercel deployment triggers.
 *
 * All free-first: Tavily free tier, GitHub API (PAT), Telegram Bot API, Vercel API.
 * No paid services wired as default.
 *
 * All functions accept `raw: unknown` and parse with their Zod schema — same
 * convention as tools.ts so they slot into JARVIS_TOOLS without type errors.
 */
import { z } from 'zod'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// ──────────────────────────────────────────────────────────────────────────
// Shared result type (mirrors ToolResult in tools.ts — receipt is required)
// ──────────────────────────────────────────────────────────────────────────

interface WebToolResult {
  ok: boolean
  error?: string
  receipt: string
  [key: string]: unknown
}

function fail(tool: string, error: string): WebToolResult {
  return { ok: false, error, receipt: `${tool}: FAIL — ${error}` }
}

// ──────────────────────────────────────────────────────────────────────────
// searchWeb — Tavily API
// ──────────────────────────────────────────────────────────────────────────

export const searchWebSchema = z.object({
  query: z.string().min(1).max(400).describe('Search query'),
  count: z.number().int().min(1).max(10).default(5).describe('Number of results. Default 5.'),
  topic: z.enum(['general', 'news']).default('general').describe("'news' for recent events, 'general' otherwise."),
})

export async function searchWeb(raw: unknown): Promise<WebToolResult> {
  const { query, count, topic } = searchWebSchema.parse(raw)
  const key = process.env.TAVILY_API_KEY
  if (!key) return fail('searchWeb', 'TAVILY_API_KEY not set')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: count,
      topic,
      include_answer: true,
      include_raw_content: false,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return fail('searchWeb', `Tavily ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json() as {
    answer?: string
    results: Array<{ title: string; url: string; content: string; score: number }>
  }

  const results = (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content?.slice(0, 300),
    score: r.score,
  }))

  return { ok: true, answer: data.answer ?? null, results, receipt: `searchWeb: "${query}" → ${results.length} results` }
}

// ──────────────────────────────────────────────────────────────────────────
// fetchUrl — HTTP GET + text extraction
// ──────────────────────────────────────────────────────────────────────────

export const fetchUrlSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  maxChars: z.number().int().min(100).max(20000).default(4000).describe('Max characters to return. Default 4000.'),
})

export async function fetchUrl(raw: unknown): Promise<WebToolResult> {
  const { url, maxChars } = fetchUrlSchema.parse(raw)

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JarvisBot/1.0)',
      Accept: 'text/html,text/plain,application/json',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) return fail('fetchUrl', `HTTP ${res.status} from ${url}`)

  const contentType = res.headers.get('content-type') ?? ''
  const raw2 = await res.text()

  const text = contentType.includes('html')
    ? raw2
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    : raw2

  const content = text.slice(0, maxChars)
  return { ok: true, url, content, truncated: text.length > maxChars, receipt: `fetchUrl: ${url}` }
}

// ──────────────────────────────────────────────────────────────────────────
// githubOps — GitHub API operations
// ──────────────────────────────────────────────────────────────────────────

export const githubOpsSchema = z.object({
  action: z.enum([
    'listPRs',
    'listIssues',
    'createIssue',
    'commentOnIssue',
    'listRepos',
    'getCommits',
  ]).describe('Action to perform'),
  repo: z.string().optional().describe("Repo in 'owner/name' format. Defaults to 'bobellconstulting-creator/neuradexai-site'."),
  title: z.string().optional().describe('Issue title (createIssue)'),
  body: z.string().optional().describe('Issue body or comment text'),
  number: z.number().int().optional().describe('Issue or PR number (commentOnIssue)'),
  limit: z.number().int().min(1).max(30).default(10).describe('Max results. Default 10.'),
})

export async function githubOps(raw: unknown): Promise<WebToolResult> {
  const { action, repo: repoArg, title, body, number, limit } = githubOpsSchema.parse(raw)
  const token = process.env.GITHUB_TOKEN
  if (!token) return fail('githubOps', 'GITHUB_TOKEN not set')

  const repo = repoArg ?? 'bobellconstulting-creator/neuradexai-site'
  const base = 'https://api.github.com'
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  type GhResult = { ok: boolean; data?: unknown; error?: string; receipt: string }
  const gh = async (path: string, method = 'GET', bodyData?: unknown): Promise<GhResult> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    })
    const json = await res.json()
    if (!res.ok) {
      const msg = (json as { message?: string }).message ?? `GitHub ${res.status}`
      return { ok: false, error: msg, receipt: `githubOps: FAIL — ${msg}` }
    }
    return { ok: true, data: json, receipt: 'githubOps: ok' }
  }

  switch (action) {
    case 'listPRs': {
      const r = await gh(`/repos/${repo}/pulls?state=open&per_page=${limit}`)
      if (!r.ok) return r
      const prs = (r.data as Array<{ number: number; title: string; user: { login: string }; html_url: string; state: string }>).map((p) => ({
        number: p.number,
        title: p.title,
        author: p.user.login,
        url: p.html_url,
        state: p.state,
      }))
      return { ok: true, prs, receipt: `githubOps: listPRs ${repo} → ${prs.length}` }
    }
    case 'listIssues': {
      const r = await gh(`/repos/${repo}/issues?state=open&per_page=${limit}`)
      if (!r.ok) return r
      const issues = (r.data as Array<{ number: number; title: string; user: { login: string }; html_url: string; labels: Array<{ name: string }> }>).map((i) => ({
        number: i.number,
        title: i.title,
        author: i.user.login,
        url: i.html_url,
        labels: i.labels.map((l) => l.name),
      }))
      return { ok: true, issues, receipt: `githubOps: listIssues ${repo} → ${issues.length}` }
    }
    case 'createIssue': {
      if (!title) return fail('githubOps', 'title required for createIssue')
      const r = await gh(`/repos/${repo}/issues`, 'POST', { title, body: body ?? '' })
      if (!r.ok) return r
      const issue = r.data as { number: number; html_url: string }
      return { ok: true, number: issue.number, url: issue.html_url, receipt: `githubOps: created issue #${issue.number} in ${repo}` }
    }
    case 'commentOnIssue': {
      if (!number || !body) return fail('githubOps', 'number and body required for commentOnIssue')
      const r = await gh(`/repos/${repo}/issues/${number}/comments`, 'POST', { body })
      if (!r.ok) return r
      const comment = r.data as { id: number; html_url: string }
      return { ok: true, commentId: comment.id, url: comment.html_url, receipt: `githubOps: commented on #${number} in ${repo}` }
    }
    case 'listRepos': {
      const r = await gh(`/user/repos?sort=updated&per_page=${limit}`)
      if (!r.ok) return r
      const repos = (r.data as Array<{ full_name: string; description: string | null; updated_at: string; html_url: string }>).map((rp) => ({
        name: rp.full_name,
        description: rp.description,
        updatedAt: rp.updated_at,
        url: rp.html_url,
      }))
      return { ok: true, repos, receipt: `githubOps: listRepos → ${repos.length}` }
    }
    case 'getCommits': {
      const r = await gh(`/repos/${repo}/commits?per_page=${limit}`)
      if (!r.ok) return r
      const commits = (r.data as Array<{ sha: string; commit: { message: string; author: { name: string; date: string } }; html_url: string }>).map((c) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
      }))
      return { ok: true, commits, receipt: `githubOps: getCommits ${repo} → ${commits.length}` }
    }
    default:
      return fail('githubOps', `Unknown action: ${action}`)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// sendTelegramMessage — Telegram Bot API
// ──────────────────────────────────────────────────────────────────────────

export const sendTelegramMessageSchema = z.object({
  text: z.string().min(1).max(4000).describe('Message text. Markdown supported.'),
  chatId: z.string().optional().describe("Target chat ID. Defaults to Bo's chat ID (JARVIS_OWNER_CHAT_ID env)."),
  bot: z.enum(['jarvis', 'doc']).default('jarvis').describe("Which bot token to use. Default 'jarvis' (TELEGRAM_BOT_TOKEN)."),
  parseMode: z.enum(['Markdown', 'HTML', 'plain']).default('Markdown').describe('Telegram parse mode. Default Markdown.'),
})

export async function sendTelegramMessage(raw: unknown): Promise<WebToolResult> {
  const { text, chatId: chatIdArg, bot, parseMode } = sendTelegramMessageSchema.parse(raw)

  const token = bot === 'doc'
    ? process.env.DOC_TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN
    : process.env.TELEGRAM_BOT_TOKEN

  if (!token) return fail('sendTelegramMessage', 'TELEGRAM_BOT_TOKEN not set')

  const chatId = chatIdArg ?? process.env.JARVIS_OWNER_CHAT_ID
  if (!chatId) return fail('sendTelegramMessage', 'chatId not provided and JARVIS_OWNER_CHAT_ID not set')

  const bodyData: Record<string, unknown> = { chat_id: chatId, text }
  if (parseMode !== 'plain') bodyData.parse_mode = parseMode

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData),
  })

  const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string }
  if (!data.ok) return fail('sendTelegramMessage', data.description ?? 'Telegram error')

  return { ok: true, messageId: data.result?.message_id, receipt: `sendTelegramMessage: sent to ${chatId}` }
}

// ──────────────────────────────────────────────────────────────────────────
// systemInfo — CPU, memory, disk, uptime
// ──────────────────────────────────────────────────────────────────────────

export const systemInfoSchema = z.object({
  detail: z.enum(['summary', 'full']).default('summary').describe("'summary' for key metrics, 'full' for all OS data."),
})

export async function systemInfo(raw: unknown): Promise<WebToolResult> {
  const { detail } = systemInfoSchema.parse(raw)

  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const cpus = os.cpus()
  const uptimeSec = os.uptime()
  const uptimeH = Math.floor(uptimeSec / 3600)
  const uptimeM = Math.floor((uptimeSec % 3600) / 60)

  const summary = {
    platform: os.platform(),
    hostname: os.hostname(),
    arch: os.arch(),
    uptime: `${uptimeH}h ${uptimeM}m`,
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCount: cpus.length,
    memoryTotal: `${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
    memoryUsed: `${(usedMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
    memoryFree: `${(freeMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
    memoryUsedPct: `${Math.round((usedMem / totalMem) * 100)}%`,
  }

  if (detail === 'summary') {
    return { ok: true, ...summary, receipt: 'systemInfo: summary' }
  }

  let processes = 'unavailable'
  try {
    const out = execSync('tasklist /FO CSV /NH 2>NUL | find /C ","', { timeout: 5000 }).toString().trim()
    processes = out
  } catch {
    // May fail in some environments
  }

  return {
    ok: true,
    ...summary,
    nodeVersion: process.version,
    processCount: processes,
    networkInterfaces: Object.keys(os.networkInterfaces()),
    receipt: 'systemInfo: full',
  }
}

// ──────────────────────────────────────────────────────────────────────────
// vercelDeploy — trigger a Vercel redeployment
// ──────────────────────────────────────────────────────────────────────────

export const vercelDeploySchema = z.object({
  projectId: z.string().optional().describe('Vercel project ID. Defaults to neuradexai.'),
  target: z.enum(['production', 'preview']).default('production').describe('Deployment target. Default production.'),
})

export async function vercelDeploy(raw: unknown): Promise<WebToolResult> {
  const { projectId: projectIdArg, target } = vercelDeploySchema.parse(raw)
  const token = process.env.VERCEL_TOKEN
  if (!token) return fail('vercelDeploy', 'VERCEL_TOKEN not set')

  const projectId = projectIdArg ?? process.env.VERCEL_PROJECT_ID ?? 'prjf_UMBHwog5CrtZC9S4p6SGApObCkTW'
  const teamId = process.env.VERCEL_TEAM_ID ?? 'team_UpmgKO5h65z31kYVX0jfbacu'

  const listRes = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=1&target=${target}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!listRes.ok) {
    const err = await listRes.text()
    return fail('vercelDeploy', `Vercel list ${listRes.status}: ${err.slice(0, 200)}`)
  }

  const listData = await listRes.json() as { deployments: Array<{ uid: string; url: string }> }
  const latest = listData.deployments?.[0]
  if (!latest) return fail('vercelDeploy', 'No existing deployment found to redeploy from')

  const redeployRes = await fetch(
    `https://api.vercel.com/v13/deployments?teamId=${teamId}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deploymentId: latest.uid,
        target,
        meta: { triggeredBy: 'jarvis' },
      }),
    }
  )

  if (!redeployRes.ok) {
    const err = await redeployRes.text()
    return fail('vercelDeploy', `Vercel redeploy ${redeployRes.status}: ${err.slice(0, 200)}`)
  }

  const deployData = await redeployRes.json() as { id: string; url: string; readyState: string }
  return {
    ok: true,
    deploymentId: deployData.id,
    url: `https://${deployData.url}`,
    state: deployData.readyState,
    receipt: `vercelDeploy: ${target} triggered → ${deployData.url}`,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// telegramPollIdeas — poll for idea/capture/note messages from Bo
// ──────────────────────────────────────────────────────────────────────────

const TELEGRAM_IDEA_STATE_FILE = 'C:/Users/bobel/.openclaw-jarvis/.state/telegram-idea-offset.json'
const BO_CHAT_ID = 7240677590
const IDEA_PREFIX_RE = /^(idea|capture|note):\s*/i

export const telegramPollIdeasSchema = z.object({
  // no required args — reads offset from state file
  maxMessages: z.number().int().min(1).max(20).default(10),
})

export interface IdeaMessage {
  updateId: number
  text: string        // stripped of prefix (e.g. "idea: refactor" → "refactor")
  rawText: string     // full original message text
  receivedAt: string  // ISO string
}

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number }
    text?: string
    date: number
  }
}

interface OffsetState {
  lastUpdateId: number
}

async function loadIdeaOffset(): Promise<OffsetState> {
  try {
    const raw = await fs.readFile(TELEGRAM_IDEA_STATE_FILE, 'utf8')
    return JSON.parse(raw) as OffsetState
  } catch {
    // File missing or unparseable — start from beginning
    return { lastUpdateId: 0 }
  }
}

async function saveIdeaOffset(state: OffsetState): Promise<void> {
  await fs.mkdir(path.dirname(TELEGRAM_IDEA_STATE_FILE), { recursive: true })
  await fs.writeFile(TELEGRAM_IDEA_STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

export async function telegramPollIdeas(raw: unknown): Promise<WebToolResult> {
  const { maxMessages } = telegramPollIdeasSchema.parse(raw)

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return fail('telegramPollIdeas', 'TELEGRAM_BOT_TOKEN not set')

  const state = await loadIdeaOffset()

  // Fetch up to 100 updates past the stored offset so we drain the backlog
  // fully and capture all non-idea messages for offset advancement too.
  const apiUrl =
    `https://api.telegram.org/bot${token}/getUpdates` +
    `?offset=${state.lastUpdateId + 1}&limit=100&allowed_updates=${encodeURIComponent('["message"]')}`

  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15_000) })

  if (!res.ok) {
    const body = await res.text()
    return fail('telegramPollIdeas', `Telegram API error: ${res.status} ${body.slice(0, 200)}`)
  }

  const data = await res.json() as { ok: boolean; result?: TelegramUpdate[]; description?: string }

  if (!data.ok || !data.result) {
    return fail('telegramPollIdeas', `Telegram returned ok=false: ${data.description ?? 'unknown'}`)
  }

  const updates = data.result

  // Always advance offset to the max update_id seen — even for non-idea messages —
  // so future polls don't re-scan already-processed updates.
  if (updates.length > 0) {
    const maxId = Math.max(...updates.map((u) => u.update_id))
    if (maxId > state.lastUpdateId) {
      await saveIdeaOffset({ lastUpdateId: maxId })
    }
  }

  // Filter to Bo's messages that start with idea/capture/note prefix
  const ideas: IdeaMessage[] = []
  for (const update of updates) {
    if (!update.message) continue
    if (update.message.chat.id !== BO_CHAT_ID) continue
    const text = update.message.text ?? ''
    if (!IDEA_PREFIX_RE.test(text)) continue

    ideas.push({
      updateId: update.update_id,
      text: text.replace(IDEA_PREFIX_RE, '').trim(),
      rawText: text,
      receivedAt: new Date(update.message.date * 1000).toISOString(),
    })

    if (ideas.length >= maxMessages) break
  }

  const newOffset = updates.length > 0 ? Math.max(...updates.map((u) => u.update_id)) : state.lastUpdateId
  const receipt = `${new Date().toISOString()} telegramPollIdeas OK :: ${ideas.length} idea${ideas.length === 1 ? '' : 's'} captured (offset: ${newOffset})`

  return { ok: true, ideas, receipt }
}
