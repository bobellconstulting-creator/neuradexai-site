/**
 * Jarvis function-calling loop.
 *
 * Provider-agnostic multi-turn agentic loop:
 *   1. Build system prompt + history + user message
 *   2. Call model with tools (from tools.manifest.json)
 *   3. If model returns tool_call(s), execute via dispatchTool(), append results
 *   4. Loop until model returns plain text OR tool budget (5) is hit
 *
 * Free-first provider chain: Groq → Gemini → OpenRouter → NVIDIA (text-only) → Claude Haiku (paid, opt-in).
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
  provider: 'gemini' | 'groq' | 'openrouter' | 'nvidia' | 'claude' | 'none'
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
// Key pool — rotate on 429 to double free-tier quota
const GROQ_API_KEYS: readonly string[] = [
  process.env.GROQ_API_KEY ?? '',
  process.env.GROQ_API_KEY_2 ?? '',
].filter(Boolean)
const GROQ_API_KEY = GROQ_API_KEYS[0] ?? ''
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? ''
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

const GEMINI_MODEL = 'gemini-2.5-flash'
// Groq: llama-3.3-70b-versatile is the reliable tool-calling model.
// Kimi K2 removed — inconsistent function call JSON causes chain failures.
const GROQ_MODELS: readonly string[] = ['llama-3.3-70b-versatile']
// OpenRouter: free tier, OpenAI-compatible, supports function calling.
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'
// NVIDIA: nemotron-super EOL 2026-04-15. Switched to DeepSeek V3.2.
const NVIDIA_MODEL = 'deepseek-ai/deepseek-v3.2'

const MAX_ROUNDS = 8       // default for single-turn chat
const DEEP_MAX_ROUNDS = 25 // for long background tasks
const DEEP_MAX_TOOLS = 20  // tool budget for deep tasks

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
  opts: { maxRounds?: number; maxToolCalls?: number } = {},
): Promise<{ reply: string; budgetExceeded: boolean }> {
  const rounds = opts.maxRounds ?? MAX_ROUNDS
  const toolBudget = opts.maxToolCalls ?? MAX_TOOL_CALLS
  const contents = historyToGeminiContents(history, userMessage)
  const tools = toGeminiTools(manifest)

  for (let round = 0; round < rounds; round++) {
    const data = await callGeminiOnce(systemPrompt, contents, tools)
    const parts = data.candidates?.[0]?.content?.parts ?? []

    const fnCalls = parts
      .map((p) => p.functionCall)
      .filter((fc): fc is { name: string; args?: Record<string, unknown> } => !!fc)

    if (fnCalls.length === 0) {
      const text = parts.map((p) => p.text ?? '').join('').trim()
      return { reply: text, budgetExceeded: false }
    }

    // Budget check
    if (toolCalls.length + fnCalls.length > toolBudget) {
      return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
    }

    // Append the model's tool-call turn.
    contents.push({
      role: 'model',
      parts: fnCalls.map((fc) => ({
        functionCall: { name: fc.name, args: fc.args ?? {} },
      })),
    })

    // Execute calls — parallel when all names are unique, sequential otherwise.
    const responseParts: GeminiContent['parts'] = []
    const geminiRoundLogs: ToolCallLog[] = []
    const allNamesUnique = new Set(fnCalls.map((fc) => fc.name)).size === fnCalls.length
    if (allNamesUnique && fnCalls.length > 1) {
      const results = await Promise.all(
        fnCalls.map((fc) => executeToolCall(fc.name, fc.args ?? {})),
      )
      for (let i = 0; i < fnCalls.length; i++) {
        const { resultText, log } = results[i]
        toolCalls.push(log)
        geminiRoundLogs.push(log)
        responseParts.push({
          functionResponse: {
            name: fnCalls[i].name,
            response: { result: resultText },
          },
        })
      }
    } else {
      for (const fc of fnCalls) {
        const { resultText, log } = await executeToolCall(fc.name, fc.args ?? {})
        toolCalls.push(log)
        geminiRoundLogs.push(log)
        responseParts.push({
          functionResponse: {
            name: fc.name,
            response: { result: resultText },
          },
        })
      }
    }

    // Escalate any failures to the model so it can't silently paper over them.
    const geminiFailures = geminiRoundLogs.filter((log) => !log.ok)
    if (geminiFailures.length > 0) {
      const escalation = geminiFailures
        .map((log) => `[SYSTEM: Tool "${log.name}" FAILED: ${log.error ?? 'unknown'}. You MUST explicitly tell Bo about this failure in your reply. Do not pretend the task succeeded.]`)
        .join('\n')
      responseParts.push({ text: escalation } as { text: string })
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
  if (GROQ_API_KEYS.length === 0) throw new Error('GROQ_API_KEY not configured')
  let lastErr = ''
  // Rotate through keys × models — exhausts key1 models before trying key2
  for (const apiKey of GROQ_API_KEYS) {
    for (const model of GROQ_MODELS) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
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
        console.warn(`[jarvis/fc] Groq key[${GROQ_API_KEYS.indexOf(apiKey)}] ${model} rate limited → rotating`)
        continue
      }
      if (!res.ok) {
        throw new Error(parsed.data.error?.message ?? `Groq HTTP ${res.status} (${model})`)
      }
      return parsed.data
    }
  }
  throw new Error(`Groq all keys+models rate limited: ${lastErr}`)
}

async function runWithGroq(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  manifest: Manifest,
  toolCalls: ToolCallLog[],
  opts: { maxRounds?: number; maxToolCalls?: number } = {},
): Promise<{ reply: string; budgetExceeded: boolean }> {
  const rounds = opts.maxRounds ?? MAX_ROUNDS
  const toolBudget = opts.maxToolCalls ?? MAX_TOOL_CALLS
  const messages = historyToOpenAIMessages(systemPrompt, history, userMessage)
  const tools = toOpenAITools(manifest)

  for (let round = 0; round < rounds; round++) {
    const data = await callGroqOnce(messages, tools)
    const msg = data.choices?.[0]?.message
    if (!msg) return { reply: '', budgetExceeded: false }

    const calls = msg.tool_calls ?? []
    if (calls.length === 0) {
      return { reply: (msg.content ?? '').trim(), budgetExceeded: false }
    }

    if (toolCalls.length + calls.length > toolBudget) {
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

    const parsedCallsGroq = calls.map((c) => {
      let parsedArgs: unknown = {}
      try {
        parsedArgs = JSON.parse(c.function.arguments)
      } catch {
        // pass empty object — tool will reject via Zod and we'll surface error
      }
      return { c, parsedArgs }
    })

    // Parallel when all tool names in this batch are unique; sequential otherwise.
    const groqAllUnique = new Set(calls.map((c) => c.function.name)).size === calls.length
    const groqToolResults: Array<{ resultText: string; log: ToolCallLog; id: string; name: string }> = []
    if (groqAllUnique && calls.length > 1) {
      const settled = await Promise.all(
        parsedCallsGroq.map(({ c, parsedArgs }) =>
          executeToolCall(c.function.name, parsedArgs).then((r) => ({ ...r, id: c.id, name: c.function.name })),
        ),
      )
      groqToolResults.push(...settled)
    } else {
      for (const { c, parsedArgs } of parsedCallsGroq) {
        const { resultText, log } = await executeToolCall(c.function.name, parsedArgs)
        groqToolResults.push({ resultText, log, id: c.id, name: c.function.name })
      }
    }

    // Build failure escalation text (appended to last tool result message).
    const groqFailures = groqToolResults.filter(({ log }) => !log.ok)
    const groqEscalation = groqFailures.length > 0
      ? '\n\n' + groqFailures
          .map(({ log }) => `[SYSTEM: Tool "${log.name}" FAILED: ${log.error ?? 'unknown'}. You MUST explicitly tell Bo about this failure in your reply. Do not pretend the task succeeded.]`)
          .join('\n')
      : ''

    for (let i = 0; i < groqToolResults.length; i++) {
      const { resultText, log, id, name } = groqToolResults[i]
      toolCalls.push(log)
      const isLast = i === groqToolResults.length - 1
      messages.push({
        role: 'tool',
        tool_call_id: id,
        name,
        content: isLast ? resultText + groqEscalation : resultText,
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
// OpenRouter provider (OpenAI-compatible, free tier, tool-capable fallback)
// ──────────────────────────────────────────────────────────────────────────

async function callOpenRouterOnce(
  messages: OpenAIMsg[],
  tools: ReturnType<typeof toOpenAITools>,
): Promise<z.infer<typeof groqResponseSchema>> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured')
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://neuradexai.vercel.app',
      'X-Title': 'Jarvis',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
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
    throw new Error(`OpenRouter response shape invalid: ${parsed.error.message.slice(0, 120)}`)
  }
  if (!res.ok) {
    throw new Error(parsed.data.error?.message ?? `OpenRouter HTTP ${res.status}`)
  }
  return parsed.data
}

async function runWithOpenRouter(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  manifest: Manifest,
  toolCalls: ToolCallLog[],
  opts: { maxRounds?: number; maxToolCalls?: number } = {},
): Promise<{ reply: string; budgetExceeded: boolean }> {
  const rounds = opts.maxRounds ?? MAX_ROUNDS
  const toolBudget = opts.maxToolCalls ?? MAX_TOOL_CALLS
  const messages = historyToOpenAIMessages(systemPrompt, history, userMessage)
  const tools = toOpenAITools(manifest)

  for (let round = 0; round < rounds; round++) {
    const data = await callOpenRouterOnce(messages, tools)
    const msg = data.choices?.[0]?.message
    if (!msg) return { reply: '', budgetExceeded: false }

    const calls = msg.tool_calls ?? []
    if (calls.length === 0) {
      return { reply: (msg.content ?? '').trim(), budgetExceeded: false }
    }

    if (toolCalls.length + calls.length > toolBudget) {
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

    const parsedCallsOR = calls.map((c) => {
      let parsedArgs: unknown = {}
      try {
        parsedArgs = JSON.parse(c.function.arguments)
      } catch {
        // pass empty object — tool will reject via Zod and we'll surface error
      }
      return { c, parsedArgs }
    })

    // Parallel when all tool names in this batch are unique; sequential otherwise.
    const orAllUnique = new Set(calls.map((c) => c.function.name)).size === calls.length
    const orToolResults: Array<{ resultText: string; log: ToolCallLog; id: string; name: string }> = []
    if (orAllUnique && calls.length > 1) {
      const settled = await Promise.all(
        parsedCallsOR.map(({ c, parsedArgs }) =>
          executeToolCall(c.function.name, parsedArgs).then((r) => ({ ...r, id: c.id, name: c.function.name })),
        ),
      )
      orToolResults.push(...settled)
    } else {
      for (const { c, parsedArgs } of parsedCallsOR) {
        const { resultText, log } = await executeToolCall(c.function.name, parsedArgs)
        orToolResults.push({ resultText, log, id: c.id, name: c.function.name })
      }
    }

    // Build failure escalation text (appended to last tool result message).
    const orFailures = orToolResults.filter(({ log }) => !log.ok)
    const orEscalation = orFailures.length > 0
      ? '\n\n' + orFailures
          .map(({ log }) => `[SYSTEM: Tool "${log.name}" FAILED: ${log.error ?? 'unknown'}. You MUST explicitly tell Bo about this failure in your reply. Do not pretend the task succeeded.]`)
          .join('\n')
      : ''

    for (let i = 0; i < orToolResults.length; i++) {
      const { resultText, log, id, name } = orToolResults[i]
      toolCalls.push(log)
      const isLast = i === orToolResults.length - 1
      messages.push({
        role: 'tool',
        tool_call_id: id,
        name,
        content: isLast ? resultText + orEscalation : resultText,
      })
    }

    if (toolCalls.length >= toolBudget) {
      const finalData = await callOpenRouterOnce(
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
// Claude provider (paid — only when ENABLE_PAID_FALLBACK=1 + ANTHROPIC_API_KEY)
// ──────────────────────────────────────────────────────────────────────────

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

const claudeContentBlockSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.unknown()),
  }),
])

const claudeResponseSchema = z.object({
  content: z.array(claudeContentBlockSchema).optional(),
  stop_reason: z.string().optional(),
  error: z.object({ message: z.string().optional() }).optional(),
})

interface ClaudeMsg {
  role: 'user' | 'assistant'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        | { type: 'tool_result'; tool_use_id: string; content: string }
      >
}

function toClaudeTools(manifest: Manifest) {
  return manifest.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}

function historyToClaudeMessages(
  history: Message[],
  userMessage: string,
): ClaudeMsg[] {
  const msgs: ClaudeMsg[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  msgs.push({ role: 'user', content: userMessage })
  return msgs
}

async function callClaudeOnce(
  systemPrompt: string,
  messages: ClaudeMsg[],
  tools: ReturnType<typeof toClaudeTools>,
): Promise<z.infer<typeof claudeResponseSchema>> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')
  const body: Record<string, unknown> = {
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  }
  if (tools.length > 0) body['tools'] = tools
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  const raw: unknown = await res.json().catch(() => null)
  const parsed = claudeResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Claude response shape invalid: ${parsed.error.message.slice(0, 120)}`)
  }
  if (!res.ok) {
    throw new Error(parsed.data.error?.message ?? `Claude HTTP ${res.status}`)
  }
  return parsed.data
}

async function runWithClaude(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  manifest: Manifest,
  toolCalls: ToolCallLog[],
  opts: { maxRounds?: number; maxToolCalls?: number } = {},
): Promise<{ reply: string; budgetExceeded: boolean }> {
  const rounds = opts.maxRounds ?? MAX_ROUNDS
  const toolBudget = opts.maxToolCalls ?? MAX_TOOL_CALLS
  const messages = historyToClaudeMessages(history, userMessage)
  const tools = toClaudeTools(manifest)

  for (let round = 0; round < rounds; round++) {
    const data = await callClaudeOnce(systemPrompt, messages, tools)
    const content = data.content ?? []

    const toolUseBlocks = content.filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use',
    )

    if (toolUseBlocks.length === 0) {
      const text = content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
      return { reply: text, budgetExceeded: false }
    }

    if (toolCalls.length + toolUseBlocks.length > toolBudget) {
      return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
    }

    // Append the model's tool-use turn.
    messages.push({ role: 'assistant', content: content as ClaudeMsg['content'] })

    // Execute tool calls — parallel when names are unique, sequential otherwise.
    const claudeAllUnique = new Set(toolUseBlocks.map((b) => b.name)).size === toolUseBlocks.length
    const claudeToolResults: Array<{ resultText: string; log: ToolCallLog; id: string }> = []

    if (claudeAllUnique && toolUseBlocks.length > 1) {
      const settled = await Promise.all(
        toolUseBlocks.map((b) =>
          executeToolCall(b.name, b.input).then((r) => ({ ...r, id: b.id })),
        ),
      )
      claudeToolResults.push(...settled)
    } else {
      for (const b of toolUseBlocks) {
        const { resultText, log } = await executeToolCall(b.name, b.input)
        claudeToolResults.push({ resultText, log, id: b.id })
      }
    }

    const claudeFailures = claudeToolResults.filter(({ log }) => !log.ok)
    const claudeEscalation = claudeFailures.length > 0
      ? '\n\n' + claudeFailures
          .map(({ log }) => `[SYSTEM: Tool "${log.name}" FAILED: ${log.error ?? 'unknown'}. You MUST explicitly tell Bo about this failure in your reply. Do not pretend the task succeeded.]`)
          .join('\n')
      : ''

    // Build the tool_result user message.
    const toolResultContent: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> =
      claudeToolResults.map(({ resultText, log, id }, i) => {
        toolCalls.push(log)
        const isLast = i === claudeToolResults.length - 1
        return {
          type: 'tool_result' as const,
          tool_use_id: id,
          content: isLast ? resultText + claudeEscalation : resultText,
        }
      })

    messages.push({ role: 'user', content: toolResultContent })

    if (toolCalls.length >= toolBudget) {
      const finalData = await callClaudeOnce(
        systemPrompt + '\n\nYou have hit the tool-call budget. Summarize now in one short reply. Do not call any more tools.',
        messages,
        [], // no tools on the final synthesis pass
      )
      const finalContent = finalData.content ?? []
      const finalText = finalContent
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
      if (finalText) return { reply: finalText, budgetExceeded: false }
      return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
    }
  }

  return { reply: BUDGET_EXCEEDED_REPLY, budgetExceeded: true }
}

// ──────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────

/**
 * Run one Jarvis turn end-to-end with function calling.
 * Free-first: Groq → Gemini → OpenRouter → NVIDIA (text-only).
 * Paid fallback (opt-in): Claude Haiku — only when ENABLE_PAID_FALLBACK=1 AND ANTHROPIC_API_KEY is set.
 */
