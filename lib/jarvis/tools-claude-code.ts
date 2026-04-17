/**
 * Jarvis → Claude Code delegation tool.
 *
 * Spawns the `claude` CLI in non-interactive (`--print`) mode, captures
 * stdout/stderr, and returns the result under the standard
 * { ok, result?, error?, receipt } contract.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { ToolResult } from './tools'

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const TOOL_LOG = 'C:/Users/bobel/COG/05-knowledge/jarvis-tool-log.md'
const DEFAULT_CWD = 'C:/Users/bobel/projects/neuradexai'
const DEFAULT_TIMEOUT_MS = 120_000

// ──────────────────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────────────────

export const runClaudeCodeSchema = z.object({
  prompt: z.string().min(1).describe('The task/question to send to Claude Code'),
  cwd: z
    .string()
    .optional()
    .describe('Working directory (default: C:/Users/bobel/projects/neuradexai)'),
  timeoutMs: z
    .number()
    .optional()
    .describe('Timeout in milliseconds (default 120000)'),
})

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function tsNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16)
}

async function appendLog(line: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, line + '\n', 'utf8')
  } catch {
    // Log sink must never break the tool.
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────────────────────────────────

export async function runClaudeCode(
  input: z.infer<typeof runClaudeCodeSchema>
): Promise<ToolResult<string>> {
  const parsed = runClaudeCodeSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.message
    const receipt = `[${tsNow()}] CLAUDE-CODE FAIL :: invalid args: ${msg.slice(0, 200)}`
    await appendLog(receipt)
    return { ok: false, error: msg, receipt }
  }

  const { prompt, cwd = DEFAULT_CWD, timeoutMs = DEFAULT_TIMEOUT_MS } = parsed.data

  return new Promise((resolve) => {
    const stdout: string[] = []
    const stderr: string[] = []
    let timedOut = false

    const child = spawn(
      'claude',
      ['--print', '--dangerouslySkipPermissions', prompt],
      { cwd, shell: false, windowsHide: true }
    )

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString()))

    child.on('close', async (code) => {
      clearTimeout(timer)

      const out = stdout.join('').trim()
      const err = stderr.join('').trim()
      const promptSnip = prompt.slice(0, 80)

      if (timedOut) {
        const msg = `timed out after ${timeoutMs}ms`
        const receipt = `[${tsNow()}] CLAUDE-CODE: ${promptSnip} → ${msg}`
        await appendLog(receipt)
        resolve({ ok: false, error: msg, receipt })
        return
      }

      if (code !== 0) {
        const msg = err || `exited with code ${code}`
        const receipt = `[${tsNow()}] CLAUDE-CODE: ${promptSnip} → ERROR: ${msg.slice(0, 100)}`
        await appendLog(receipt)
        resolve({ ok: false, error: msg, receipt })
        return
      }

      const receipt = `[${tsNow()}] CLAUDE-CODE: ${promptSnip} → ${out.slice(0, 100)}`
      await appendLog(receipt)
      resolve({ ok: true, result: out, receipt })
    })

    child.on('error', async (err) => {
      clearTimeout(timer)
      const msg = err.message
      const receipt = `[${tsNow()}] CLAUDE-CODE: ${prompt.slice(0, 80)} → SPAWN ERROR: ${msg.slice(0, 100)}`
      await appendLog(receipt)
      resolve({ ok: false, error: msg, receipt })
    })
  })
}
