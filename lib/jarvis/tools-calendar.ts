/**
 * Jarvis calendar write tools — createCalendarEvent, updateCalendarEvent,
 * deleteCalendarEvent.
 *
 * Each tool follows the standard { ok, result?, error?, receipt } contract
 * used by the rest of the tool belt.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  createCalendarEvent as gcalCreate,
  updateCalendarEvent as gcalUpdate,
  deleteCalendarEvent as gcalDelete,
  type CalendarEvent,
  type CreateEventInput,
} from '@/lib/google/calendar'
import type { ToolResult } from './tools'

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const TOOL_LOG = 'C:/Users/bobel/COG/05-knowledge/jarvis-tool-log.md'

// ──────────────────────────────────────────────────────────────────────────
// Shared helpers (scoped to this module)
// ──────────────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function mkReceipt(tool: string, ok: boolean, detail: string): string {
  return `[${now()}] ${tool} ${ok ? 'OK' : 'FAIL'} :: ${detail.slice(0, 240)}`
}

async function appendReceipt(receipt: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TOOL_LOG), { recursive: true })
    await fs.appendFile(TOOL_LOG, receipt + '\n', 'utf8')
  } catch {
    // Sink must never break the tool.
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error: ' + String(error)
}

// ──────────────────────────────────────────────────────────────────────────
// Zod schemas
// ──────────────────────────────────────────────────────────────────────────

export const createCalendarEventSchema = z.object({
  summary: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  timeZone: z.string().optional(),
})
export type CreateCalendarEventArgs = z.infer<typeof createCalendarEventSchema>

export const updateCalendarEventSchema = z.object({
  eventId: z.string().min(1),
  summary: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
})
export type UpdateCalendarEventArgs = z.infer<typeof updateCalendarEventSchema>

export const deleteCalendarEventSchema = z.object({
  eventId: z.string().min(1),
})
export type DeleteCalendarEventArgs = z.infer<typeof deleteCalendarEventSchema>

// ──────────────────────────────────────────────────────────────────────────
// Implementations
// ──────────────────────────────────────────────────────────────────────────

export async function createCalendarEvent(
  raw: unknown
): Promise<ToolResult<CalendarEvent>> {
  const parsed = createCalendarEventSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('createCalendarEvent', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const input: CreateEventInput = parsed.data
  try {
    const event = await gcalCreate(input)
    const r = mkReceipt(
      'createCalendarEvent',
      true,
      `id=${event.id} summary="${input.summary.slice(0, 60)}" start=${input.start}`
    )
    await appendReceipt(r)
    return { ok: true, result: event, receipt: r }
  } catch (err) {
    const msg = getErrorMessage(err)
    const r = mkReceipt('createCalendarEvent', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

export async function updateCalendarEvent(
  raw: unknown
): Promise<ToolResult<CalendarEvent>> {
  const parsed = updateCalendarEventSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('updateCalendarEvent', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { eventId, ...patch } = parsed.data
  try {
    const event = await gcalUpdate(eventId, patch)
    const r = mkReceipt(
      'updateCalendarEvent',
      true,
      `id=${eventId} patched fields=[${Object.keys(patch).join(',')}]`
    )
    await appendReceipt(r)
    return { ok: true, result: event, receipt: r }
  } catch (err) {
    const msg = getErrorMessage(err)
    const r = mkReceipt('updateCalendarEvent', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}

export async function deleteCalendarEvent(
  raw: unknown
): Promise<ToolResult<Record<string, never>>> {
  const parsed = deleteCalendarEventSchema.safeParse(raw)
  if (!parsed.success) {
    const r = mkReceipt('deleteCalendarEvent', false, 'invalid args: ' + parsed.error.message)
    await appendReceipt(r)
    return { ok: false, error: parsed.error.message, receipt: r }
  }
  const { eventId } = parsed.data
  try {
    await gcalDelete(eventId)
    const r = mkReceipt('deleteCalendarEvent', true, `deleted id=${eventId}`)
    await appendReceipt(r)
    return { ok: true, result: {}, receipt: r }
  } catch (err) {
    const msg = getErrorMessage(err)
    const r = mkReceipt('deleteCalendarEvent', false, msg)
    await appendReceipt(r)
    return { ok: false, error: msg, receipt: r }
  }
}
