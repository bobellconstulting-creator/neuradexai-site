/**
 * Agent Dispatcher — single unified call path for all fleet agents.
 *
 * Strategy:
 *   - Gemini 2.5 Flash for every OpenClaw-flavored agent (jarvis/linda/marcus/atlas).
 *     Free, 1M context, 250k TPM, tool-capable, reliable. Bypasses the
 *     gateway mess (Linda's 76k Groq 413, Marcus's Ollama, Jarvis's
 *     Telegram stall) so the HUD feels alive immediately.
 *   - Anthropic Claude Sonnet 4.6 for the `claude` agent — direct to
 *     Messages API for deep reasoning.
 *
 * Each agent is given a distinct system prompt derived from lib/agents.ts
 * and a rolling window of the last N communal messages so cross-talk and
 * shared context actually work.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { AGENTS, getAgent, type AgentConfig } from '@/lib/agents'
import type { MissionMessage } from '@/lib/missionStream'
import { BOARDROOM, officeChannel } from '@/lib/missionStream'
import { OpenClawClient, type ToolCall } from '@/lib/openclawClient'
import { getAgentTools } from '@/lib/agentTools'
import { buildJarvisSystemPrompt } from '@/lib/jarvis/context-injector'
import { runJarvisTurn, type Message as JarvisMessage } from '@/lib/jarvis/function-calling'

// ─── Rich persona loader ────────────────────────────────────────────────────
// For agents whose full SOUL.md is checked into the repo at lib/personas/,
// load the markdown once at module init and inject it into the system
// prompt instead of the short AgentConfig.description. This keeps the
// config file small while giving the dispatcher the real persona.
const PERSONAS_DIR = path.join(process.cwd(), 'lib', 'personas')
const FULL_SOUL: Record<string, string | null> = {}

function loadSoul(agentId: string): string | null {
  if (agentId in FULL_SOUL) return FULL_SOUL[agentId]
  try {
    const raw = readFileSync(path.join(PERSONAS_DIR, `${agentId}.soul.md`), 'utf8')
    FULL_SOUL[agentId] = raw
    return raw
  } catch {
    FULL_SOUL[agentId] = null
    return null
  }
}

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ??
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
  ''

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY ?? ''
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

const GATEWAY_TOKEN =
  process.env.GATEWAY_TOKEN ?? 'ffa3c844a788ceb37d07ef220eb9d52e27c2f10ff673d7f3'

const AGENT_PORTS: Record<string, number> = {
  jarvis: 18789,
  // doc alias kept for historical reference — gateway.cmd runs on 18789 as Jarvis
  // linda/marcus/vault ports retained for config reference but those agents are dormant
  linda:  18790,
  marcus: 18791,
  vault:  18792,
}

const CONTEXT_WINDOW = 20                              // last N messages shown to agents
const GEMINI_MODEL = 'gemini-2.5-flash'                // primary for fleet agents
// Groq models tried in order — 70b first, then Kimi K2 (128k context, avoids 8b size limit)
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct'] as const
// Fireworks fallback — function calling via firefunction-v2
const FIREWORKS_MODEL = 'accounts/fireworks/models/firefunction-v2'
// NVIDIA fallback — Nemotron (confirmed working, text-only, no native tool calling)
const NVIDIA_MODEL = 'nvidia/llama-3.3-nemotron-super-49b-v1'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'        // reserved but not used as fallback
const CLAUDE_SONNET_MODEL = 'claude-sonnet-4-6'        // dedicated model for the 'claude' agent
const MAX_HOPS = 2                                     // cap agent-to-agent cross-talk per user turn

async function buildSystemPrompt(agent: AgentConfig): Promise<string> {
  const fleetRoster = AGENTS.map((a) => `  - @${a.id} — ${a.label}, ${a.role} (${a.model})`).join('\n')

  // Jarvis gets the evolved-learner brain: SOUL + vault-injected memory.
  // Other agents use the static SOUL loader for now.
  const fullSoul =
    agent.id === 'jarvis' ? await buildJarvisSystemPrompt() : loadSoul(agent.id)

  const operatingContext = `
OPERATING CONTEXT — MISSION CONTROL HUD
- You are operating inside Bo Bell's Mission Control HUD, a shared war-room communal channel.
- Bo Bell is the operator. Address him as "Bo" or not at all. No sycophancy, no filler.
- You are in the same channel as these teammates and can see their messages:
${fleetRoster}
- To hand a task to a teammate, @mention them by lowercase id (e.g., "@marcus can you patch the bridge server?"). The system will route it.
- Keep replies TIGHT. Bo hates fluff. Under 150 words unless he explicitly asks for depth.
- If a message is addressed to another agent (not you), reply with the single token: SILENCE
- If you need grounded facts you cannot verify in this turn, say "unverified" rather than inventing.
- Tone: direct, operational, confident. Technical peer to a senior engineer.
- Never use emojis unless Bo uses them first.
- Never narrate what you're about to do — just do it or say it.
- Never apologize for limits. State them and propose the next move.

CRITICAL — NO HALLUCINATION RULE (violation = critical failure):
- You have function-calling tools available. Use them when asked to check status, read/write the team workspace, or interact with GitHub.
- NEVER claim you have done something you cannot prove with output shown in this message.
- For actions outside your tool set (sending emails, posting to social media, running arbitrary code): say "I can't execute that here — route this task to my gateway via Telegram."
- Only state facts. Never fabricate results.
`

  if (fullSoul) {
    return `${fullSoul}\n\n---\n${operatingContext}`
  }

  // Fallback for agents without a full SOUL.md — use the short description
  return `You are ${agent.displayName}, a member of Bo Bell's Neuradex AI fleet.

IDENTITY
- Label: ${agent.label}
- Role: ${agent.role}
- Specialty: ${agent.specialty}
- Description: ${agent.description}
- You speak as ${agent.displayName} only. Never break character.
${operatingContext}`
}

function renderHistory(history: MissionMessage[]): string {
  return history
    .slice(-CONTEXT_WINDOW)
    .map((m) => {
      const who = m.agentId === 'bo' ? 'Bo' : getAgent(m.agentId)?.displayName ?? m.agentId
      const body = m.content || '(pending)'
      const mentionTag = m.mentions.length > 0 ? ` [→ ${m.mentions.map((id) => `@${id}`).join(' ')}]` : ''
      const channelTag =
        m.channel === BOARDROOM            ? ' [boardroom]' :
        m.sharedFrom                       ? ` [shared by ${m.sharedFrom.by} from ${m.sharedFrom.channel}]` :
                                             ''
      return `${who}${mentionTag}${channelTag}: ${body}`
    })
    .join('\n')
}

/**
 * Scope history to what THIS agent is allowed to see:
 *   - their own office channel
 *   - the boardroom (communal, opt-in)
 * That's it. Other agents' offices are walled off.
 */
