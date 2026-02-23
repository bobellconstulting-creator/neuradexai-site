/**
 * Neuradex AI — Bridge Server
 *
 * Standalone Node.js WebSocket server that sits between the Next.js frontend
 * and the OpenClaw Gateway.
 *
 * Flow:
 *   Browser  ──WS──▶  Bridge (this, port 4000)  ──WS──▶  OpenClaw Gateway (:18789)
 *
 * Start with:   npm run bridge
 * Or with app:  npm run dev:all
 */

import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root
loadEnv({ path: resolve(process.cwd(), '.env.local') })

import { WebSocketServer, WebSocket } from 'ws'
import { jwtVerify } from 'jose'
import { AgentRouter } from './AgentRouter'
import type { ClientMessage } from './types'

const PORT       = parseInt(process.env.BRIDGE_PORT       ?? '4000', 10)
const JWT_SECRET = process.env.NEXTAUTH_SECRET

if (!JWT_SECRET) {
  console.error('[Bridge] NEXTAUTH_SECRET is not set in .env.local — exiting.')
  process.exit(1)
}

const secret = new TextEncoder().encode(JWT_SECRET)
const wss    = new WebSocketServer({ port: PORT })

wss.on('connection', async (ws: WebSocket, req) => {
  // ── Authenticate via JWT in query string ────────────────────────────────
  const rawUrl = req.url ?? ''
  const params = new URLSearchParams(rawUrl.includes('?') ? rawUrl.split('?')[1] : '')
  const token  = params.get('token')

  if (!token) {
    ws.close(4001, 'Missing token')
    return
  }

  let userId: string
  try {
    const { payload } = await jwtVerify(token, secret)
    userId = (payload.sub ?? payload.id ?? 'unknown') as string
  } catch (err) {
    console.warn('[Bridge] Invalid JWT:', (err as Error).message)
    ws.close(4001, 'Invalid token')
    return
  }

  console.log(`[Bridge] Client connected: ${userId}`)

  const router = new AgentRouter(ws)

  ws.on('message', async (raw: Buffer) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      console.warn('[Bridge] Unparseable client message')
      return
    }

    try {
      await router.handle(msg)
    } catch (err) {
      console.error('[Bridge] Router error:', err)
    }
  })

  ws.on('close', (code, reason) => {
    console.log(`[Bridge] Client disconnected: ${userId} (${code}) ${reason.toString()}`)
    router.cleanup()
  })

  ws.on('error', (err) => {
    console.error(`[Bridge] Socket error (${userId}):`, err.message)
  })
})

wss.on('error', (err) => {
  console.error('[Bridge] Server error:', err)
})

console.log(`[Bridge] Server listening on ws://localhost:${PORT}`)
console.log(`[Bridge] Proxying to OpenClaw at ${process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789'}`)
console.log(`[Bridge] Mock mode: ${process.env.NEXT_PUBLIC_BRIDGE_URL ? 'OFF (using real bridge)' : 'ON (set NEXT_PUBLIC_BRIDGE_URL to use real bridge)'}`)
