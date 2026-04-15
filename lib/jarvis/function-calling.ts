/**
 * Jarvis function-calling loop.
 *
 * Provider-agnostic multi-turn agentic loop:
 *   1. Build system prompt + history + user message
 *   2. Call model with tools (from tools.manifest.json)
 *   3. If model returns tool_call(s), execute via dispatchTool(), append results
 *   4. Loop until model returns plain text OR tool budget (5) is hit
 *
 * Free-first provider chain: Gemini 2.5 Flash → Groq llama-3.3-70b → NVIDIA
 * Nemotron (text-only, no tools — final escape valve).
 *
 * Tool call errors are surfaced as { ok:false } results to the model — never
 * break the loop. The 5-call budget is per-turn, shared across providers.
 */

import path from 'node:path'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { dispatchTool, type ToolResult } from '@/lib/jarvis/tools'

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolCallLog {
  name: string
  argsSummary: string
  ok: boolean
  durationMs: number
  error?: string
}

export interface JarvisTurnResult {
  reply: string
  toolCalls: ToolCallLog[]
  history: Message[]
  provider: 'gemini' | 'groq' | 'nvidia' | 'none'
}

// ──────────────────────────────────────────────────────────────────────────
// Manifest loader
// ──────────────────────────────────────────────────────────────────────────

interface ManifestTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

interface Manifest {
  version: string
  tools: ManifestTool[]
}

const MANIFEST_PATH = path.join(process.cwd(), 'lib', 'jarvis', 'tools.manifest.json')

let cachedManifest: Manifest | null = null
function loadManifest(): Manifest {
  if (cachedManifest) return cachedManifest
  const raw = readFileSync(MANIFEST_PATH, 'utf8')
  cachedManifest = JSON.parse(raw) as Manifest
  return cachedManifest
}

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const MAX_TOOL_CALLS = 5
const BUDGET_EXCEEDED_REPLY = 'Tool budget exceeded, sir.'

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? ''
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? ''

const GEMINI_MODEL = 'gemini-2.5-flash'
// Groq: llama-3.3-70b-versatile is the reliable tool-calling model.
// Kimi K2 removed — inconsistent function call JSON causes chain failures.
const GROQ_MODELS: readonly string[] = ['llama-3.3-70b-versatile']
// NVIDIA: nemotron-super EOL 2026-04-15. Switched to DeepSeek V3.2.
const NVIDIA_MODEL = 'deepseek-ai/deepseek-v3.2'

const MAX_ROUNDS = 8 // hard upper bound regardless of budget — safety net

// ──────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function summarizeArgs(args: unknown): string {
  try {
    const s = JSON.stringify(args)
    return s.length > 160 ? s.slice(0, 160) + '…' : s
  } catch {
    return '[unserializable]'
  }
}

function summarizeToolResult(result: ToolResult): string {
  const base = result.ok ? 'OK' : `FAIL: ${result.error ?? 'unknown'}`
  let payload = ''
  if (result.result !== undefined) {
    try {
      const s = JSON.stringify(result.result)
      payload = s.length > 2000 ? s.slice(0, 2000) + '…[truncated]' : s
    } catch {
      payload = '[unserializable result]'
    }
  }
  return `${base}${payload ? ` :: ${payload}` : ''}`
}

async function executeToolCall(
  name: string,
  args: unknown,
): Promise<{ resultText: string; log: ToolCallLog }> {
  const start = Date.now()
  try {
    const res = await dispatchTool(name, args)
    const durationMs = Date.now() - start
    return {
      resultText: summarizeToolResult(res),
      log: {
        name,
        argsSummary: summarizeArgs(args),
        ok: res.ok,
        durationMs,
        error: res.ok ? undefined : res.error,
      },
    }
  } catch (e) {
    // dispatchTool is designed to never throw, but be defensive.
    const durationMs = Date.now() - start
    const msg = errMsg(e)
    return {
      resultText: `FAIL: ${msg}`,
      log: { name, argsSummary: summarizeArgs(args), ok: false, durationMs, error: msg },
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Gemini provider
// ──────────────────────────────────────────────────────────────────────────

const geminiFunctionCallSchema = z.object({
  name: z.string(),
  args: z.record(z.unknown()).optional(),
})

const geminiPartSchema = z.object({
  text: z.string().optional(),
  functionCall: geminiFunctionCallSchema.optional(),
})

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            role: z.string().optional(),
            parts: z.array(geminiPartSchema).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  error: z.object({ message: z.string().optional() }).optional(),
})

interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: { result: string } } }
  >
}

