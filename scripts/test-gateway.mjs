#!/usr/bin/env node
/**
 * Quick smoke test — connect to Doc gateway and send a chat.
 * Verifies the openclaw-sdk + WebSocket RPC path works end-to-end.
 */

import { createClient } from 'openclaw-sdk'

const GATEWAY_TOKEN = 'ffa3c844a788ceb37d07ef220eb9d52e27c2f10ff673d7f3'
const URL = 'ws://127.0.0.1:18789'

async function main() {
  console.log(`[test] connecting to ${URL} ...`)

  const client = createClient({
    url: URL,
    clientId: 'neuradex-hud-test',
    auth: { token: GATEWAY_TOKEN },
  })

  client.onMessage((frame) => {
    console.log('[frame]', JSON.stringify(frame).slice(0, 300))
  })

  try {
    await client.connect()
    console.log('[test] connected, isConnected=', client.isConnected)

    // Try sessions.resolve first
    try {
      const session = await client.request('sessions.resolve', { label: 'neuradex-hud-test' }, { timeoutMs: 5000 })
      console.log('[test] session:', session)
    } catch (e) {
      console.log('[test] sessions.resolve failed:', e.message)
    }

    // Try chat.send
    try {
      const result = await client.request(
        'chat.send',
        {
          sessionKey: 'neuradex-hud-test',
          message: 'Say hello in exactly 5 words.',
          deliver: false,
        },
        { timeoutMs: 30000 },
      )
      console.log('[test] chat.send ack:', JSON.stringify(result).slice(0, 500))
    } catch (e) {
      console.log('[test] chat.send failed:', e.message)
    }

    // Give it time to receive events
    await new Promise((r) => setTimeout(r, 5000))
  } catch (err) {
    console.error('[test] ERROR:', err.message)
  } finally {
    try {
      await client.close?.()
    } catch {}
    process.exit(0)
  }
}

main()
