/**
 * OpenClaw WebSocket RPC client for Mission Control HUD.
 *
 * Hand-rolled against OpenClaw 2026.4.9 protocol v3. The `openclaw-sdk` npm
 * package uses protocol v1 and hardcodes the wrong client.id, so we cannot
 * use it. This client speaks directly to the gateway's WebSocket endpoint.
 *
 * Auth model (verified against the live Doc gateway):
 *   1. Gateway emits a `connect.challenge` event with a server-generated nonce
 *   2. Client builds a v3 device-auth payload, signs it with the local ed25519
 *      private key stored at ~/.openclaw/identity/device.json, and sends a
 *      `connect` request that includes the signature, public key, and shared
 *      gateway token.
 *   3. Gateway matches the device against its paired.json store and grants the
 *      approved scopes (typically [operator.read, operator.admin]).
 *
 * Without the signed device handshake, shared-token auth alone yields ZERO
 * operator scopes on this gateway build, so chat.send fails with "missing
 * scope: operator.write". Do not remove the signing step.
 */

import WebSocket from 'ws'
import crypto, { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

interface GatewayRequest {
  type: 'req'
  id: string
  method: string
  params?: unknown
}

interface GatewayResponse {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { message?: string; code?: string }
}

interface GatewayEvent {
  type: 'event'
  event: string
  payload: unknown
}

type GatewayFrame = GatewayRequest | GatewayResponse | GatewayEvent

export interface ToolCall {
  name: string
  args: unknown
  result?: unknown
}

export interface ChatResult {
  content: string
  toolCalls: ToolCall[]
}

export interface OpenClawClientConfig {
  port: number
  token: string
  host?: string
  connectTimeoutMs?: number
  requestTimeoutMs?: number
  chatTimeoutMs?: number
  clientVersion?: string
  identityPath?: string
  /** Must match the `platform` field on the paired device entry. */
  platform?: string
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'closing'

interface PendingRequest {
  resolve: (payload: unknown) => void
  reject: (err: Error) => void
  timeout: NodeJS.Timeout
  method: string
}

type EventHandler = (payload: unknown) => void

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

const DEFAULT_HOST = '127.0.0.1'
// Aggressive timeouts so the dispatch chain falls through to Groq/Gemini
// fast instead of waiting 2 minutes on a hung gateway call.
// Upstream NVIDIA is suspended — OpenClaw internally routes to it and
// hangs. Cap the gateway's budget so the real free tiers kick in quickly.
const DEFAULT_CONNECT_TIMEOUT = 5_000
const DEFAULT_REQUEST_TIMEOUT = 8_000
const DEFAULT_CHAT_TIMEOUT = 12_000
const DEFAULT_CLIENT_VERSION = '1.0.0'
const CHALLENGE_WAIT_MS = 2_000
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

// Paired device entries grant operator.admin, which at authorization time
// implies all other operator.* scopes (see server.impl operatorScopeSatisfied).
// Requesting this exact pair avoids scope-upgrade pairing prompts.
const DEFAULT_CONNECT_SCOPES = ['operator.read', 'operator.admin'] as const

function b64url(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }) as Buffer
  if (spki.length === ED25519_SPKI_PREFIX.length + 32 && spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return spki.subarray(ED25519_SPKI_PREFIX.length)
  }
  return spki
}

function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return b64url(derivePublicKeyRaw(publicKeyPem))
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem)
  return b64url(crypto.sign(null, Buffer.from(payload, 'utf8'), key))
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: readonly string[]
  signedAtMs: number
  token: string | null
  nonce: string
  platform: string
  deviceFamily: string
}): string {
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
    params.platform,
    params.deviceFamily,
  ].join('|')
}

function isGatewayFrame(value: unknown): value is GatewayFrame {
  if (!value || typeof value !== 'object') return false
  const t = (value as { type?: unknown }).type
  return t === 'req' || t === 'res' || t === 'event'
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'unknown error'
}

function extractTextFromChatPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.text === 'string') return p.text
  const message = p.message
  if (message && typeof message === 'object') {
    const content = (message as { content?: unknown }).content
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (block && typeof block === 'object') {
            const b = block as { type?: unknown; text?: unknown }
            if (b.type === 'text' && typeof b.text === 'string') return b.text
          }
          return ''
        })
        .join('')
    }
  }
  return null
}