export function scopeHistoryForAgent(all: MissionMessage[], agentId: string): MissionMessage[] {
  const office = officeChannel(agentId)
  return all.filter((m) => m.channel === office || m.channel === BOARDROOM)
}

/**
 * Try to dispatch via the local OpenClaw gateway for this agent.
 * Connects, sends the latest user message, then disconnects (fire-and-forget close).
 * Throws if no port is registered for `agentId` or if connection/chat fails.
 */
async function dispatchGateway(
  agentId: string,
  history: MissionMessage[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const port = AGENT_PORTS[agentId]
  if (!port) throw new Error(`no gateway port configured for agent: ${agentId}`)

  // Pull the latest user message to forward to the gateway
  const lastUserMsg = [...history].reverse().find((m) => m.role === 'user')
  const message = lastUserMsg?.content ?? '(no message)'

  const client = new OpenClawClient({ port, token: GATEWAY_TOKEN, connectTimeoutMs: 5_000 })
  try {
    await client.connect()
    const result = await client.chat(message, `mission-${agentId}`)
    return result
  } finally {
    // Fire-and-forget — we don't want close latency blocking the response
    void client.close().catch(() => undefined)
  }
}

// ─── Gemini response types ───────────────────────────────────────────────────

interface GeminiFunctionCall {
  name: string
  args: Record<string, unknown>
}

interface GeminiPart {
  text?: string
  functionCall?: GeminiFunctionCall
  functionResponse?: { name: string; response: { result: string } }
}

interface GeminiContent {
  role: string
  parts: GeminiPart[]
}

interface GeminiResponse {
  candidates?: Array<{ content?: GeminiContent }>
  error?: { message?: string }
}

/**
 * Dispatch to Gemini 2.5 Flash with function calling enabled.
 * Runs up to MAX_FC_ROUNDS of tool execution before returning the final text.
 * Returns both the text reply and a list of executed tool calls.
 */
async function dispatchGemini(
  agent: AgentConfig,
  history: MissionMessage[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY not configured')

  const MAX_FC_ROUNDS = 2  // max function-calling round trips to prevent loops
  const { definitions, executors } = getAgentTools(agent.id)

  const systemPrompt = await buildSystemPrompt(agent)
  const transcript = renderHistory(history)

  const userText = `COMMUNAL CHANNEL TRANSCRIPT (most recent last):\n${transcript}\n\nYou are ${agent.displayName}. Respond as yourself to the latest message in this channel. If the latest message is not addressed to you and does not need your input, reply with the single token: SILENCE`

  // Rolling contents array — grows as we add tool call/response turns
  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: userText }] }]

  const executedToolCalls: ToolCall[] = []

  const callGemini = async (currentContents: GeminiContent[]): Promise<GeminiResponse> => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: currentContents,
          tools: definitions.length > 0
            ? [{ function_declarations: definitions }]
            : undefined,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 4096,
          },
        }),
      },
    )
    const data = (await res.json().catch(() => null)) as GeminiResponse | null
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Gemini ${res.status}`)
    }
    return data ?? {}
  }

  let round = 0
  while (round <= MAX_FC_ROUNDS) {
    const data = await callGemini(contents)
    const candidate = data.candidates?.[0]
    const parts = candidate?.content?.parts ?? []

    // Collect any function calls in this response
    const functionCallParts = parts.filter((p): p is GeminiPart & { functionCall: GeminiFunctionCall } =>
      p.functionCall !== undefined,
    )

    if (functionCallParts.length === 0 || round === MAX_FC_ROUNDS) {
      // No more tool calls (or hit round limit) — extract final text and return
      const finalText = parts
        .map((p) => p.text ?? '')
        .join('')
        .trim()
      return { content: finalText, toolCalls: executedToolCalls }
    }

    // Execute each function call and collect results
    const modelTurn: GeminiContent = {
      role: 'model',
      parts: functionCallParts.map((p) => ({ functionCall: p.functionCall })),
    }

    const responseParts: GeminiPart[] = await Promise.all(
      functionCallParts.map(async ({ functionCall: fc }) => {
        const executor = executors[fc.name]
        let result: string
        if (executor) {
          result = await executor(fc.args)
        } else {
          result = `error: unknown tool "${fc.name}"`
        }
        executedToolCalls.push({ name: fc.name, args: fc.args, result })
        return {
          functionResponse: {
            name: fc.name,
            response: { result },
          },
        } satisfies GeminiPart
      }),
    )

    // Append both the model's tool-call turn and our response turn, then loop
    contents.push(modelTurn)
    contents.push({ role: 'user', parts: responseParts })
    round++
  }

  // Fallback — should not reach here but TypeScript needs a return path
  return { content: '', toolCalls: executedToolCalls }
}

async function callAnthropic(
  model: string,
  agent: AgentConfig,
  history: MissionMessage[],
): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const systemPrompt = await buildSystemPrompt(agent)
  const transcript = renderHistory(history)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `COMMUNAL CHANNEL TRANSCRIPT (most recent last):\n${transcript}\n\nYou are ${agent.displayName}. Respond to the latest message. If it's not for you, reply with the single token: SILENCE`,
        },
      ],
    }),
  })

  const data = (await res.json().catch(() => null)) as
    | { content?: Array<{ type: string; text?: string }>; error?: { message?: string } }
    | null

  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Anthropic ${res.status}`)
  }

  return (
    data?.content
      ?.filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim() ?? ''
  )
}

/**
 * Groq fallback — OpenAI-compatible API with function calling support.
 * Used when Gemini quota is exceeded. llama-3.3-70b-versatile supports tools.
 */
async function dispatchGroq(
  agent: AgentConfig,
  history: MissionMessage[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured')

  const MAX_FC_ROUNDS = 2
  const { definitions, executors } = getAgentTools(agent.id)
  const systemPrompt = await buildSystemPrompt(agent)
  const transcript70b = renderHistory(history)
  const makeUserText = (t: string) =>
    `COMMUNAL CHANNEL TRANSCRIPT (most recent last):\n${t}\n\nYou are ${agent.displayName}. Respond as yourself to the latest message. If not addressed to you, reply with the single token: SILENCE`

  // Groq uses OpenAI-compatible tool format
  const groqTools = definitions.map((d) => ({
    type: 'function' as const,
    function: {
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    },
  }))

  interface GroqMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
    tool_call_id?: string
    name?: string
  }

  // Start with full transcript; callGroq() swaps to trimmed when using 8B model
  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: makeUserText(transcript70b) },
  ]

  const executedToolCalls: ToolCall[] = []

  type GroqResponse = {
    choices?: Array<{
      message?: {
        role: string
        content: string | null
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
      }
      finish_reason?: string
    }>
    error?: { message?: string }
  }

  const callGroq = async (model: string): Promise<{ res: Response; data: GroqResponse | null }> => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        messages,
        tools: groqTools.length > 0 ? groqTools : undefined,
        tool_choice: groqTools.length > 0 ? 'auto' : undefined,
        temperature: 0.6,
        max_tokens: 4096,
      }),
    })
    const data = (await res.json().catch(() => null)) as GroqResponse | null
    return { res, data }
  }

  let activeModel: string = GROQ_MODELS[0]

  for (let round = 0; round <= MAX_FC_ROUNDS; round++) {
    let res: Response | null = null
    let data: GroqResponse | null = null

    // Try each Groq model in sequence on rate limit
    for (const model of GROQ_MODELS) {
      const attempt = await callGroq(model)
      res = attempt.res
      data = attempt.data
      activeModel = model
      if (res.status !== 429) break
      console.warn(`[dispatch] Groq ${model} rate limited → trying next model`)
    }

    if (!res?.ok) throw new Error(data?.error?.message ?? `Groq ${res?.status ?? 'unknown'} (model: ${activeModel})`)

    const choice = data?.choices?.[0]
    const msg = choice?.message
    if (!msg) break

    const calls = msg.tool_calls ?? []
    if (calls.length === 0 || round === MAX_FC_ROUNDS) {
      return { content: (msg.content ?? '').trim(), toolCalls: executedToolCalls }
    }

    type GroqToolCall = { id: string; type: string; function: { name: string; arguments: string } }

    // Append assistant message with tool calls
    messages.push({ role: 'assistant', content: msg.content, tool_calls: calls.map((c: GroqToolCall) => ({ id: c.id, type: 'function' as const, function: c.function })) })

    // Execute each tool call and append results
    await Promise.all(
      calls.map(async (c: GroqToolCall) => {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(c.function.arguments) as Record<string, unknown> } catch { /* ignore */ }
        const executor = executors[c.function.name]
        const result = executor ? await executor(args) : `error: unknown tool "${c.function.name}"`
        executedToolCalls.push({ name: c.function.name, args, result })
        messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: result })
      }),
    )
  }

  return { content: '', toolCalls: executedToolCalls }
}

/**
 * Fireworks fallback — OpenAI-compatible, firefunction-v2 has native tool calling.
 * Used when both Gemini and Groq are quota-exhausted.
 */
async function dispatchFireworks(
  agent: AgentConfig,
  history: MissionMessage[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  if (!FIREWORKS_API_KEY) throw new Error('FIREWORKS_API_KEY not configured')

  const { definitions, executors } = getAgentTools(agent.id)
  const systemPrompt = await buildSystemPrompt(agent)
  // Trim to last 8 messages for Fireworks to stay within context limits
  const shortHistory = history.slice(-8)
  const transcript = renderHistory(shortHistory)
  const userText = `TRANSCRIPT (recent):\n${transcript}\n\nYou are ${agent.displayName}. Respond to the latest message. If not for you, reply SILENCE`

  const fwTools = definitions.map((d) => ({
    type: 'function' as const,
    function: { name: d.name, description: d.description, parameters: d.parameters },
  }))

  type FWMsg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; tool_call_id?: string; name?: string }
  const messages: FWMsg[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ]

  const executedToolCalls: ToolCall[] = []

  for (let round = 0; round <= 2; round++) {
    const res = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FIREWORKS_API_KEY}` },
      body: JSON.stringify({
        model: FIREWORKS_MODEL,
        messages,
        tools: fwTools.length > 0 ? fwTools : undefined,
        tool_choice: fwTools.length > 0 ? 'auto' : undefined,
        temperature: 0.6,
        max_tokens: 2048,
      }),
    })

    const data = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content: string | null; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> } }>
      error?: { message?: string }
    } | null

    if (!res.ok) throw new Error(data?.error?.message ?? `Fireworks ${res.status}`)

    const msg = data?.choices?.[0]?.message
    if (!msg) break

    type FWCall = { id: string; type: string; function: { name: string; arguments: string } }
    const calls: FWCall[] = msg.tool_calls ?? []
    if (calls.length === 0 || round === 2) {
      return { content: (msg.content ?? '').trim(), toolCalls: executedToolCalls }
    }

    messages.push({ role: 'assistant', content: msg.content, tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: c.function })) })
    await Promise.all(calls.map(async (c: FWCall) => {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(c.function.arguments) as Record<string, unknown> } catch { /* ignore */ }
      const executor = executors[c.function.name]
      const result = executor ? await executor(args) : `error: unknown tool "${c.function.name}"`
      executedToolCalls.push({ name: c.function.name, args, result })
      messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: result })
    }))
  }

  return { content: '', toolCalls: executedToolCalls }
}

