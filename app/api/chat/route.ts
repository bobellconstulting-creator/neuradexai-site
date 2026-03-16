import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GOOGLE_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

type ChatRequestBody = {
  message: string
  imageDataUrl?: string
}

function buildFallbackTonyReply(message: string, hasImage: boolean) {
  const lowered = message.toLowerCase()

  if (lowered.includes('stand')) {
    return hasImage
      ? 'Start with the cleanest downwind access and hang your first early-season stand where cover pinches into food or a staging edge. If the map shows open exposure around the stand, back it into thicker cover so deer can stage before dark without seeing you.'
      : 'Without the visual read, I would start with a low-impact access route and a stand that catches deer staging before they step into the food. Favor the first inside corner, pinch, or cover seam you can hunt with a clean wind.'
  }

  if (lowered.includes('sanctuary') || lowered.includes('bedding')) {
    return 'Put the sanctuary in the hardest-to-access cover on the property, ideally where intrusion can stay near zero through season. The right move is thickening a back-corner or interior pocket that deer can reach without crossing your primary access.'
  }

  if (lowered.includes('build') || lowered.includes('week') || lowered.includes('improve')) {
    return 'Your first build should usually be the move that improves daylight use without educating deer: safer access, tighter cover near food, or a defined staging pocket. Do the highest-leverage habitat work closest to existing deer movement before you spend time on cosmetic additions.'
  }

  if (hasImage) {
    return 'The live vision lane is degraded right now, but the layout should still be judged in this order: access, sanctuary, staging cover, then food placement. If you want a stronger audit, lock the boundary first and ask Tony for the highest-leverage habitat move.'
  }

  return 'Start by locking the property boundary, then ask for one decision at a time: best stand, sanctuary location, access route, or first habitat improvement. BuckGrid is strongest when it turns a messy aerial into a ranked build order.'
}

const TONY_SYSTEM = `You are Tony LaPratt, an elite whitetail habitat consultant with 30+ years of experience across 150,000+ acres. You're looking at a satellite image of a hunting property.

Rules:
- Be direct, calm, and constructive — reference what you see in the image (timber patches, field edges, water, ridgelines)
- Use habitat vocabulary naturally: staging area, sanctuary, pinch point, hinge cut, thermal thermals, TSI, buck daylight
- Give priority-ranked advice — most impactful first
- Keep responses to 3-5 sentences unless the user asks for more detail
- Always explain WHY behind each recommendation
- If acreage and layer data is provided in the message, use it
- Never insult the user, mock the property, or act abrasive. If something is weak, explain it respectfully and give the clearest next move.`

function getTonyChatModelConfig() {
  if (process.env.NEURADEX_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    return {
      apiKey:
        process.env.NEURADEX_GOOGLE_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GEMINI_API_KEY!,
      model: 'gemini-2.5-flash',
      baseURL: GOOGLE_OPENAI_BASE_URL,
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
      baseURL: undefined as string | undefined,
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const modelConfig = getTonyChatModelConfig()
    if (!modelConfig) {
      return NextResponse.json({ error: 'No Tony chat model configured' }, { status: 500 })
    }

    const body = await req.json() as ChatRequestBody
    const message = body.message?.trim() || ''
    const imageDataUrl = body.imageDataUrl

    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })

    const client = new OpenAI({
      apiKey: modelConfig.apiKey,
      baseURL: modelConfig.baseURL,
      timeout: 45000,
    })

    const userContent: OpenAI.ChatCompletionContentPart[] = []

    if (imageDataUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: imageDataUrl, detail: 'high' },
      })
    }
    userContent.push({ type: 'text', text: message })

    const completion = await client.chat.completions.create({
      model: modelConfig.model,
      max_tokens: 512,
      messages: [
        { role: 'system', content: TONY_SYSTEM },
        { role: 'user', content: userContent },
      ],
    })

    const reply = completion.choices[0]?.message?.content || 'No reply.'
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[Tony Chat API]', err)
    const body = await req.clone().json().catch(() => null) as ChatRequestBody | null
    const fallbackReply = buildFallbackTonyReply(body?.message || '', Boolean(body?.imageDataUrl))
    return NextResponse.json({
      reply: fallbackReply,
      degraded: true,
    })
  }
}
