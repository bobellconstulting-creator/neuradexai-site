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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

const CONTEXT_WINDOW = 20                              // last N messages shown to agents
const GEMINI_MODEL = 'gemini-2.5-flash'                // primary for fleet agents
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'        // fallback when Gemini 429s
const CLAUDE_SONNET_MODEL = 'claude-sonnet-4-6'        // dedicated model for the 'claude' agent
const MAX_HOPS = 2                                     // cap agent-to-agent cross-talk per user turn

function buildSystemPrompt(agent: AgentConfig): string {
  const fleetRoster = AGENTS.map((a) => `  - @${a.id} — ${a.label}, ${a.role} (${a.model})`).join('\n')

  // If this agent has a full SOUL.md, that's the canonical persona — prepend it.
  const fullSoul = loadSoul(agent.id)

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

async function dispatchGemini(agent: AgentConfig, history: MissionMessage[]): Promise<string> {
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY not configured')

  const systemPrompt = buildSystemPrompt(agent)
  const transcript = renderHistory(history)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `COMMUNAL CHANNEL TRANSCRIPT (most recent last):\n${transcript}\n\nYou are ${agent.displayName}. Respond as yourself to the latest message in this channel. If the latest message is not addressed to you and does not need your input, reply with the single token: SILENCE`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 4096,
        },
      }),
    },
  )

  const data = (await res.json().catch(() => null)) as
    | {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        error?: { message?: string }
      }
    | null

  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Gemini ${res.status}`)
  }

  const reply =
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim() ?? ''

  return reply
}

async function callAnthropic(
  model: string,
  agent: AgentConfig,
  history: MissionMessage[],
): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const systemPrompt = buildSystemPrompt(agent)
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
): Promise<string> {
  const agent = getAgent(agentId)
  if (!agent) throw new Error(`unknown agent: ${agentId}`)

  // CRITICAL: scope history so this agent ONLY sees their office + boardroom.
  // Any leak here breaks the offices model — do not remove this filter.
  const scoped = scopeHistoryForAgent(history, agentId)
  history = scoped

  // Dedicated path for the 'claude' agent — always Sonnet 4.6
  if (agent.provider === 'anthropic') {
    return dispatchClaude(agent, history)
  }

  // Fleet agents: Gemini primary → Anthropic Haiku fallback.
  // This keeps the HUD alive even when the free Gemini tier is throttled
  // or the key rotates. Errors are only surfaced if BOTH paths fail.
  try {
    return await dispatchGemini(agent, history)
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    // eslint-disable-next-line no-console
    console.warn(`[dispatch] ${agentId} Gemini failed → Haiku fallback:`, msg.slice(0, 200))
    try {
      return await dispatchHaikuFallback(agent, history)
    } catch (fallbackErr) {
      const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new Error(`Gemini: ${msg.slice(0, 120)} | Haiku: ${fbMsg.slice(0, 120)}`)
    }
  }
}

export { MAX_HOPS }