export async function runJarvisTurn(
  systemPrompt: string,
  userMessage: string,
  history: Message[] = [],
  opts: { maxRounds?: number; maxToolCalls?: number } = {},
): Promise<JarvisTurnResult> {
  const manifest = loadManifest()
  const toolCalls: ToolCallLog[] = []
  const lastErrors: string[] = []

  // Gemini first — 2.5 Flash follows persona and tool-calling reliably.
  // Groq Llama-3.3-70b was first but doesn't hold the JARVIS voice under complex system prompts.
  if (GOOGLE_API_KEY) {
    try {
      const { reply } = await runWithGemini(systemPrompt, history, userMessage, manifest, toolCalls, opts)
      const finalHistory: Message[] = [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]
      return { reply, toolCalls, history: finalHistory, provider: 'gemini' }
    } catch (e) {
      lastErrors.push(`Gemini: ${errMsg(e).slice(0, 120)}`)
      // eslint-disable-next-line no-console
      console.warn('[jarvis/fc] Gemini failed → Groq:', errMsg(e).slice(0, 120))
    }
  }

  // Groq — secondary (free tier, rate-limited at peak)
  if (GROQ_API_KEY) {
    try {
      const { reply } = await runWithGroq(systemPrompt, history, userMessage, manifest, toolCalls, opts)
      const finalHistory: Message[] = [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]
      return { reply, toolCalls, history: finalHistory, provider: 'groq' }
    } catch (e) {
      lastErrors.push(`Groq: ${errMsg(e).slice(0, 120)}`)
      // eslint-disable-next-line no-console
      console.warn('[jarvis/fc] Groq failed → OpenRouter:', errMsg(e).slice(0, 120))
    }
  }

  // OpenRouter — tertiary tool-capable fallback (free tier, OpenAI-compatible)
  if (OPENROUTER_API_KEY) {
    try {
      const { reply } = await runWithOpenRouter(systemPrompt, history, userMessage, manifest, toolCalls, opts)
      const finalHistory: Message[] = [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]
      return { reply, toolCalls, history: finalHistory, provider: 'openrouter' }
    } catch (e) {
      lastErrors.push(`OpenRouter: ${errMsg(e).slice(0, 120)}`)
      // eslint-disable-next-line no-console
      console.warn('[jarvis/fc] OpenRouter failed → NVIDIA:', errMsg(e).slice(0, 120))
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
      // eslint-disable-next-line no-console
      console.warn('[jarvis/fc] NVIDIA failed → Claude (paid):', errMsg(e).slice(0, 120))
    }
  }

  // Claude Haiku — paid deep-think fallback, only when opt-in env vars are set
  if (process.env.ENABLE_PAID_FALLBACK === '1' && ANTHROPIC_API_KEY) {
    try {
      const { reply } = await runWithClaude(systemPrompt, history, userMessage, manifest, toolCalls, opts)
      const finalHistory: Message[] = [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]
      return { reply, toolCalls, history: finalHistory, provider: 'claude' }
    } catch (e) {
      lastErrors.push(`Claude: ${errMsg(e).slice(0, 120)}`)
    }
  }

  throw new Error(`all providers failed: ${lastErrors.join(' | ')}`)
}

/**
 * Deep task turn — same provider chain but 25 rounds / 20 tool calls.
 * Use for background long-running tasks, not interactive chat.
 */
export async function runJarvisDeepTurn(
  systemPrompt: string,
  userMessage: string,
  history: Message[] = [],
): Promise<JarvisTurnResult> {
  return runJarvisTurn(systemPrompt, userMessage, history, {
    maxRounds: DEEP_MAX_ROUNDS,
    maxToolCalls: DEEP_MAX_TOOLS,
  })
}
