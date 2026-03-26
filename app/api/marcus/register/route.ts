import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MARCUS_TOKEN = process.env.MARCUS_TELEGRAM_TOKEN ?? '8667240819:AAHQds02Ecu8v-gjQg0Pq7pt1biLfYZCDd0'
const BO_CHAT_ID   = parseInt(process.env.MARCUS_BO_CHAT_ID ?? '7240677590')
const TG_API       = `https://api.telegram.org/bot${MARCUS_TOKEN}`

// Registers the Telegram webhook and sends Bo the "Marcus online" message.
// Call once after deploy: GET https://neuradexai.com/api/marcus/register
export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = req.headers.get('host') ?? 'neuradexai.com'
  const webhookUrl = `https://${host}/api/marcus`

  // Register webhook
  const regResponse = await fetch(`${TG_API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      drop_pending_updates: true,
      allowed_updates: ['message'],
    }),
  })
  const regData = await regResponse.json() as { ok: boolean; description?: string }

  // Send Marcus online message to Bo
  if (regData.ok) {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: BO_CHAT_ID,
        text: [
          '*Marcus online.*',
          '',
          'Co-founder mode activated. Running on Vercel at neuradexai.com.',
          '',
          `*Webhook:* ${webhookUrl}`,
          '*Memory:* GitHub-backed (persistent)',
          '*Brain:* Kimi K2.5 via Fireworks',
          '*Tools:* web search, market research, site monitoring, memory',
          '',
          'Talk to me. I\'ll research, plan, and push BuckGrid forward.',
        ].join('\n'),
        parse_mode: 'Markdown',
      }),
    })
  }

  return NextResponse.json({
    webhook: webhookUrl,
    registered: regData.ok,
    telegram: regData,
  })
}
