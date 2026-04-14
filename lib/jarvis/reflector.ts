/**
 * Post-session reflector.
 *
 * Sends a session transcript to NVIDIA DeepSeek V3.2 (free) with a structured
 * JSON-extraction prompt. Validates the response with Zod. NEVER calls a paid
 * API. NEVER fabricates output if the upstream call fails — throws instead.
 */

import { ReflectionResultSchema, type ReflectionResult } from './types'

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? ''
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions'
// DeepSeek V3.2 via NVIDIA inference — free tier, large context, JSON-mode
// capable. Confirmed in Bo's CLAUDE.md as the canonical free reasoner.
const REFLECTOR_MODEL = process.env.JARVIS_REFLECTOR_MODEL ?? 'deepseek-ai/deepseek-v3.2'

const SYSTEM_PROMPT = `You are Jarvis's post-session reflection module.

You receive a session transcript between Bo Bell (operator) and Jarvis (AI agent). Your job is to extract durable, learnable signal so Jarvis gets smarter over time.

Output a SINGLE JSON object matching this schema (no prose, no markdown fences, no code blocks — just raw JSON):

{
  "facts":         [{ "field": string, "value": string, "confidence": 0..1 }],
  "preferences":   [{ "kind": "liked"|"disliked", "about": string, "detail": string, "confidence": 0..1 }],
  "decisions":     [{ "decision": string, "rationale": string, "confidence": 0..1 }],
  "mistakes":      [{ "mistake": string, "avoidance": string, "confidence": 0..1 }],
  "openQuestions": [{ "question": string, "confidence": 0..1 }],
  "summary": string
}

Rules:
- Confidence reflects how clearly the transcript supports the item. 0.9+ = explicit statement. 0.6-0.8 = strong inference. <0.6 = weak/uncertain.
- Be conservative. If nothing in a category exists, return [].
- "facts" are durable traits about Bo (role, location, tools, schedule, family, etc.) — not ephemeral session state.
- "preferences" are about how Bo wants work done (style, tools, vendors, formats).
- "decisions" are concrete commitments made this session.
- "mistakes" are things Jarvis (or the agent) got wrong; "avoidance" describes how to avoid repeating.
- Never invent. If the transcript doesn't support it, leave it out.
- Keep each item under 200 words.`

interface NvidiaResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
  detail?: string
}

/**
 * Strip optional ```json fences and surrounding text the model may add.
 * Defends against models that ignore the "no fences" instruction.
 */
function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('reflector: no JSON object found in model output')
  }
  return candidate.slice(start, end + 1).trim()
}

/**
 * Reflect on a session transcript. Throws on upstream failure or unparseable
 * output — caller is responsible for logging and degrading gracefully.
 */
export async function reflect(sessionTranscript: string): Promise<ReflectionResult> {
  if (!NVIDIA_API_KEY) {
    throw new Error('reflector: NVIDIA_API_KEY not configured (free-tier required)')
  }
  const trimmed = sessionTranscript.trim()
  if (trimmed.length === 0) {
    throw new Error('reflector: empty transcript')
  }

  const userPrompt = `SESSION TRANSCRIPT:\n${trimmed}\n\nReturn only the JSON object.`

  const res = await fetch(NVIDIA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: REFLECTOR_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
      stream: false,
      response_format: { type: 'json_object' },
    }),
  })

  const data = (await res.json().catch(() => null)) as NvidiaResponse | null

  if (!res.ok) {
    const msg = data?.error?.message ?? data?.detail ?? `NVIDIA ${res.status}`
    throw new Error(`reflector upstream: ${msg}`)
  }

  const raw = data?.choices?.[0]?.message?.content?.trim() ?? ''
  if (!raw) {
    throw new Error('reflector: empty model reply')
  }

  const json = extractJsonObject(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new Error(`reflector: JSON parse failed — ${detail}`)
  }

  return ReflectionResultSchema.parse(parsed)
}
