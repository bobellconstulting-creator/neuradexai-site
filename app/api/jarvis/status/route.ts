/**
 * GET /api/jarvis/status
 *
 * Pings the OpenClaw gateway for Jarvis (port 18789) and reports back
 * whether the gateway is reachable. Returns the last provider used from
 * the most recent conversation entry when available.
 *
 * Response: { ok, status, lastProvider, checkedAt }
 */

import http from 'node:http'
import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'

const OPENCLAW_PORT = parseInt(process.env.JARVIS_OPENCLAW_PORT ?? '18789', 10)
const OPENCLAW_HOST = process.env.JARVIS_OPENCLAW_HOST ?? '127.0.0.1'
const COG_ROOT = process.env.JARVIS_VAULT_ROOT ?? 'C:/Users/bobel/COG'
const COG_CONV_PATH = `${COG_ROOT}/01-daily/chats`

function pingGateway(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: OPENCLAW_HOST, port: OPENCLAW_PORT, path: '/', method: 'GET' },
      () => resolve(true),
    )
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
    req.end()
  })
}

async function getLastProvider(): Promise<{ provider: string | null; lastActiveAt: string | null }> {
  try {
    // List all chat subdirectories
    const chatDirs = await fs.readdir(COG_CONV_PATH, { withFileTypes: true })
    const dirs = chatDirs.filter((d) => d.isDirectory()).map((d) => d.name)
    if (!dirs.length) return { provider: null, lastActiveAt: null }

    // Collect all .jsonl files across all chat dirs, newest first
    type JEntry = { chatDir: string; file: string }
    const allFiles: JEntry[] = []
    for (const chatDir of dirs) {
      try {
        const files = await fs.readdir(path.join(COG_CONV_PATH, chatDir))
        for (const f of files) {
          if (f.endsWith('.jsonl')) allFiles.push({ chatDir, file: f })
        }
      } catch {
        continue
      }
    }
    // Sort descending by filename (YYYY-MM-DD.jsonl sorts lexicographically)
    allFiles.sort((a, b) => b.file.localeCompare(a.file))
    if (!allFiles.length) return { provider: null, lastActiveAt: null }

    // Read files in order until we find an assistant entry with a provider
    for (const { chatDir, file } of allFiles) {
      try {
        const filePath = path.join(COG_CONV_PATH, chatDir, file)
        const content = await fs.readFile(filePath, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean).reverse()
        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as { role?: string; meta?: { provider?: string }; ts?: number }
            if (entry.role === 'assistant' && entry.meta?.provider) {
              const ts = entry.ts ? new Date(entry.ts).toISOString() : null
              return { provider: entry.meta.provider, lastActiveAt: ts }
            }
          } catch {
            continue
          }
        }
      } catch {
        continue
      }
    }
    return { provider: null, lastActiveAt: null }
  } catch {
    return { provider: null, lastActiveAt: null }
  }
}

export async function GET() {
  const [isUp, { provider, lastActiveAt }] = await Promise.all([
    pingGateway(),
    getLastProvider(),
  ])

  return NextResponse.json({
    ok: isUp,
    status: isUp ? 'online' : 'offline',
    lastProvider: provider,
    lastActiveAt,
    checkedAt: new Date().toISOString(),
  })
}
