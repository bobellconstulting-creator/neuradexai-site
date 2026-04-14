#!/usr/bin/env node
/**
 * Ping all 4 fleet gateways using the production OpenClawClient with a long
 * connect timeout. Report which ones complete the signed handshake.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(__dirname, '..')

const wrapperSource = `
import { OpenClawClient } from '../lib/openclawClient'

const TOKEN = 'ffa3c844a788ceb37d07ef220eb9d52e27c2f10ff673d7f3'
const FLEET = [
  { name: 'Doc',    port: 18789 },
  { name: 'Linda',  port: 18790 },
  { name: 'Marcus', port: 18791 },
  { name: 'Vault',  port: 18792 },
]

async function pingOne(name: string, port: number): Promise<string> {
  const t0 = Date.now()
  const client = new OpenClawClient({
    port,
    token: TOKEN,
    connectTimeoutMs: 90_000,  // 90s — long enough to survive cold startup
  })
  try {
    await client.connect()
    const ms = Date.now() - t0
    await client.close()
    return \`OK   \${name.padEnd(7)} \${port}  \${ms}ms\`
  } catch (err) {
    const ms = Date.now() - t0
    return \`FAIL \${name.padEnd(7)} \${port}  \${ms}ms  \${(err as Error).message.slice(0, 100)}\`
  }
}

async function main() {
  console.log('Pinging fleet (90s timeout each)...')
  console.log('')
  // Sequential so we don't hit the "one client per device" constraint
  for (const { name, port } of FLEET) {
    const result = await pingOne(name, port)
    console.log('  ' + result)
  }
  console.log('')
  process.exit(0)
}

main().catch((err) => {
  console.error('ERROR:', (err as Error).message)
  process.exit(1)
})
`

const wrapperPath = path.join(PROJECT, 'scripts', '.ping-fleet-wrapper.ts')
fs.writeFileSync(wrapperPath, wrapperSource, 'utf8')

const child = spawn('npx', ['tsx', wrapperPath], {
  cwd: PROJECT,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => {
  try { fs.unlinkSync(wrapperPath) } catch {}
  process.exit(code ?? 1)
})
