/**
 * Jarvis provider router — classifies task complexity and picks the right model tier.
 * Free-first always. Paid never fires unless ENABLE_PAID_FALLBACK=1.
 */

export type TaskClass =
  | 'classify'      // label/triage/tag — fast, cheap
  | 'draft'         // short reply, email draft, one-paragraph write
  | 'research'      // synthesis, multi-source summarization
  | 'tool_calling'  // multi-step agentic loop with tools
  | 'embedding'     // vector embedding
  | 'deep'          // complex reasoning, architecture — paid opt-in

export interface RouteDecision {
  provider: 'groq' | 'gemini' | 'openrouter' | 'nvidia' | 'claude'
  model: string
  rationale: string
  freeTier: boolean
}

const PAID_ENABLED = process.env.ENABLE_PAID_FALLBACK === '1'

// Keyword signals → task class
const CLASSIFY_SIGNALS = /\b(classify|label|triage|tag|categorize|is this|true or false|yes or no)\b/i
const RESEARCH_SIGNALS = /\b(research|summarize|synthesize|compare|analyze|find|search|learn about)\b/i
const TOOL_SIGNALS     = /\b(read|write|create|update|delete|deploy|post|send|fetch|run|execute|fix|build)\b/i
const DEEP_SIGNALS     = /\b(architecture|design|refactor|audit|review|critique|explain deeply|reason through)\b/i

export function classifyTask(message: string): TaskClass {
  if (DEEP_SIGNALS.test(message))    return 'deep'
  if (TOOL_SIGNALS.test(message))    return 'tool_calling'
  if (RESEARCH_SIGNALS.test(message)) return 'research'
  if (CLASSIFY_SIGNALS.test(message)) return 'classify'
  return 'draft'
}

export function routeTask(taskClass: TaskClass): RouteDecision {
  switch (taskClass) {
    case 'classify':
      return {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        rationale: 'Fast free classification',
        freeTier: true,
      }

    case 'draft':
      return {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        rationale: 'Short drafts — Groq free tier handles it',
        freeTier: true,
      }

    case 'research':
      return {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        rationale: 'Gemini 2.5 Flash — long context, free, good synthesis',
        freeTier: true,
      }

    case 'tool_calling':
      // Gemini first for tool calling — follows persona better than Groq
      return {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        rationale: 'Gemini — reliable tool-calling + persona adherence',
        freeTier: true,
      }

    case 'embedding':
      return {
        provider: 'gemini',
        model: 'text-embedding-004',
        rationale: 'Gemini free embeddings, 768-dim',
        freeTier: true,
      }

    case 'deep':
      if (PAID_ENABLED) {
        return {
          provider: 'claude',
          model: 'claude-haiku-4-5-20251001',
          rationale: 'Deep reasoning — Claude Haiku (paid opt-in)',
          freeTier: false,
        }
      }
      // Free fallback for deep when paid not enabled
      return {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        rationale: 'Deep reasoning — Gemini free fallback (paid not enabled)',
        freeTier: true,
      }
  }
}

export function route(message: string): RouteDecision {
  return routeTask(classifyTask(message))
}
