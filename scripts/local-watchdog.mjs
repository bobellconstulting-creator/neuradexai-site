#!/usr/bin/env node
/**
 * Local watchdog — PM2 cron_restart calls this every 15 minutes.
 * Calls the Vercel watchdog endpoint so health checks run sub-daily
 * while the PC is on (Hobby Vercel plan only allows daily crons).
 *
 * Reads CRON_SECRET from .env.local or JARVIS_BRIDGE_SECRET as auth.
 * Requires NEXTAUTH_URL or VERCEL_URL to know the deployment URL.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

function loadDotEnv(file) {
  try {
    const content = readFileSync(file, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* file not present */ }
}

// Load env from project and user home
const cwd = process.env.PM2_CWD ?? path.join(homedir(), 'projects', 'neuradexai')
loadDotEnv(path.join(cwd, '.env.local'))
loadDotEnv(path.join(cwd, '.env'))

const BASE_URL   = (process.env.NEXTAUTH_URL ?? `https://${process.env.VERCEL_URL}`).replace(/\/$/, '')
const SECRET     = process.env.CRON_SECRET ?? ''
const WATCHDOG   = `${BASE_URL}/api/jarvis/watchdog`

async function run() {
  if (!BASE_URL || BASE_URL === 'https://undefined') {
    console.error('[watchdog] NEXTAUTH_URL not set — cannot reach Vercel')
    process.exit(1)
  }

  try {
    const res = await fetch(WATCHDOG, {
      headers: SECRET ? { Authorization: `Bearer ${SECRET}` } : {},
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json()
    const ts = new Date().toISOString()
    console.log(`[watchdog] ${ts} — status ${res.status}`, JSON.stringify(data))
    process.exit(0)
  } catch (e) {
    console.error('[watchdog] call failed:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

run()
