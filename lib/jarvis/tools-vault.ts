/**
 * Jarvis credential vault — read/write ~/.secrets/jarvis-vault.json.
 *
 * Three tools:
 *   storeCredential  — upsert a service credential entry
 *   getCredential    — retrieve a full credential (passwords included — tool use only)
 *   listCredentials  — list service names + usernames (NO passwords)
 *
 * Security invariants:
 *   - Vault lives at ~/.secrets/jarvis-vault.json (outside the repo, never committed).
 *   - Passwords must NOT be logged to the tool-log or sent to Telegram.
 *   - Receipt strings are safe to log: they omit passwords.
 *   - File is created with mode 0o600 on first write.
 */
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ToolResult } from './tools'

// ─── Constants ────────────────────────────────────────────────────────────────

const VAULT_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.secrets',
  'jarvis-vault.json'
)

const TOOL_LOG = 'C:/Users/bobel/COG/05-knowledge/jarvis-tool-log.md'

// ─── Vault file shape ─────────────────────────────────────────────────────────

interface VaultEntry {
  username: string
  password: string
  url?: string
  notes?: string
  updatedAt: string
}

type VaultFile = Record<string, VaultEntry>

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const storeCredentialSchema = z.object({
  service: z.string().min(1).max(200),
  username: z.string().min(1),
  password: z.string().min(1),
  notes: z.string().max(1000).optional(),
  url: z.string().url().optional(),
})
export type StoreCredentialArgs = z.infer<typeof storeCredentialSchema>

export const getCredentialSchema = z.object({
  service: z.string().min(1).max(200),
})
export type GetCredentialArgs = z.infer<typeof getCredentialSchema>

export const listCredentialsSchema = z.object({})
export type ListCredentialsArgs = z.infer<typeof listCredentialsSchema>

// ─── Result types ─────────────────────────────────────────────────────────────

export interface StoreCredentialResult {
  service: string
  stored: true
}

export interface GetCredentialResult {
  service: string
  username: string
  password: string
  url?: string
  notes?: string
  updatedAt: string
}

export interface ListCredentialsResult {
  credentials: Array<{
    service: string
    username: string
    url?: string
    updatedAt: string
  }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function slugify(service: string): string {
  return service.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
}

function mkReceipt(tool: string, ok: boolean, detail: string): string {
  return `[${now()}] ${tool} ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Log sink must never break the caller.
  }
}

async function readVault(): Promise<VaultFile> {
  try {
    const raw = await fs.readFile(VAULT_PATH, 'utf8')
    return JSON.parse(raw) as VaultFile
  } catch (err) {
    // File missing or empty — return empty vault.
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr.code === 'ENOENT') return {}
    throw err
  }
}

async function writeVault(vault: VaultFile): Promise<void> {
  await fs.mkdir(path.dirname(VAULT_PATH), { recursive: true })
  const json = JSON.stringify(vault, null, 2)
  await fs.writeFile(VAULT_PATH, json, { encoding: 'utf8', mode: 0o600 })
}

// ─── storeCredential ──────────────────────────────────────────────────────────

export async function storeCredential(
  raw: unknown
): Promise<ToolResult<StoreCredentialResult>> {
  const parsed = storeCredentialSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('storeCredential', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { service, username, password, notes, url } = parsed.data
  const key = slugify(service)

  try {
    const vault = await readVault()

    const entry: VaultEntry = {
      username,
      password,
      updatedAt: now(),
      ...(url !== undefined ? { url } : {}),
      ...(notes !== undefined ? { notes } : {}),
    }

    const updated: VaultFile = { ...vault, [key]: entry }
    await writeVault(updated)

    // Receipt deliberately omits the password.
    const r = mkReceipt(
      'storeCredential',
      true,
      `service=${key} username=${username} url=${url ?? 'none'}`
    )
    await appendReceipt(r)
    return { ok: true, result: { service: key, stored: true }, receipt: r }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt('storeCredential', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

// ─── getCredential ────────────────────────────────────────────────────────────

export async function getCredential(
  raw: unknown
): Promise<ToolResult<GetCredentialResult>> {
  const parsed = getCredentialSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('getCredential', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const key = slugify(parsed.data.service)

  try {
    const vault = await readVault()
    const entry = vault[key]

    if (!entry) {
      const r = mkReceipt('getCredential', false, `not found: ${key}`)
      await appendReceipt(r)
      return {
        ok: false,
        error: `No credential found for ${key}`,
        receipt: r,
      }
    }

    // Receipt omits the password.
    const r = mkReceipt(
      'getCredential',
      true,
      `service=${key} username=${entry.username} updatedAt=${entry.updatedAt}`
    )
    await appendReceipt(r)

    return {
      ok: true,
      result: {
        service: key,
        username: entry.username,
        password: entry.password,
        url: entry.url,
        notes: entry.notes,
        updatedAt: entry.updatedAt,
      },
      receipt: r,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt('getCredential', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

// ─── listCredentials ──────────────────────────────────────────────────────────

export async function listCredentials(
  raw: unknown
): Promise<ToolResult<ListCredentialsResult>> {
  // Schema accepts empty object — no required fields.
  const parsed = listCredentialsSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('listCredentials', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  try {
    const vault = await readVault()
    const credentials = Object.entries(vault).map(([service, entry]) => ({
      service,
      username: entry.username,
      ...(entry.url !== undefined ? { url: entry.url } : {}),
      updatedAt: entry.updatedAt,
    }))

    const r = mkReceipt('listCredentials', true, `count=${credentials.length}`)
    await appendReceipt(r)
    return { ok: true, result: { credentials }, receipt: r }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt('listCredentials', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}
