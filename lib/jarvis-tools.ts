/**
 * Jarvis Tool Implementations
 * Server-side functions executed during Kimi agentic loops.
 * Each returns a plain string Kimi can read as a tool result.
 */

// ── Web Search (Tavily) ──────────────────────────────────────────────────────

export async function webSearch(query: string): Promise<string> {
  const key = process.env.TAVILY_API_KEY
  if (!key) return 'ERROR: TAVILY_API_KEY not set'
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json()
    const answer = data.answer ? `ANSWER: ${data.answer}\n\n` : ''
    const results = (data.results || [])
      .map(
        (r: { title: string; url: string; content: string }) =>
          `• ${r.title}\n  ${r.url}\n  ${r.content?.slice(0, 400)}`
      )
      .join('\n\n')
    return (answer + results).trim() || 'No results found.'
  } catch (e) {
    return `Search failed: ${e}`
  }
}

// ── Fetch URL ────────────────────────────────────────────────────────────────

export async function fetchUrl(url: string, extract?: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Jarvis/1.0)' },
      signal: AbortSignal.timeout(12_000),
    })
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 5000)
    const prefix = extract ? `Fetched ${url} (extracting: ${extract}):\n\n` : `Fetched ${url}:\n\n`
    return prefix + text
  } catch (e) {
    return `Failed to fetch ${url}: ${e}`
  }
}

// ── Telegram ─────────────────────────────────────────────────────────────────

function tgBase() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set')
  return `https://api.telegram.org/bot${token}`
}

export async function telegramSend(chatId: string, message: string): Promise<string> {
  try {
    const res = await fetch(`${tgBase()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    })
    const data = await res.json()
    if (!data.ok) return `Telegram error: ${data.description}`
    return `Sent to ${chatId} ✓ (message_id: ${data.result?.message_id})`
  } catch (e) {
    return `Telegram send failed: ${e}`
  }
}

export async function telegramRead(limit = 10): Promise<string> {
  try {
    const res = await fetch(`${tgBase()}/getUpdates?limit=${limit}&timeout=0`)
    const data = await res.json()
    if (!data.ok) return `Telegram error: ${data.description}`
    const updates = data.result || []
    if (!updates.length) return 'No recent messages in bot inbox.'
    return updates
      .map(
        (u: {
          update_id: number
          message?: {
            from?: { username?: string; first_name?: string; id?: number }
            text?: string
            date?: number
            chat?: { id: number }
          }
        }) => {
          const msg = u.message
          if (!msg) return null
          const from = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name || 'unknown'
          const chatId = msg.chat?.id
          const time = msg.date ? new Date(msg.date * 1000).toISOString().slice(0, 16).replace('T', ' ') : ''
          return `[${time}] ${from} (chat: ${chatId}): ${msg.text || '(no text)'}`
        }
      )
      .filter(Boolean)
      .join('\n')
  } catch (e) {
    return `Telegram read failed: ${e}`
  }
}

// ── GitHub ────────────────────────────────────────────────────────────────────

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export async function githubRepos(limit = 10): Promise<string> {
  if (!process.env.GITHUB_TOKEN) return 'ERROR: GITHUB_TOKEN not set'
  try {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=${limit}&sort=updated&type=all`,
      { headers: ghHeaders() }
    )
    const repos = await res.json()
    if (!Array.isArray(repos)) return `GitHub error: ${JSON.stringify(repos).slice(0, 300)}`
    return repos
      .map(
        (r: { full_name: string; private: boolean; description?: string; stargazers_count: number; language?: string }) =>
          `${r.private ? '🔒' : '🌐'} ${r.full_name}  [${r.language || '?'}]  ★${r.stargazers_count}${r.description ? `  ${r.description}` : ''}`
      )
      .join('\n')
  } catch (e) {
    return `GitHub repos failed: ${e}`
  }
}

export async function githubIssues(repo: string, state = 'open'): Promise<string> {
  if (!process.env.GITHUB_TOKEN) return 'ERROR: GITHUB_TOKEN not set'
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?state=${state}&per_page=20`,
      { headers: ghHeaders() }
    )
    const issues = await res.json()
    if (!Array.isArray(issues)) return `GitHub error: ${JSON.stringify(issues).slice(0, 300)}`
    if (!issues.length) return `No ${state} issues in ${repo}.`
    return issues
      .map(
        (i: { number: number; state: string; title: string; html_url: string; labels?: { name: string }[] }) => {
          const labels = i.labels?.map((l) => l.name).join(', ')
          return `#${i.number} [${i.state}]${labels ? ` (${labels})` : ''} ${i.title}\n  → ${i.html_url}`
        }
      )
      .join('\n')
  } catch (e) {
    return `GitHub issues failed: ${e}`
  }
}

export async function githubCreateIssue(repo: string, title: string, body = ''): Promise<string> {
  if (!process.env.GITHUB_TOKEN) return 'ERROR: GITHUB_TOKEN not set'
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    })
    const issue = await res.json()
    if (issue.number) return `Issue created ✓  #${issue.number}: ${issue.title}\n→ ${issue.html_url}`
    return `GitHub error: ${JSON.stringify(issue).slice(0, 300)}`
  } catch (e) {
    return `GitHub create issue failed: ${e}`
  }
}

export async function githubReadFile(repo: string, path: string): Promise<string> {
  if (!process.env.GITHUB_TOKEN) return 'ERROR: GITHUB_TOKEN not set'
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: ghHeaders(),
    })
    const data = await res.json()
    if (data.encoding === 'base64') {
      const content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
      return `📄 ${path} (${repo})\n\n${content.slice(0, 6000)}`
    }
    return `GitHub error: ${JSON.stringify(data).slice(0, 300)}`
  } catch (e) {
    return `GitHub read file failed: ${e}`
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'web_search':
      return webSearch(args.query as string)
    case 'fetch_url':
      return fetchUrl(args.url as string, args.extract as string | undefined)
    case 'telegram_send':
      return telegramSend(args.chat_id as string, args.message as string)
    case 'telegram_read':
      return telegramRead((args.limit as number) || 10)
    case 'github_repos':
      return githubRepos((args.limit as number) || 10)
    case 'github_issues':
      return githubIssues(args.repo as string, (args.state as string) || 'open')
    case 'github_create_issue':
      return githubCreateIssue(args.repo as string, args.title as string, args.body as string)
    case 'github_read_file':
      return githubReadFile(args.repo as string, args.path as string)
    default:
      return `Unknown tool: ${name}`
  }
}

export function toolStatus(name: string): string {
  const map: Record<string, string> = {
    web_search:          'Searching the web...',
    fetch_url:           'Fetching URL...',
    telegram_send:       'Sending Telegram message...',
    telegram_read:       'Reading Telegram inbox...',
    github_repos:        'Fetching GitHub repos...',
    github_issues:       'Fetching GitHub issues...',
    github_create_issue: 'Creating GitHub issue...',
    github_read_file:    'Reading file from GitHub...',
  }
  return map[name] || `Running ${name}...`
}