/**
 * Strip JSON Schema keywords Gemini's function-calling parser rejects.
 * Gemini's schema grammar is OpenAPI 3.0 flavored — it does NOT accept
 * `additionalProperties` or unknown `format` values (e.g. "uri", "email").
 * It DOES accept: type, properties, required, items, enum, description,
 * nullable, and a narrow set of format values.
 *
 * We recurse through the schema tree and drop fields Gemini doesn't know.
 */
const GEMINI_ALLOWED_FORMATS = new Set(['enum', 'date-time'])

function scrubForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((s) => scrubForGemini(s))
  }
  if (!schema || typeof schema !== 'object') return schema

  const src = schema as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(src)) {
    if (key === 'additionalProperties') continue
    if (key === 'format' && typeof value === 'string' && !GEMINI_ALLOWED_FORMATS.has(value)) continue
    // Recurse into properties / items / anyOf / oneOf
    if (key === 'properties' && value && typeof value === 'object') {
      const props = value as Record<string, unknown>
      const scrubbedProps: Record<string, unknown> = {}
      for (const [propKey, propVal] of Object.entries(props)) {
        scrubbedProps[propKey] = scrubForGemini(propVal)
      }
      out[key] = scrubbedProps
      continue
    }
    if (key === 'items' || key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      out[key] = scrubForGemini(value)
      continue
    }
    out[key] = value
  }
  return out
}

function toGeminiTools(manifest: Manifest) {
  return [
    {
      function_declarations: manifest.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: scrubForGemini(t.parameters),
      })),
    },
  ]
}

function historyToGeminiContents(
  history: Message[],
  userMessage: string,
): GeminiContent[] {
  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }))
  contents.push({ role: 'user', parts: [{ text: userMessage }] })
  return contents
}

