/**
 * Jarvis local bridge server.
 *
 * Runs permanently on Bo's machine (managed by PM2). Lets Vercel-hosted Jarvis
 * execute shell commands on the local Windows box via a simple authenticated
 * HTTP API.
 *
 * POST /exec  — run a shell command
 * GET  /health — liveness check
 *
 * Auth: Bearer token from LOCAL_BRIDGE_SECRET env var.
 * Shell: cmd.exe on Windows, bash on unix.
 */

import http from 'node:http'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const PORT = parseInt(process.env.LOCAL_BRIDGE_PORT ?? '3099', 10)
const SECRET = process.env.LOCAL_BRIDGE_SECRET ?? ''
const IS_WIN = process.platform === 'win32'
const MAX_TIMEOUT_MS = 120_000
const DEFAULT_TIMEOUT_MS = 30_000
const TRUNCATE_AT = 4_000

function truncate(s) {
  if (!s) return ''
  return s.length <= TRUNCATE_AT ? s : s.slice(0, TRUNCATE_AT) + `\n…[truncated ${s.length - TRUNCATE_AT} chars]`
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

async function handleExec(req, res) {
  const auth = req.headers['authorization'] ?? ''
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return jsonResponse(res, 401, { ok: false, error: 'Unauthorized' })
  }

  let body = ''
  for await (const chunk of req) body += chunk
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return jsonResponse(res, 400, { ok: false, error: 'Invalid JSON' })
  }

  const cmd = String(parsed.cmd ?? '').trim()
  if (!cmd) return jsonResponse(res, 400, { ok: false, error: 'cmd is required' })

  const timeoutMs = Math.min(
    Math.max((parsed.timeout ?? DEFAULT_TIMEOUT_MS / 1000) * 1000, 1000),
    MAX_TIMEOUT_MS
  )

  let stdout = '', stderr = '', exitCode = 0
  try {
    const result = await execAsync(cmd, {
      shell: IS_WIN ? 'cmd.exe' : 'bash',
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    })
    stdout = result.stdout ?? ''
    stderr = result.stderr ?? ''
  } catch (err) {
    stdout = err.stdout ?? ''
    stderr = err.stderr ?? err.message ?? String(err)
    exitCode = typeof err.code === 'number' ? err.code : 1
  }

  stdout = truncate(stdout)
  stderr = truncate(stderr)
  console.log(`[bridge] cmd: ${cmd.slice(0, 80)} → exit ${exitCode}`)
  return jsonResponse(res, 200, { ok: exitCode === 0, stdout, stderr, exitCode })
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' })
    return res.end()
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      return jsonResponse(res, 200, { ok: true, platform: process.platform, cwd: process.cwd(), uptime: process.uptime() })
    }
    if (req.method === 'POST' && req.url === '/exec') {
      return await handleExec(req, res)
    }
    return jsonResponse(res, 404, { ok: false, error: 'Not found' })
  } catch (err) {
    console.error('[bridge] uncaught error:', err)
    return jsonResponse(res, 500, { ok: false, error: String(err) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] listening on http://127.0.0.1:${PORT}`)
})
