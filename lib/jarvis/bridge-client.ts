/**
 * Jarvis Bridge Client
 *
 * When JARVIS_BRIDGE_URL is set, routes COG filesystem tool calls to the local
 * Express bridge running on Bo's PC (exposed via Cloudflare Tunnel).
 * Falls back to direct fs access when running locally without the bridge.
 */

const BRIDGE_URL    = process.env.JARVIS_BRIDGE_URL
const BRIDGE_SECRET = process.env.JARVIS_BRIDGE_SECRET

/** True when we're running on Vercel and the bridge is configured. */
export function bridgeAvailable(): boolean {
  return Boolean(BRIDGE_URL && BRIDGE_SECRET)
}

export interface BridgeResult<T = unknown> {
  ok: boolean
  result?: T
  error?: string
}

/**
 * Call a tool on the local bridge.
 * Returns { ok: false, error } if bridge is unavailable or the call fails.
 */
export async function callBridge<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<BridgeResult<T>> {
  if (!BRIDGE_URL || !BRIDGE_SECRET) {
    return { ok: false, error: 'Bridge not configured (JARVIS_BRIDGE_URL / JARVIS_BRIDGE_SECRET missing)' }
  }

  try {
    const res = await fetch(`${BRIDGE_URL}/tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BRIDGE_SECRET}`,
      },
      body: JSON.stringify({ name, args }),
      signal: AbortSignal.timeout(12_000),
    })

    const json = (await res.json()) as BridgeResult<T>
    return json
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Bridge call failed: ${msg}` }
  }
}