async function callGeminiOnce(
  systemPrompt: string,
  contents: GeminiContent[],
  tools: ReturnType<typeof toGeminiTools>,
): Promise<z.infer<typeof geminiResponseSchema>> {
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY not configured')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools,
        generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
      }),
    },
  )
  const raw: unknown = await res.json().catch(() => null)
  const parsed = geminiResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Gemini response shape invalid: ${parsed.error.message.slice(0, 120)}`)
  }
  if (!res.ok) {
    throw new Error(parsed.data.error?.message ?? `Gemini HTTP ${res.status}`)
  }
  return parsed.data
}

async function runWithGemini(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  manifest: Manifest,
  toolCalls: ToolCallLog[],
): Promise<{ reply: string; budgetExceeded: boolean }> {
  const contents = historyToGeminiContents(history, userMessage)
  const tools = toGeminiTools(manifest)

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const data = await callGeminiOnce(systemPrompt, contents, tools)
    const parts = data.candidates?.[0]?.content?.parts ?? []

    const fnCalls = parts
      .map((p) => p.functionCall)
      .filter((fc): fc is { name: string; args?: Record<string, unknown> } => !!fc)

    if (fnCalls.length === 0) {
      const text = parts.map((p) => p.text ?? '').join('').trim()
      return { reply: text, budgetExceeded: false }
    }

    // Budget check: would executing all these exceed 5?
    if (toolCalls.length + fnCalls.length > MAX_TOOL_CALLS) {
      return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
    }

    // Append the model's tool-call turn.
    contents.push({
      role: 'model',
      parts: fnCalls.map((fc) => ({
        functionCall: { name: fc.name, args: fc.args ?? {} },
      })),
    })

    // Execute calls, then append results as a single user-role turn.
    const responseParts: GeminiContent['parts'] = []
    for (const fc of fnCalls) {
      const { resultText, log } = await executeToolCall(fc.name, fc.args ?? {})
      toolCalls.push(log)
      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: { result: resultText },
        },
      })
    }
    contents.push({ role: 'user', parts: responseParts })

    // If we just hit the cap exactly, force-stop on next round.
    if (toolCalls.length >= MAX_TOOL_CALLS) {
      // Ask for a final text synthesis — no more tools allowed.
      const finalData = await callGeminiOnce(
        systemPrompt + '\n\nYou have hit the tool-call budget. Summarize now in one short reply. Do not call any more tools.',
        contents,
        [], // no tools on the final synthesis pass
      )
      const finalParts = finalData.candidates?.[0]?.content?.parts ?? []
      const finalText = finalParts.map((p) => p.text ?? '').join('').trim()
      if (finalText) return { reply: finalText, budgetExceeded: false }
      return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
    }
  }

  return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
}

// ──────────────────────────────────────────────────────────────────────────
// Groq provider (OpenAI-compatible)
// ──────────────────────────────────────────────────────────────────────────

const groqToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
})

const groqMessageSchema = z.object({
  role: z.string(),
  content: z.string().nullable(),
  tool_calls: z.array(groqToolCallSchema).optional(),
})

const groqResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: groqMessageSchema.optional(),
        finish_reason: z.string().optional(),
      }),
    )
    .optional(),
  error: z.object({ message: z.string().optional() }).optional(),
})

interface OpenAIMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

function toOpenAITools(manifest: Manifest) {
  return manifest.tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function historyToOpenAIMessages(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
): OpenAIMsg[] {
  const msgs: OpenAIMsg[] = [{ role: 'system', content: systemPrompt }]
  for (const m of history) {
    msgs.push({ role: m.role, content: m.content })
  }
  msgs.push({ role: 'user', content: userMessage })
  return msgs
}

async function callGroqOnce(
  messages: OpenAIMsg[],
  tools: ReturnType<typeof toOpenAITools>,
): Promise<z.infer<typeof groqResponseSchema>> {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured')
  let lastErr = ''
  for (const model of GROQ_MODELS) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.6,
        max_tokens: 2048,
      }),
    })
    const raw: unknown = await res.json().catch(() => null)
    const parsed = groqResponseSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Groq response shape invalid: ${parsed.error.message.slice(0, 120)}`)
    }
    if (res.status === 429) {
      lastErr = parsed.data.error?.message ?? `Groq 429 (${model})`
      // eslint-disable-next-line no-console
      console.warn(`[jarvis/fc] Groq ${model} rate limited → trying next`)
      continue
    }
    if (!res.ok) {
      throw new Error(parsed.data.error?.message ?? `Groq HTTP ${res.status} (${model})`)
    }
    return parsed.data
  }
  throw new Error(`Groq all models rate limited: ${lastErr}`)
}

async function runWithGroq(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  manifest: Manifest,
  toolCalls: ToolCallLog[],
): Promise<{ reply: string; budgetExceeded: boolean }> {
  const messages = historyToOpenAIMessages(systemPrompt, history, userMessage)
  const tools = toOpenAITools(manifest)

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const data = await callGroqOnce(messages, tools)
    const msg = data.choices?.[0]?.message
    if (!msg) return { reply: '', budgetExceeded: false }

    const calls = msg.tool_calls ?? []
    if (calls.length === 0) {
      return { reply: (msg.content ?? '').trim(), budgetExceeded: false }
    }

    if (toolCalls.length + calls.length > MAX_TOOL_CALLS) {
      return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
    }

    messages.push({
      role: 'assistant',
      content: msg.content,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: c.function,
      })),
    })

    for (const c of calls) {
      let parsedArgs: unknown = {}
      try {
        parsedArgs = JSON.parse(c.function.arguments)
      } catch {
        // pass empty object — tool will reject via Zod and we'll surface error
      }
      const { resultText, log } = await executeToolCall(c.function.name, parsedArgs)
      toolCalls.push(log)
      messages.push({
        role: 'tool',
        tool_call_id: c.id,
        name: c.function.name,
        content: resultText,
      })
    }

    if (toolCalls.length >= MAX_TOOL_CALLS) {
      // Final synthesis pass, no tools.
      const finalData = await callGroqOnce(
        [
          ...messages,
          {
            role: 'system',
            content: 'You have hit the tool-call budget. Summarize now in one short reply. Do not call any more tools.',
          },
        ],
        [],
      )
      const finalMsg = finalData.choices?.[0]?.message
      const finalText = (finalMsg?.content ?? '').trim()
      if (finalText) return { reply: finalText, budgetExceeded: false }
      return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
    }
  }

  return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
}

