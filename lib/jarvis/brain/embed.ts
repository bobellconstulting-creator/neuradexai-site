/**
 * Embedding client — Gemini text-embedding-004 (free, 768-dim).
 * Falls back to null on rate limit; caller handles gracefully.
 */

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? ''
const EMBED_MODEL = 'text-embedding-004'
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GOOGLE_API_KEY}`

export async function embed(text: string): Promise<number[] | null> {
  if (!GOOGLE_API_KEY) return null
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] } }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json() as { embedding?: { values?: number[] } }
    return data.embedding?.values ?? null
  } catch {
    return null
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0
}
