/**
 * OpenClawGateway — Mode D adapter
 *
 * Opens a dedicated WebSocket connection to the OpenClaw Gateway
 * (ws://127.0.0.1:18789) for a single agentId. On connect it sends the
 * gateway token and switches to the correct agent via the `/agent` command.
 *
 * ── Protocol assumptions ────────────────────────────────────────────────────
 * Adjust the marked sections to match the actual OpenClaw wire format.
 *
 * INBOUND (OpenClaw → this adapter):
 *   OpenClaw may send either:
 *   A) Newline-delimited JSON:  {"type":"token","content":"..."}
 *   B) Plain text tokens (non-JSON) — treated as raw token content
 *   C) SSE-style data lines:   data: {"type":"token","content":"..."}
 *
 * OUTBOUND (this adapter → OpenClaw):
 *   Auth:          {"type":"auth","token":"<OPENCLAW_GATEWAY_TOKEN>"}
 *   Switch agent:  /agent <agentId>          (plain text, first message)
 *   Chat message:  {"type":"message","content":"<text>"}
 *   Interrupt:     {"type":"interrupt"}
 *
 * If OpenClaw uses a different format, update `handleIncoming()` and `send()`.
 * ────────────────────────────────────────────────────────────────────────────
 */

import WebSocket from 'ws'
import type { ServerMessage } from './types'

const OPENCLAW_URL   = process.env.OPENCLAW_GATEWAY_URL   ?? 'ws://127.0.0.1:18789'
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? ''

type Callback = (msg: ServerMessage) => void

export class OpenClawGateway {
  private ws:           WebSocket | null = null
  private connected:    boolean          = false
  private queue:        string[]         = []
  private agentId:      string
  private onMsg:        Callback
  private switchedAgent = false

  constructor(agentId: string, onMsg: Callback) {
    this.agentId = agentId
    this.onMsg   = onMsg
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[OpenClaw:${this.agentId}] Connecting to ${OPENCLAW_URL}`)
      this.ws = new WebSocket(OPENCLAW_URL)

      this.ws.once('open', () => {
        // ── STEP 1: Authenticate ────────────────────────────────────────────
        // ADJUST: if OpenClaw uses a URL token (?token=...) instead, remove this
        if (OPENCLAW_TOKEN) {
          this._raw(JSON.stringify({ type: 'auth', token: OPENCLAW_TOKEN }))
        }

        // ── STEP 2: Switch to agent ─────────────────────────────────────────
        // ADJUST: change to match OpenClaw's agent-switching mechanism
        // Option A (plain text command): this._raw(`/agent ${this.agentId}`)
        // Option B (JSON command):       this._raw(JSON.stringify({ type: 'agent', name: this.agentId }))
        this._raw(`/agent ${this.agentId}`)
        this.switchedAgent = true

        this.connected = true

        // Drain queued messages
        this.queue.forEach((m) => this.ws!.send(m))
        this.queue = []

        console.log(`[OpenClaw:${this.agentId}] Connected`)
        resolve()
      })

      this.ws.on('message', (raw) => this.handleIncoming(raw.toString()))

      this.ws.once('error', (err) => {
        console.error(`[OpenClaw:${this.agentId}] Error:`, err.message)
        reject(err)
      })

      this.ws.on('close', (code, reason) => {
        this.connected = false
        console.log(`[OpenClaw:${this.agentId}] Closed (${code}) ${reason}`)
        // Signal done to browser in case a generation was in progress
        this.onMsg({ type: 'done', agentId: this.agentId })
      })
    })
  }

  // ── Incoming from OpenClaw ────────────────────────────────────────────────

  private handleIncoming(raw: string) {
    // Strip SSE prefix if present (data: {...})
    const line = raw.startsWith('data: ') ? raw.slice(6).trim() : raw.trim()

    if (!line || line === '[DONE]') {
      // ── ADJUST: OpenClaw may signal end-of-stream differently ─────────────
      if (line === '[DONE]') this.onMsg({ type: 'done', agentId: this.agentId })
      return
    }

    try {
      const msg = JSON.parse(line)

      // ── ADJUST: Map OpenClaw's response types to our ServerMessage types ──
      switch (msg.type) {
        case 'token':
        case 'chunk':
        case 'delta':
          // Streaming text token
          this.onMsg({ type: 'token', agentId: this.agentId, content: msg.content ?? msg.text ?? msg.delta ?? '' })
          break

        case 'done':
        case 'end':
        case 'finish':
          this.onMsg({ type: 'done', agentId: this.agentId })
          break

        case 'status':
          this.onMsg({ type: 'status', agentId: this.agentId, status: msg.status })
          break

        case 'error':
          console.error(`[OpenClaw:${this.agentId}] Agent error:`, msg.message)
          this.onMsg({ type: 'error', agentId: this.agentId, message: msg.message ?? 'Agent error' })
          break

        case 'message':
          // Some gateways return a complete message rather than streaming tokens
          this.onMsg({ type: 'token', agentId: this.agentId, content: msg.content ?? msg.text ?? '' })
          this.onMsg({ type: 'done',  agentId: this.agentId })
          break

        default:
          // Log unknown message types so you can add them
          console.debug(`[OpenClaw:${this.agentId}] Unknown message type '${msg.type}':`, msg)
      }
    } catch {
      // Not JSON — treat the whole line as a plain text token
      // ADJUST: remove this if OpenClaw always sends JSON
      if (line.length > 0) {
        this.onMsg({ type: 'token', agentId: this.agentId, content: line })
      }
    }
  }

  // ── Send to OpenClaw ──────────────────────────────────────────────────────

  send(content: string) {
    // ── ADJUST: change this to match OpenClaw's chat message format ──────────
    // Option A (JSON):       JSON.stringify({ type: 'message', content })
    // Option B (plain text): content
    const payload = JSON.stringify({ type: 'message', content })
    this._enqueue(payload)
  }

  interrupt() {
    // ── ADJUST: change to match OpenClaw's interrupt/cancel signal ───────────
    const payload = JSON.stringify({ type: 'interrupt' })
    this._enqueue(payload)
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private _enqueue(payload: string) {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload)
    } else {
      this.queue.push(payload)
    }
  }

  private _raw(payload: string) {
    this.ws?.send(payload)
  }
}