// ──────────────────────────────────────────────────────────────────────────
// NVIDIA provider (text-only fallback — no native tool calling)
// ──────────────────────────────────────────────────────────────────────────

const nvidiaResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  error: z.object({ message: z.string().optional() }).optional(),
  detail: z.string().optional(),
})

async function runWithNvidia(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
): Promise<{ reply: string }> {
  if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not configured')
  const messages: OpenAIMsg[] = [
    { role: 'system', content: systemPrompt + '\n\nYou do NOT have tools available on this fallback path. Respond with text only.' },
    ...history.map<OpenAIMsg>((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 2048,
      stream: false,
    }),
  })
  const raw: unknown = await res.json().catch(() => null)
  const parsed = nvidiaResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`NVIDIA response shape invalid: ${parsed.error.message.slice(0, 120)}`)
  }
  if (!res.ok) {
    throw new Error(parsed.data.error?.message ?? parsed.data.detail ?? `NVIDIA HTTP ${res.status}`)
  }
  const content = parsed.data.choices?.[0]?.message?.content?.trim() ?? ''
  return { reply: content }
}

// ──────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────

/**
 * Run one Jarvis turn end-to-end with function calling.
 * Free-first: Gemini → Groq → NVIDIA (text-only).
 */
export async function runJarvisTurn(
  systemPrompt: string,
  userMessage: string,
  history: Message[] = [],
): Promise<JarvisTurnResult> {
  const manifest = loadManifest()
  const toolCalls: ToolCallLog[] = []
  const lastErrors: string[] = []

  // Groq first — llama-3.3-70b-versatile is reliable and rarely rate-limited.
  if (GROQ_API_KEY) {
    try {
      const { reply } = await runWithGroq(systemPrompt, history, userMessage, manifest, toolCalls)
      const finalHistory: Message[] = [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]
      return { reply, toolCalls, history: finalHistory, provider: 'groq' }
    } catch (e) {
      lastErrors.push(`Groq: ${errMsg(e).slice(0, 120)}`)
      // eslint-disable-next-line no-console
      console.warn('[jarvis/fc] Groq failed → Gemini:', errMsg(e).slice(0, 120))
    }
  }

  // Gemini — secondary (free tier quota can exhaust mid-day)
  if (GOOGLE_API_KEY) {
    try {
      const { reply } = await runWithGemini(systemPrompt, history, userMessage, manifest, toolCalls)
      const finalHistory: Message[] = [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]
      return { reply, toolCalls, history: finalHistory, provider: 'gemini' }
    } catch (e) {
      lastErrors.push(`Gemini: ${errMsg(e).slice(0, 120)}`)
      // eslint-disable-next-line no-console
      console.warn('[jarvis/fc] Gemini failed → NVIDIA:', errMsg(e).slice(0, 120))
    }
  }

  // NVIDIA DeepSeek V3.2 — text-only escape valve
  if (NVIDIA_API_KEY) {
    try {
      const { reply } = await runWithNvidia(systemPrompt, history, userMessage)
      const finalHistory: Message[] = [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]
      return { reply, toolCalls, history: finalHistory, provider: 'nvidia' }
    } catch (e) {
      lastErrors.push(`NVIDIA: ${errMsg(e).slice(0, 120)}`)
    }
  }

  throw new Error(`all providers failed: ${lastErrors.join(' | ')}`)
}
