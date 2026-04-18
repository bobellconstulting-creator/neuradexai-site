/**
 * Jarvis offline queue — persists bridge tool calls when PC is off.
 * Uses Upstash Redis (free tier) via REST API.
 * On PC wake, bridge server drains this queue automatically.
 *
 * Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL ?? ''
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? ''
const QUEUE_KEY   = 'jarvis:pending-bridge-calls'

export interface QueuedCall {
  id: string
  tool: string
  args: unknown
  chatId: string
  queuedAt: string
}

function available(): boolean {
  return !!(REDIS_URL && REDIS_TOKEN)
}

async function redisCmd(...args: unknown[]): Promise<unknown> {
  const res = await fetch(`${REDIS_URL}/${args.map((a) => encodeURIComponent(String(a))).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  })
  const data = await res.json() as { result: unknown }
  return data.result
}

export async function enqueue(call: Omit<QueuedCall, 'id' | 'queuedAt'>): Promise<boolean> {
  if (!available()) return false
  const entry: QueuedCall = {
    ...call,
    id: Math.random().toString(36).slice(2),
    queuedAt: new Date().toISOString(),
  }
  try {
    await redisCmd('RPUSH', QUEUE_KEY, JSON.stringify(entry))
    return true
  } catch {
    return false
  }
}

export async function dequeueAll(): Promise<QueuedCall[]> {
  if (!available()) return []
  try {
    const len = (await redisCmd('LLEN', QUEUE_KEY)) as number
    if (!len) return []
    const items = (await redisCmd('LRANGE', QUEUE_KEY, '0', String(len - 1))) as string[]
    await redisCmd('DEL', QUEUE_KEY)
    return items.map((i) => JSON.parse(i) as QueuedCall)
  } catch {
    return []
  }
}

export async function queueLength(): Promise<number> {
  if (!available()) return 0
  try {
    return (await redisCmd('LLEN', QUEUE_KEY)) as number
  } catch {
    return 0
  }
}

export { available as queueAvailable }
