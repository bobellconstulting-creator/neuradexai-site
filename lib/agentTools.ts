/**
 * Agent tool registry for Gemini function calling fallback.
 *
 * Each agent gets a base set of tools (fleet status, team-workspace r/w) plus
 * agent-specific tools (GitHub, web fetch, vault). All executors return strings
 * and swallow exceptions — they must never throw.
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const TEAM_WORKSPACE = 'C:/Users/bobel/team-workspace'
const VAULT_PASSWORDS_PATH = 'C:/Users/bobel/.openclaw/workspace-vault/vault/passwords.json'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
const FLEET_PORTS: Record<string, number> = {
  jarvis: 18789,
  doc:    18789,
  linda:  18790,
  marcus: 18791,
  vault:  18792,
}
const TOOL_FETCH_TIMEOUT_MS = 5_000

// ─── Type definitions ────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
}

export interface ToolExecutor {
  (args: Record<string, unknown>): Promise<string>
}

export interface AgentToolSet {
  definitions: ToolDefinition[]
  executors: Record<string, ToolExecutor>
}

// ─── Helper: TCP port probe ──────────────────────────────────────────────────

function probePort(port: number, host = '127.0.0.1', timeoutMs = 2_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (result: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.connect(port, host, () => finish(true))
    socket.on('error', () => finish(false))
    socket.on('timeout', () => finish(false))
  })
}

// ─── GitHub helper ───────────────────────────────────────────────────────────

async function githubFetch(endpoint: string): Promise<string> {
  if (!GITHUB_TOKEN) return 'error: GITHUB_TOKEN not configured'
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TOOL_FETCH_TIMEOUT_MS)
    const res = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return `error: GitHub ${res.status} ${res.statusText}`
    const data: unknown = await res.json()
    return JSON.stringify(data, null, 2).slice(0, 4000)
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ─── Base tools (all agents) ─────────────────────────────────────────────────

const checkFleetStatusDef: ToolDefinition = {
  name: 'check_fleet_status',
  description: 'Ping all OpenClaw gateway ports (18789-18792) and return which agents are online.',
  parameters: { type: 'object', properties: {} },
}

const checkFleetStatusExec: ToolExecutor = async () => {
  try {
    const results = await Promise.all(
      Object.entries(FLEET_PORTS).map(async ([agent, port]) => {
        const up = await probePort(port)
        return `${agent} (port ${port}): ${up ? 'ONLINE' : 'OFFLINE'}`
      }),
    )
    // Deduplicate jarvis/doc since they share port 18789
    const seen = new Set<string>()
    const deduped = results.filter((line) => {
      const portMatch = line.match(/port (\d+)/)
      if (!portMatch) return true
      if (seen.has(portMatch[1])) return false
      seen.add(portMatch[1])
      return true
    })
    return deduped.join('\n')
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`
  }
}

const readTeamWorkspaceDef: ToolDefinition = {
  name: 'read_team_workspace',
  description: 'Read a file from the team workspace (VOICE.md, QUEUE.md, DAILY.md, HANDOFFS.md, INCIDENTS.md, CREDENTIALS.md).',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Filename to read (e.g. "QUEUE.md")' },
    },
    required: ['filename'],
  },
}

const readTeamWorkspaceExec: ToolExecutor = async (args) => {
  try {
    const filename = typeof args.filename === 'string' ? args.filename : ''
    if (!filename) return 'error: filename is required'
    // Prevent path traversal — only allow bare filenames or one level of subdirs
    if (filename.includes('..') || path.isAbsolute(filename)) {
      return 'error: invalid filename — path traversal not allowed'
    }
    const fullPath = path.join(TEAM_WORKSPACE, filename)
    if (!existsSync(fullPath)) return `error: file not found: ${filename}`
    const content = readFileSync(fullPath, 'utf8')
    return content.slice(0, 4000)
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`
  }
}

const writeTeamWorkspaceDef: ToolDefinition = {
  name: 'write_team_workspace',
  description: 'Append content to a file in the team workspace. Creates the file if it does not exist.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Filename to append to (e.g. "QUEUE.md")' },
      content:  { type: 'string', description: 'Text to append' },
    },
    required: ['filename', 'content'],
  },
}

const writeTeamWorkspaceExec: ToolExecutor = async (args) => {
  try {
    const filename = typeof args.filename === 'string' ? args.filename : ''
    const content  = typeof args.content  === 'string' ? args.content  : ''
    if (!filename) return 'error: filename is required'
    if (!content)  return 'error: content is required'
    if (filename.includes('..') || path.isAbsolute(filename)) {
      return 'error: invalid filename — path traversal not allowed'
    }
    const fullPath = path.join(TEAM_WORKSPACE, filename)
    appendFileSync(fullPath, `\n${content}`)
    return `appended ${content.length} chars to ${filename}`
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ─── GitHub tools ─────────────────────────────────────────────────────────────

const githubListReposDef: ToolDefinition = {
  name: 'github_list_repos',
  description: "List Bo Bell's GitHub repositories (authenticated user: bobellconstulting-creator).",
  parameters: {
    type: 'object',
    properties: {
      per_page: { type: 'string', description: 'Number of repos to return (default 20, max 30)' },
    },
  },
}

const githubListReposExec: ToolExecutor = async (args) => {
  const perPage = Math.min(Number(args.per_page) || 20, 30)
  // /user/repos = authenticated user's own repos (includes private)
  return githubFetch(`/user/repos?per_page=${perPage}&sort=updated&affiliation=owner`)
}

const githubListIssuesDef: ToolDefinition = {
  name: 'github_list_issues',
  description: 'List open issues on a GitHub repository.',
  parameters: {
    type: 'object',
    properties: {
      repo:  { type: 'string', description: 'Repository name (e.g. "buckgrid")' },
      owner: { type: 'string', description: 'Owner username (default "bobell")' },
    },
    required: ['repo'],
  },
}

const githubListIssuesExec: ToolExecutor = async (args) => {
  const repo  = typeof args.repo  === 'string' ? args.repo  : ''
  const owner = typeof args.owner === 'string' ? args.owner : 'bobell'
  if (!repo) return 'error: repo is required'
  return githubFetch(`/repos/${owner}/${repo}/issues?state=open&per_page=20`)
}

const githubCreateIssueDef: ToolDefinition = {
  name: 'github_create_issue',
  description: 'Create a new issue on a GitHub repository.',
  parameters: {
    type: 'object',
    properties: {
      repo:  { type: 'string', description: 'Repository name' },
      owner: { type: 'string', description: 'Owner username (default "bobell")' },
      title: { type: 'string', description: 'Issue title' },
      body:  { type: 'string', description: 'Issue body (markdown)' },
    },
    required: ['repo', 'title'],
  },
}

const githubCreateIssueExec: ToolExecutor = async (args) => {
  if (!GITHUB_TOKEN) return 'error: GITHUB_TOKEN not configured'
  const repo  = typeof args.repo  === 'string' ? args.repo  : ''
  const owner = typeof args.owner === 'string' ? args.owner : 'bobell'
  const title = typeof args.title === 'string' ? args.title : ''
  const body  = typeof args.body  === 'string' ? args.body  : ''
  if (!repo || !title) return 'error: repo and title are required'
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TOOL_FETCH_TIMEOUT_MS)
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return `error: GitHub ${res.status} ${res.statusText}`
    const data = (await res.json()) as { html_url?: string; number?: number }
    return `created issue #${data.number ?? '?'}: ${data.html_url ?? 'no url'}`
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`
  }
}

const githubSearchCodeDef: ToolDefinition = {
  name: 'github_search_code',
  description: 'Search code on GitHub.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (e.g. "dispatchGemini repo:bobell/neuradexai")' },
    },
    required: ['query'],
  },
}

const githubSearchCodeExec: ToolExecutor = async (args) => {
  const query = typeof args.query === 'string' ? args.query : ''
  if (!query) return 'error: query is required'
  return githubFetch(`/search/code?q=${encodeURIComponent(query)}&per_page=10`)
}

// ─── Web fetch tool (linda) ──────────────────────────────────────────────────

const webFetchDef: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch a public URL and return the first 3000 characters of text content.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
    },
    required: ['url'],
  },
}

const webFetchExec: ToolExecutor = async (args) => {
  const url = typeof args.url === 'string' ? args.url : ''
  if (!url) return 'error: url is required'
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TOOL_FETCH_TIMEOUT_MS)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NeuradexBot/1.0' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return `error: HTTP ${res.status} ${res.statusText}`
    const text = await res.text()
    // Strip HTML tags for a readable plain-text excerpt
    const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return stripped.slice(0, 3000)
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ─── Vault tools ──────────────────────────────────────────────────────────────

const listVaultKeysDef: ToolDefinition = {
  name: 'list_vault_keys',
  description: 'List key NAMES stored in the vault (values are never returned).',
  parameters: { type: 'object', properties: {} },
}

const listVaultKeysExec: ToolExecutor = async () => {
  try {
    if (!existsSync(VAULT_PASSWORDS_PATH)) return 'vault file not found'
    const raw = readFileSync(VAULT_PASSWORDS_PATH, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return 'vault file is empty or malformed'
    const keys = Object.keys(parsed as Record<string, unknown>)
    return `vault keys (${keys.length}): ${keys.join(', ')}`
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`
  }
}

const checkServiceStatusDef: ToolDefinition = {
  name: 'check_service_status',
  description: 'Check whether a local port is accepting TCP connections.',
  parameters: {
    type: 'object',
    properties: {
      port: { type: 'string', description: 'Port number to check' },
      host: { type: 'string', description: 'Host to check (default "127.0.0.1")' },
    },
    required: ['port'],
  },
}

const checkServiceStatusExec: ToolExecutor = async (args) => {
  const port = Number(args.port)
  const host = typeof args.host === 'string' ? args.host : '127.0.0.1'
  if (!port || isNaN(port)) return 'error: valid port number is required'
  const up = await probePort(port, host)
  return `port ${port} on ${host}: ${up ? 'OPEN' : 'CLOSED'}`
}

// ─── Base tool set (shared by all agents) ────────────────────────────────────

const BASE_DEFS: ToolDefinition[] = [checkFleetStatusDef, readTeamWorkspaceDef, writeTeamWorkspaceDef]
const BASE_EXECUTORS: Record<string, ToolExecutor> = {
  check_fleet_status:    checkFleetStatusExec,
  read_team_workspace:   readTeamWorkspaceExec,
  write_team_workspace:  writeTeamWorkspaceExec,
}

const GITHUB_DEFS: ToolDefinition[] = [githubListReposDef, githubListIssuesDef]
const GITHUB_EXECUTORS: Record<string, ToolExecutor> = {
  github_list_repos:   githubListReposExec,
  github_list_issues:  githubListIssuesExec,
}

// ─── Public: get tools for a specific agent id ───────────────────────────────

export function getAgentTools(agentId: string): AgentToolSet {
  switch (agentId) {
    case 'jarvis':
    case 'doc':
      return {
        definitions: [...BASE_DEFS, ...GITHUB_DEFS],
        executors:   { ...BASE_EXECUTORS, ...GITHUB_EXECUTORS },
      }

    case 'linda':
      return {
        definitions: [...BASE_DEFS, ...GITHUB_DEFS, webFetchDef],
        executors:   { ...BASE_EXECUTORS, ...GITHUB_EXECUTORS, web_fetch: webFetchExec },
      }

    case 'marcus':
      return {
        definitions: [...BASE_DEFS, ...GITHUB_DEFS, githubCreateIssueDef, githubSearchCodeDef],
        executors:   {
          ...BASE_EXECUTORS,
          ...GITHUB_EXECUTORS,
          github_create_issue: githubCreateIssueExec,
          github_search_code:  githubSearchCodeExec,
        },
      }

    case 'vault':
      return {
        definitions: [...BASE_DEFS, listVaultKeysDef, checkServiceStatusDef],
        executors:   {
          ...BASE_EXECUTORS,
          list_vault_keys:      listVaultKeysExec,
          check_service_status: checkServiceStatusExec,
        },
      }

    default:
      // Unknown agents get the base tools
      return { definitions: BASE_DEFS, executors: BASE_EXECUTORS }
  }
}
