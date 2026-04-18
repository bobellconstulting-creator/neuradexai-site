/**
 * Ground truth injected into every Jarvis turn.
 * Current time (CT), Bo's home base, NWS weather summary.
 * Cached 5 min. Never breaks the turn if fetch fails.
 */

const CT_TIMEZONE = 'America/Chicago'
const HOME_LAT = 38.6603  // Council Grove, KS
const HOME_LON = -96.4920
const NWS_POINT_URL = `https://api.weather.gov/points/${HOME_LAT},${HOME_LON}`
const CACHE_TTL_MS = 5 * 60 * 1000

interface GroundTruth {
  block: string
  fetchedAt: number
}

let cache: GroundTruth | null = null

function nowCT(): string {
  return new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: CT_TIMEZONE,
  })
}

function ctHour(): number {
  return (new Date().getUTCHours() - 5 + 24) % 24
}

async function fetchNWSWeather(): Promise<string> {
  try {
    const pointRes = await fetch(NWS_POINT_URL, {
      headers: { 'User-Agent': 'NeuradexAI/Jarvis (bobellconstulting@gmail.com)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!pointRes.ok) return ''
    const point = await pointRes.json() as { properties?: { forecastHourly?: string; forecast?: string } }
    const forecastUrl = point.properties?.forecastHourly ?? point.properties?.forecast
    if (!forecastUrl) return ''

    const fcRes = await fetch(forecastUrl, {
      headers: { 'User-Agent': 'NeuradexAI/Jarvis (bobellconstulting@gmail.com)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!fcRes.ok) return ''
    const fc = await fcRes.json() as { properties?: { periods?: Array<{ shortForecast: string; temperature: number; temperatureUnit: string; windSpeed: string }> } }
    const period = fc.properties?.periods?.[0]
    if (!period) return ''
    return `${period.temperature}°${period.temperatureUnit} ${period.shortForecast} wind ${period.windSpeed}`
  } catch {
    return ''
  }
}

async function fetchNWSAlerts(): Promise<string> {
  try {
    const url = `https://api.weather.gov/alerts/active?point=${HOME_LAT},${HOME_LON}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NeuradexAI/Jarvis (bobellconstulting@gmail.com)' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return ''
    const data = await res.json() as { features?: Array<{ properties?: { event: string; severity: string } }> }
    const alerts = data.features ?? []
    if (alerts.length === 0) return ''
    const severe = alerts.filter((a) => {
      const sev = a.properties?.severity ?? ''
      return ['Extreme', 'Severe'].includes(sev)
    })
    if (severe.length === 0) return ''
    return `⚠️ NWS ALERT: ${severe.map((a) => a.properties?.event).join(', ')}`
  } catch {
    return ''
  }
}

export async function buildGroundTruth(): Promise<string> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.block

  const [weather, alert] = await Promise.all([fetchNWSWeather(), fetchNWSAlerts()])

  const hour = ctHour()
  const quietHours = hour >= 23 || hour < 6

  const lines = [
    `## Ground Truth`,
    `Now: ${nowCT()} CT`,
    `Location: Council Grove, KS (home base)`,
  ]
  if (weather) lines.push(`Weather: ${weather}`)
  if (alert)   lines.push(alert)
  if (quietHours) lines.push(`Quiet hours active (23:00–06:00 CT) — non-emergency pings suppressed.`)

  const block = lines.join('\n')
  cache = { block, fetchedAt: Date.now() }
  return block
}
