/**
 * Jarvis email tool — sendEmail via nodemailer + Gmail SMTP,
 *                     readEmail via imapflow + Gmail IMAP.
 *
 * Free-first: only SMTP/IMAP, never paid transactional APIs.
 * Guard: dryRun=true logs without sending.
 *
 * Env vars required:
 *   SMTP_USER  — Gmail address (e.g. bobellconstulting@gmail.com)
 *   SMTP_PASS  — Gmail App Password (not the account password)
 *               App Password MUST have Mail scope enabled.
 */
import { z } from 'zod'
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ToolResult } from './tools'

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOL_LOG = 'C:/Users/bobel/COG/05-knowledge/jarvis-tool-log.md'

// ─── Schema ───────────────────────────────────────────────────────────────────

export const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(998),
  body: z.string().min(1),
  replyTo: z.string().email().optional(),
  dryRun: z.boolean().optional().default(false),
})
export type SendEmailArgs = z.infer<typeof sendEmailSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function mkReceipt(ok: boolean, detail: string): string {
  return `[${now()}] sendEmail ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Receipt sink must never break the caller.
  }
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface SendEmailResult {
  messageId: string | null
  to: string
  subject: string
  dryRun: boolean
}

// ─── Implementation ───────────────────────────────────────────────────────────

export async function sendEmail(raw: unknown): Promise<ToolResult<SendEmailResult>> {
  const parsed = sendEmailSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt(false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { to, subject, body, replyTo, dryRun } = parsed.data

  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (!smtpUser || !smtpPass) {
    const r = mkReceipt(false, 'SMTP not configured')
    await appendReceipt(r)
    return {
      ok: false,
      error: 'SMTP not configured — set SMTP_USER and SMTP_PASS env vars',
      receipt: r,
    }
  }

  if (dryRun) {
    const r = mkReceipt(true, `dryRun to=${to} subject="${subject.slice(0, 60)}"`)
    await appendReceipt(r)
    return {
      ok: true,
      result: { messageId: null, to, subject, dryRun: true },
      receipt: r,
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      auth: { user: smtpUser, pass: smtpPass },
    })

    const info = await transporter.sendMail({
      from: smtpUser,
      to,
      subject,
      text: body,
      replyTo: replyTo ?? smtpUser,
    })

    const r = mkReceipt(true, `to=${to} subject="${subject.slice(0, 60)}" msgId=${info.messageId}`)
    await appendReceipt(r)
    return {
      ok: true,
      result: { messageId: info.messageId ?? null, to, subject, dryRun: false },
      receipt: r,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReceipt(false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

// ─── readEmail ────────────────────────────────────────────────────────────────

export const readEmailSchema = z.object({
  folder: z.string().default('INBOX').describe('Mailbox folder (default: INBOX)'),
  unreadOnly: z.boolean().default(true).describe('Only return unread messages'),
  limit: z.number().int().min(1).max(50).default(10).describe('Max messages to return'),
  sinceMinutes: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(30)
    .describe('Only messages received in last N minutes'),
})
export type ReadEmailArgs = z.infer<typeof readEmailSchema>

export interface EmailMessage {
  messageId: string
  from: string
  subject: string
  /** First 200 chars of the plain-text body. */
  snippet: string
  receivedAt: string // ISO string
  isRead: boolean
}

function mkReadReceipt(ok: boolean, detail: string): string {
  return `[${now()}] readEmail ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

export async function readEmail(raw: unknown): Promise<ToolResult<EmailMessage[]>> {
  const parsed = readEmailSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReadReceipt(false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }

  const { folder, unreadOnly, limit, sinceMinutes } = parsed.data

  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (!smtpUser || !smtpPass) {
    const r = mkReadReceipt(false, 'IMAP not configured')
    await appendReceipt(r)
    return {
      ok: false,
      error: 'IMAP not configured — set SMTP_USER and SMTP_PASS env vars',
      receipt: r,
    }
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true, // TLS
    auth: { user: smtpUser, pass: smtpPass },
    // Suppress the noisy imapflow logger in production.
    logger: false,
  })

  try {
    await client.connect()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const authFail =
      msg.toLowerCase().includes('authenticationfailed') ||
      msg.toLowerCase().includes('authentication failed')
    const friendly = authFail
      ? 'Gmail IMAP auth failed — check SMTP_USER/SMTP_PASS App Password has Mail scope'
      : msg
    const r = mkReadReceipt(false, friendly)
    await appendReceipt(r)
    return { ok: false, error: friendly, receipt: r }
  }

  try {
    const lock = await client.getMailboxLock(folder)
    try {
      // Build search criteria.
      const sinceDate = new Date(Date.now() - sinceMinutes * 60 * 1000)

      const searchCriteria: Parameters<typeof client.search>[0] = {
        since: sinceDate,
        ...(unreadOnly ? { seen: false } : {}),
      }

      const searchResult = await client.search(searchCriteria, { uid: true })
      // imapflow returns `false` when the folder is empty / no match.
      const uids: number[] = Array.isArray(searchResult) ? searchResult : []

      if (uids.length === 0) {
        const r = mkReadReceipt(
          true,
          `0 messages from ${folder} (last ${sinceMinutes}m, unreadOnly=${unreadOnly})`,
        )
        await appendReceipt(r)
        return { ok: true, result: [], receipt: r }
      }

      // Take the last `limit` UIDs (highest = newest).
      const targetUids = uids.slice(-limit).reverse()

      const messages: EmailMessage[] = []

      for await (const msg of client.fetch(targetUids, { envelope: true, bodyStructure: true, bodyParts: ['text'] }, { uid: true })) {
        const envelope = msg.envelope
        const fromAddr = envelope?.from?.[0]
        const fromStr = fromAddr
          ? fromAddr.name
            ? `${fromAddr.name} <${fromAddr.address}>`
            : (fromAddr.address ?? '')
          : 'unknown'

        // Extract plain-text snippet from bodyParts.
        let snippet = ''
        const textPart = msg.bodyParts?.get('text')
        if (textPart) {
          const raw = Buffer.isBuffer(textPart) ? textPart.toString('utf8') : String(textPart)
          snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 200)
        }

        messages.push({
          messageId: envelope?.messageId ?? msg.uid.toString(),
          from: fromStr,
          subject: envelope?.subject ?? '(no subject)',
          snippet,
          receivedAt: (envelope?.date ?? new Date()).toISOString(),
          isRead: !msg.flags?.has('\\Seen') === false,
        })
      }

      const r = mkReadReceipt(
        true,
        `${messages.length} messages from ${folder} (last ${sinceMinutes}m, unreadOnly=${unreadOnly})`,
      )
      await appendReceipt(r)
      return { ok: true, result: messages, receipt: r }
    } finally {
      lock.release()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const r = mkReadReceipt(false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  } finally {
    // Always logout, even on error.
    await client.logout()
  }
}