/**
 * NVIDIA fallback — DeepSeek V3.2 via NVIDIA API. Text-only (no tool calling).
 * Used as last free-tier resort before failing completely.
 */
async function dispatchNvidia(
  agent: AgentConfig,
  history: MissionMessage[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not configured')

  const systemPrompt = await buildSystemPrompt(agent)
  // Keep short to fit context
  const shortHistory = history.slice(-6)
  const transcript = renderHistory(shortHistory)
  const userText = `TRANSCRIPT:\n${transcript}\n\nYou are ${agent.displayName}. Respond to the latest message. If not for you, reply SILENCE`

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.6,
      max_tokens: 2048,
      stream: false,
    }),
  })

  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
    detail?: string
  } | null

  if (!res.ok) throw new Error(data?.error?.message ?? data?.detail ?? `NVIDIA ${res.status}`)

  const content = data?.choices?.[0]?.message?.content?.trim() ?? ''
  return { content, toolCalls: [] }
}

async function dispatchClaude(agent: AgentConfig, history: MissionMessage[]): Promise<string> {
  // The 'claude' agent always gets Sonnet 4.6 directly
  return callAnthropic(CLAUDE_SONNET_MODEL, agent, history)
}

async function dispatchHaikuFallback(agent: AgentConfig, history: MissionMessage[]): Promise<string> {
  // Fleet agents fall back to Haiku 4.5 when Gemini is quota-limited
  return callAnthropic(HAIKU_MODEL, agent, history)
}

