// Standalone end-to-end test against Doc gateway on port 18789.
// Implements the full protocol inline including ed25519 device-auth signatures
// so we can verify behavior before adding the client into the Next.js build.

import WebSocket from 'ws'
import crypto, { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = Number(process.env.OCL_PORT ?? 18789)
const TOKEN = 'ffa3c844a788ceb37d07ef220eb9d52e27c2f10ff673d7f3'
const URL = `ws://127.0.0.1:${PORT}`
const SESSION_LABEL = `neuradex-hud-test-${Date.now()}`
const MESSAGE = 'Reply with exactly: "Hello Bo from Doc now"'
const CHAT_TIMEOUT_MS = 300_000

const log = (...a) => console.log('[test]', ...a)
const dbg = (...a) => console.log('[test:debug]', ...a)

// ── device-identity helpers (mirrors openclaw/dist/device-identity) ─────────
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const b64url = (buf) => buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')

function loadIdentity() {
  const file = path.join(os.homedir(), '.openclaw', 'identity', 'device.json')
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  return {
    deviceId: parsed.deviceId,
    publicKeyPem: parsed.publicKeyPem,
    privateKeyPem: parsed.privateKeyPem,
  }
}

function publicKeyRawBase64Url(publicKeyPem) {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  const raw = spki.length === ED25519_SPKI_PREFIX.length + 32 && spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
    ? spki.subarray(ED25519_SPKI_PREFIX.length)
    : spki
  return b64url(raw)
}

function signPayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem)
  return b64url(crypto.sign(null, Buffer.from(payload, 'utf8'), key))
}

function buildDeviceAuthPayloadV3(params) {
  const scopes = params.scopes.join(',')
  const token = params.token ?? ''
  const platform = params.platform ?? ''
  const deviceFamily = params.deviceFamily ?? ''
  return ['v3', params.deviceId, params.clientId, params.clientMode, params.role, scopes, String(params.signedAtMs), token, params.nonce, platform, deviceFamily].join('|')
}

// ── tiny ws rpc ─────────────────────────────────────────────────────────────
function waitOpen(ws, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws open timeout')), timeoutMs)
    ws.once('open', () => { clearTimeout(t); resolve() })
    ws.once('error', (err) => { clearTimeout(t); reject(err) })
  })
}