export class OpenClawClient {
  private readonly host: string
  private readonly port: number
  private readonly token: string
  private readonly connectTimeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly chatTimeoutMs: number
  private readonly clientVersion: string
  private readonly identityPath: string
  private readonly platform: string
  private readonly logPrefix: string

  private identity: DeviceIdentity | null = null
  private ws: WebSocket | null = null
  private state: ConnectionState = 'disconnected'
  private readonly pending = new Map<string, PendingRequest>()
  private readonly listeners = new Map<string, Set<EventHandler>>()

  constructor(config: OpenClawClientConfig) {
    this.host = config.host ?? DEFAULT_HOST
    this.port = config.port
    this.token = config.token
    this.connectTimeoutMs = config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT
    this.requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT
    this.chatTimeoutMs = config.chatTimeoutMs ?? DEFAULT_CHAT_TIMEOUT
    this.clientVersion = config.clientVersion ?? DEFAULT_CLIENT_VERSION
    this.identityPath = config.identityPath ?? path.join(os.homedir(), '.openclaw', 'identity', 'device.json')
    this.platform = config.platform ?? 'win32'
    this.logPrefix = `[OpenClaw:${this.port}]`
  }

  get isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }

  private loadIdentity(): DeviceIdentity {
    if (this.identity) return this.identity
    const raw = readFileSync(this.identityPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<DeviceIdentity>
    if (!parsed.deviceId || !parsed.publicKeyPem || !parsed.privateKeyPem) {
      throw new Error(`${this.logPrefix} invalid device identity at ${this.identityPath}`)
    }
    this.identity = {
      deviceId: parsed.deviceId,
      publicKeyPem: parsed.publicKeyPem,
      privateKeyPem: parsed.privateKeyPem,
    }
    return this.identity
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') return
    if (this.state === 'connecting' || this.state === 'closing') {
      throw new Error(`${this.logPrefix} cannot connect in state ${this.state}`)
    }
    this.state = 'connecting'

    const identity = this.loadIdentity()

    const url = `ws://${this.host}:${this.port}`
    const ws = new WebSocket(url, { handshakeTimeout: this.connectTimeoutMs })
    this.ws = ws

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (err: Error | null) => {
        if (settled) return
        settled = true
        clearTimeout(onOpenTimeout)
        ws.off('open', onOpen)
        ws.off('error', onError)
        if (err) {
          this.state = 'disconnected'
          this.ws = null
          reject(err)
        } else {
          resolve()
        }
      }
      const onOpen = () => settle(null)
      const onError = (err: Error) => settle(new Error(`${this.logPrefix} socket error: ${err.message}`))
      const onOpenTimeout = setTimeout(() => {
        // ws.terminate() synchronously emits an 'error' event with the message
        // "WebSocket was closed before the connection was established". Our
        // onError listener will handle the first call to settle(); any later
        // error events need a sink so Node doesn't crash on unhandled 'error'.
        ws.on('error', () => { /* swallow post-timeout error events */ })
        try { ws.terminate() } catch { /* ignore */ }
        settle(new Error(`${this.logPrefix} connect timeout after ${this.connectTimeoutMs}ms`))
      }, this.connectTimeoutMs)
      ws.once('open', onOpen)
      ws.once('error', onError)
    })

    ws.on('message', (data) => this.onFrame(data))
    ws.on('close', (code, reason) => this.onClose(code, reason.toString()))
    ws.on('error', (err) => this.onSocketError(err))

    const challengeNonce = await this.waitForChallenge()
    const nonce = challengeNonce || randomUUID()
    const signedAtMs = Date.now()
    const clientId = 'gateway-client'
    const clientMode = 'backend'
    const role = 'operator'
    const scopes = [...DEFAULT_CONNECT_SCOPES]

    const payload = buildDeviceAuthPayloadV3({
      deviceId: identity.deviceId,
      clientId,
      clientMode,
      role,
      scopes,
      signedAtMs,
      token: this.token,
      nonce,
      platform: this.platform,
      deviceFamily: '',
    })
    const signature = signDevicePayload(identity.privateKeyPem, payload)
    const publicKeyB64 = publicKeyRawBase64UrlFromPem(identity.publicKeyPem)

    await this.rawRequest('connect', {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: clientId,
        version: this.clientVersion,
        platform: this.platform,
        mode: clientMode,
      },
      role,
      scopes,
      auth: { token: this.token },
      device: {
        id: identity.deviceId,
        publicKey: publicKeyB64,
        signature,
        signedAt: signedAtMs,
        nonce,
      },
    })

    this.state = 'connected'
    console.debug(`${this.logPrefix} handshake complete`)
  }

  private waitForChallenge(): Promise<string> {
    return new Promise((resolve) => {
      let settled = false
      const unsub = this.on('connect.challenge', (payload) => {
        if (settled) return
        settled = true
        unsub()
        const nonce = (payload && typeof payload === 'object' && typeof (payload as { nonce?: unknown }).nonce === 'string')
          ? (payload as { nonce: string }).nonce
          : ''
        resolve(nonce)
      })
      setTimeout(() => {
        if (settled) return
        settled = true
        unsub()
        resolve('')
      }, CHALLENGE_WAIT_MS)
    })
  }

  async request<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    if (!this.isConnected) {
      throw new Error(`${this.logPrefix} not connected`)
    }
    return this.rawRequest(method, params, timeoutMs) as Promise<T>
  }

  private rawRequest(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`${this.logPrefix} socket not open`))
    }
    const id = randomUUID()
    const frame: GatewayRequest = { type: 'req', id, method, params }

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${this.logPrefix} request ${method} timed out after ${timeoutMs ?? this.requestTimeoutMs}ms`))
      }, timeoutMs ?? this.requestTimeoutMs)

      this.pending.set(id, { resolve, reject, timeout, method })

      try {
        ws.send(JSON.stringify(frame), (err) => {
          if (err) {
            const entry = this.pending.get(id)
            if (entry) {
              clearTimeout(entry.timeout)
              this.pending.delete(id)
              reject(new Error(`${this.logPrefix} send failed: ${err.message}`))
            }
          }
        })
      } catch (err) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(new Error(`${this.logPrefix} serialize failed: ${errorMessage(err)}`))
      }
    })
  }

  on(event: string, handler: EventHandler): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
    return () => {
      const s = this.listeners.get(event)
      if (!s) return
      s.delete(handler)
      if (s.size === 0) this.listeners.delete(event)
    }
  }

  private emit(event: string, payload: unknown): void {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return
    for (const handler of Array.from(set)) {
      try {
        handler(payload)
      } catch (err) {
        console.error(`${this.logPrefix} listener for ${event} threw:`, errorMessage(err))
      }
    }
  }

  private onFrame(data: WebSocket.RawData): void {
    let text: string
    try {
      if (typeof data === 'string') text = data
      else if (Buffer.isBuffer(data)) text = data.toString('utf8')
      else text = Buffer.concat(data as Buffer[]).toString('utf8')
    } catch (err) {
      console.warn(`${this.logPrefix} failed to decode frame:`, errorMessage(err))
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      console.warn(`${this.logPrefix} non-JSON frame dropped:`, text.slice(0, 120))
      return
    }

    if (!isGatewayFrame(parsed)) {
      console.warn(`${this.logPrefix} unknown frame shape dropped`)
      return
    }

    if (parsed.type === 'res') {
      const entry = this.pending.get(parsed.id)
      if (!entry) {
        console.debug(`${this.logPrefix} response for unknown id ${parsed.id}`)
        return
      }
      clearTimeout(entry.timeout)
      this.pending.delete(parsed.id)
      if (parsed.ok) {
        entry.resolve(parsed.payload)
      } else {
        const msg = parsed.error?.message ?? `${entry.method} failed`
        entry.reject(new Error(`${this.logPrefix} ${msg}`))
      }
      return
    }

    if (parsed.type === 'event') {
      this.emit(parsed.event, parsed.payload)
      return
    }

    console.debug(`${this.logPrefix} inbound req frame ignored:`, parsed.method)
  }

  private onClose(code: number, reason: string): void {
    console.debug(`${this.logPrefix} socket closed code=${code} reason=${reason || '(none)'}`)
    this.state = 'disconnected'
    this.rejectAllPending(new Error(`${this.logPrefix} connection closed (${code})`))
    this.ws = null
  }

  private onSocketError(err: Error): void {
    console.error(`${this.logPrefix} socket error:`, err.message)
    // `close` will follow and handle cleanup.
  }

  private rejectAllPending(err: Error): void {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timeout)
      entry.reject(err)
      this.pending.delete(id)
    }
  }

  private async ensureSessionKey(label: string): Promise<string> {
    try {
      const resolved = await this.request<{ key?: string; sessionKey?: string }>(
        'sessions.resolve',
        { label },
      )
      const key = resolved?.key ?? resolved?.sessionKey
      if (key) return key
    } catch (err) {
      console.debug(`${this.logPrefix} sessions.resolve miss, creating:`, errorMessage(err))
    }
    const created = await this.request<{ key?: string; sessionKey?: string }>(
      'sessions.create',
      { label },
    )
    const key = created?.key ?? created?.sessionKey
    if (!key) {
      throw new Error(`${this.logPrefix} sessions.create returned no key`)
    }
    return key
  }

  async chat(message: string, sessionLabel: string): Promise<ChatResult> {
    if (!this.isConnected) throw new Error(`${this.logPrefix} not connected`)

    const sessionKey = await this.ensureSessionKey(sessionLabel)
    const idempotencyKey = randomUUID()
    const toolCallMap = new Map<string, ToolCall>()
    let deltaBuffer = ''
    let finalText = ''
    let runId: string | null = null

    return new Promise<ChatResult>((resolve, reject) => {
      let settled = false
      const unsubs: Array<() => void> = []
      const timeout = setTimeout(
        () => finish(new Error(`${this.logPrefix} chat timed out after ${this.chatTimeoutMs}ms`)),
        this.chatTimeoutMs,
      )

      const finish = (err: Error | null) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        for (const u of unsubs) u()
        if (err) reject(err)
        else resolve({
          content: (finalText || deltaBuffer).trim(),
          toolCalls: Array.from(toolCallMap.values()),
        })
      }

      const matchesRun = (payload: Record<string, unknown>): boolean => {
        if (payload.sessionKey && typeof payload.sessionKey === 'string' && payload.sessionKey !== sessionKey) return false
        if (runId && typeof payload.runId === 'string' && payload.runId !== runId) return false
        return true
      }

      unsubs.push(this.on('chat', (payload) => {
        if (!payload || typeof payload !== 'object') return
        const p = payload as Record<string, unknown>
        if (!matchesRun(p)) return

        const state = typeof p.state === 'string' ? p.state : ''
        const text = extractTextFromChatPayload(payload)

        if (state === 'delta' && text) {
          // Chat deltas in 2026.4.9 send the FULL accumulated text each time,
          // so we overwrite instead of appending to avoid duplication.
          deltaBuffer = text
        } else if (state === 'final') {
          if (text) finalText = text
          finish(null)
        } else if (state === 'error') {
          const errText = typeof p.error === 'string' ? p.error : 'chat error'
          finish(new Error(`${this.logPrefix} ${errText}`))
        } else if (state === 'aborted') {
          finish(new Error(`${this.logPrefix} chat aborted`))
        }
      }))

      // Tool calls arrive on the `agent` event with stream=item, data.kind=tool.
      unsubs.push(this.on('agent', (payload) => {
        if (!payload || typeof payload !== 'object') return
        const p = payload as Record<string, unknown>
        if (!matchesRun(p)) return
        if (p.stream !== 'item') return

        const data = p.data && typeof p.data === 'object' ? (p.data as Record<string, unknown>) : null
        if (!data || data.kind !== 'tool') return

        const idRaw = data.itemId ?? data.toolCallId
        if (typeof idRaw !== 'string') return
        const phase = typeof data.phase === 'string' ? data.phase : ''
        const name = typeof data.title === 'string' ? data.title : (typeof data.name === 'string' ? data.name : 'unknown')

        const existing = toolCallMap.get(idRaw)
        if (phase === 'start') {
          toolCallMap.set(idRaw, { name, args: data.args })
        } else if (phase === 'end' || phase === 'result') {
          const merged: ToolCall = existing ?? { name, args: data.args }
          merged.result = data.result ?? data.output
          toolCallMap.set(idRaw, merged)
        }
      }))

      this.request<{ runId?: string; status?: string }>(
        'chat.send',
        { sessionKey, message, idempotencyKey },
        this.chatTimeoutMs,
      )
        .then((ack) => {
          if (ack && typeof ack.runId === 'string') runId = ack.runId
        })
        .catch((err: unknown) => finish(err instanceof Error ? err : new Error(errorMessage(err))))
    })
  }

  async close(): Promise<void> {
    if (this.state === 'disconnected') return
    this.state = 'closing'
    this.rejectAllPending(new Error(`${this.logPrefix} client closing`))
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        const done = () => resolve()
        ws.once('close', done)
        try { ws.close() } catch { done() }
      })
    }
    this.state = 'disconnected'
    this.ws = null
    this.listeners.clear()
  }
}