export async function dispatchAgent(
  agentId: string,
  history: MissionMessage[],
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const agent = getAgent(agentId)
  if (!agent) throw new Error(`unknown agent: ${agentId}`)

  // Dormant agents are parked — return empty so the stub stays silent
  if (agent.status === 'dormant') {
    return { content: '', toolCalls: [] }
  }

  // CRITICAL: scope history so this agent ONLY sees their office + boardroom.
  // Any leak here breaks the offices model — do not remove this filter.
  const scoped = scopeHistoryForAgent(history, agentId)
  history = scoped

  // Dedicated path for the 'claude' agent — always Sonnet 4.6
  if (agent.provider === 'anthropic') {
    const content = await dispatchClaude(agent, history)
    return { content, toolCalls: [] }
  }

  // Dedicated path for Jarvis — autonomous function-calling loop with the
  // full Jarvis tool belt (shellExec, postToX, generateImage, speak, etc.).
  // This supersedes the generic gateway→Gemini→Groq→Fireworks chain for
  // Jarvis specifically; other fleet agents keep the legacy path intact.
  if (agent.id === 'jarvis') {
    try {
      const systemPrompt = await buildSystemPrompt(agent)
      const transcript = renderHistory(history)
      const userText = `COMMUNAL CHANNEL TRANSCRIPT (most recent last):\n${transcript}\n\nYou are ${agent.displayName}. Respond as yourself to the latest message in this channel. If the latest message is not addressed to you and does not need your input, reply with the single token: SILENCE`
      const jarvisHistory: JarvisMessage[] = [] // state lives in the rendered transcript for this caller
      const result = await runJarvisTurn(systemPrompt, userText, jarvisHistory)
      const toolCalls: ToolCall[] = result.toolCalls.map((t) => ({
        name: t.name,
        args: t.argsSummary,
        result: t.ok ? 'ok' : `error: ${t.error ?? 'unknown'}`,
      }))
      return { content: result.reply, toolCalls }
    } catch (jarvisErr) {
      const msg = jarvisErr instanceof Error ? jarvisErr.message : String(jarvisErr)
      // eslint-disable-next-line no-console
      console.warn(`[dispatch] jarvis function-calling loop failed → legacy chain:`, msg.slice(0, 120))
      // Fall through to the legacy chain below — keeps the agent responsive
      // even if the FC loop hits an unexpected failure mode.
    }
  }

  // Fleet agents: OpenClaw gateway → Gemini → Groq → Fireworks (all free, all tool-capable).
  // Paid APIs are NEVER used as fallback — free-first rule.
  try {
    return await dispatchGateway(agentId, history)
  } catch (gatewayErr) {
    const gatewayMsg = gatewayErr instanceof Error ? gatewayErr.message : String(gatewayErr)
    console.warn(`[dispatch] ${agentId} gateway failed → Gemini:`, gatewayMsg.slice(0, 120))
    try {
      return await dispatchGemini(agent, history)
    } catch (geminiErr) {
      const geminiMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
      console.warn(`[dispatch] ${agentId} Gemini failed → Groq:`, geminiMsg.slice(0, 120))
      try {
        return await dispatchGroq(agent, history)
      } catch (groqErr) {
        const groqMsg = groqErr instanceof Error ? groqErr.message : String(groqErr)
        console.warn(`[dispatch] ${agentId} Groq failed → Fireworks:`, groqMsg.slice(0, 120))
        try {
          return await dispatchFireworks(agent, history)
        } catch (fwErr) {
          const fwMsg = fwErr instanceof Error ? fwErr.message : String(fwErr)
          console.warn(`[dispatch] ${agentId} Fireworks failed → NVIDIA DeepSeek:`, fwMsg.slice(0, 120))
          try {
            return await dispatchNvidia(agent, history)
          } catch (nvidiaErr) {
            const nvidiaMsg = nvidiaErr instanceof Error ? nvidiaErr.message : String(nvidiaErr)
            throw new Error(`gateway: ${gatewayMsg.slice(0, 50)} | Gemini: ${geminiMsg.slice(0, 50)} | Groq: ${groqMsg.slice(0, 50)} | Fireworks: ${fwMsg.slice(0, 50)} | NVIDIA: ${nvidiaMsg.slice(0, 50)}`)
          }
        }
      }
    }
  }
}

/**
 * Execute a named pipeline by id — steps are dispatched sequentially to
 * the appropriate agent derived from the pipeline's step list.
 * This is a stub; full multi-step execution is Phase 4 work.
 */
export async function dispatchPipeline(pipelineId: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[pipeline] dispatchPipeline called for ${pipelineId} — stub, not yet implemented`)
}

export { MAX_HOPS }