async function main() {
  const t0 = Date.now()
  const identity = loadIdentity()
  dbg('identity loaded', identity.deviceId.slice(0, 16) + '…')

  log(`connecting to ${URL}`)
  const ws = new WebSocket(URL, { handshakeTimeout: 10_000 })
  await waitOpen(ws)
  log(`connected in ${Date.now() - t0}ms`)

  const pending = new Map()
  const listeners = new Map()
  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(fn)
    return () => listeners.get(event)?.delete(fn)
  }

  ws.on('message', (raw) => {
    let frame
    try { frame = JSON.parse(raw.toString('utf8')) } catch { return }
    if (!frame || typeof frame !== 'object') return

    if (frame.type === 'res') {
      const entry = pending.get(frame.id)
      if (!entry) return
      pending.delete(frame.id)
      if (frame.ok) entry.resolve(frame.payload)
      else entry.reject(new Error(frame.error?.message || `${entry.method} failed`))
      return
    }
    if (frame.type === 'event') {
      dbg('event', frame.event, JSON.stringify(frame.payload)?.slice(0, 200))
      const set = listeners.get(frame.event)
      if (set) for (const fn of Array.from(set)) fn(frame.payload)
    }
  })
  ws.on('close', (code, reason) => log('ws closed', code, reason?.toString() || ''))
  ws.on('error', (err) => log('ws error', err.message))

  function request(method, params, timeoutMs = 120_000) {
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${method} timeout`))
      }, timeoutMs)
      pending.set(id, {
        resolve: (p) => { clearTimeout(timer); resolve(p) },
        reject: (e) => { clearTimeout(timer); reject(e) },
        method,
      })
      ws.send(JSON.stringify({ type: 'req', id, method, params }))
    })
  }

  // Wait for connect.challenge → gives us the nonce to include in the signature
  log('waiting for connect.challenge (max 2s)')
  const challengeNonce = await new Promise((resolve) => {
    let settled = false
    const unsub = on('connect.challenge', (p) => {
      if (settled) return
      settled = true
      unsub()
      resolve(p?.nonce ?? '')
    })
    setTimeout(() => { if (!settled) { settled = true; unsub(); resolve('') } }, 2000)
  })
  dbg('challenge nonce', challengeNonce || '(none)')

  // Build signed device auth — approvedScopes on the paired device include
  // operator.admin, so we request the full operator scope set.
  // Paired device on this gateway has approvedScopes=[operator.read, operator.admin].
  // operator.admin is a superset granting all operator methods at authz time.
  const scopes = ['operator.read', 'operator.admin']
  const signedAtMs = Date.now()
  const clientId = 'gateway-client'
  const clientMode = 'backend'
  const role = 'operator'
  // Paired entry has platform=win32 — must match to avoid metadata-upgrade pairing req
  const platform = 'win32'
  const nonce = challengeNonce || randomUUID()

  const payload = buildDeviceAuthPayloadV3({
    deviceId: identity.deviceId,
    clientId,
    clientMode,
    role,
    scopes,
    signedAtMs,
    token: TOKEN,
    nonce,
    platform,
    deviceFamily: '',
  })
  const signature = signPayload(identity.privateKeyPem, payload)
  const publicKey = publicKeyRawBase64Url(identity.publicKeyPem)

  log('sending connect with device signature')
  const connectStart = Date.now()
  const connectPayload = await request('connect', {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: clientId,
      version: '1.0.0',
      platform,
      mode: clientMode,
    },
    role,
    scopes,
    auth: { token: TOKEN },
    device: {
      id: identity.deviceId,
      publicKey,
      signature,
      signedAt: signedAtMs,
      nonce,
    },
  })
  log(`handshake ok in ${Date.now() - connectStart}ms`)
  dbg('connect payload', JSON.stringify(connectPayload).slice(0, 400))

  // Session resolve — fall back to sessions.create if the label doesn't exist
  log(`resolving session label "${SESSION_LABEL}"`)
  let sessionKey
  try {
    const r = await request('sessions.resolve', { label: SESSION_LABEL })
    sessionKey = r?.key || r?.sessionKey
    dbg('sessions.resolve by label ->', JSON.stringify(r).slice(0, 300))
  } catch (err) {
    log('resolve failed, creating session:', err.message)
    const r = await request('sessions.create', { label: SESSION_LABEL })
    sessionKey = r?.key || r?.sessionKey
    dbg('sessions.create ->', JSON.stringify(r).slice(0, 300))
  }
  if (!sessionKey) throw new Error('no session key returned')
  log(`sessionKey = ${sessionKey}`)

  // Chat with event collection
  let deltaBuffer = ''
  let finalText = ''
  let expectedRunId = null
  const toolById = new Map()

  const chatDone = new Promise((resolve, reject) => {
    const unsubChat = on('chat', (payload) => {
      if (!payload || typeof payload !== 'object') return
      if (payload.sessionKey && payload.sessionKey !== sessionKey) return
      if (expectedRunId && payload.runId && payload.runId !== expectedRunId) return
      const state = payload.state
      const text = extractText(payload)
      // 2026.4.9 delta events carry the full accumulated text snapshot —
      // overwrite rather than append to match the production client.
      if (state === 'delta' && text) deltaBuffer = text
      else if (state === 'final') {
        if (text) finalText = text
        unsubChat(); unsubAgent(); resolve()
      } else if (state === 'error') {
        unsubChat(); unsubAgent()
        reject(new Error(`chat error: ${payload.error || 'unknown'}`))
      }
    })
    const unsubAgent = on('agent', (payload) => {
      if (!payload || typeof payload !== 'object') return
      if (payload.sessionKey && payload.sessionKey !== sessionKey) return
      if (expectedRunId && payload.runId && payload.runId !== expectedRunId) return
      // Tool calls stream as { stream: 'item', data: { kind: 'tool', itemId, phase, title, ... } }
      if (payload.stream === 'item') {
        const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
        if (data.kind !== 'tool') return
        const id = data.itemId || data.toolCallId
        if (!id) return
        const phase = data.phase
        const name = data.title || data.name || 'unknown'
        if (phase === 'start') {
          toolById.set(id, { name, args: data.args })
        } else if (phase === 'end' || phase === 'result') {
          const existing = toolById.get(id) || { name, args: data.args }
          existing.result = data.result ?? data.output
          toolById.set(id, existing)
        }
      }
    })
    setTimeout(() => {
      unsubChat(); unsubAgent()
      reject(new Error(`chat timeout after ${CHAT_TIMEOUT_MS}ms`))
    }, CHAT_TIMEOUT_MS)
  })

  log(`sending chat.send: "${MESSAGE}"`)
  const chatStart = Date.now()
  const ack = await request('chat.send', {
    sessionKey,
    message: MESSAGE,
    idempotencyKey: randomUUID(),
  })
  dbg('chat.send ack', JSON.stringify(ack).slice(0, 200))
  expectedRunId = ack?.runId ?? null

  await chatDone
  const chatElapsed = Date.now() - chatStart
  const toolCalls = [...toolById.values()]

  log('='.repeat(60))
  log('RESPONSE:')
  log(finalText || deltaBuffer || '(empty)')
  log('='.repeat(60))
  log(`chat completed in ${chatElapsed}ms`)
  log(`tool calls: ${toolCalls.length}`)
  for (const tc of toolCalls) log('  tool:', tc.name, 'args:', JSON.stringify(tc.args)?.slice(0, 120))
  log(`total elapsed: ${Date.now() - t0}ms`)

  ws.close()
  setTimeout(() => process.exit(0), 500)
}

function extractText(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (typeof payload.text === 'string') return payload.text
  if (payload.message && Array.isArray(payload.message.content)) {
    return payload.message.content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
  }
  return null
}

main().catch((err) => {
  console.error('[test] FAIL:', err.message)
  console.error(err.stack)
  process.exit(1)
})
