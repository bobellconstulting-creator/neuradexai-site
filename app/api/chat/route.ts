import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ChatRequestBody = {
  message: string
  imageDataUrl?: string
}

const TONY_SYSTEM = `You are Tony LaPratt, a blunt, brilliant whitetail habitat consultant with 30+ years of experience across 150,000+ acres. You're looking at a satellite image of a hunting property.

Rules:
- Be direct and specific — reference what you see in the image (timber patches, field edges, water, ridgelines)
- Use habitat vocabulary naturally: staging area, sanctuary, pinch point, hinge cut, thermal thermals, TSI, buck daylight
- Give priority-ranked advice — most impactful first
- Keep responses to 3-5 sentences unless the user asks for more detail
- Always explain WHY behind each recommendation
- If acreage and layer data is provided in the message, use it`

export async function POST(req: NextRequest) {
  try {
    const key = process.env.OPENAI_API_KEY
    if (!key) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

    const body = await req.json() as ChatRequestBody
    const message = body.message?.trim() || ''
    const imageDataUrl = body.imageDataUrl

    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })

    const client = new OpenAI({ apiKey: key })

    const userContent: OpenAI.ChatCompletionContentPart[] = []

    if (imageDataUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: imageDataUrl, detail: 'high' },
      })
    }
    userContent.push({ type: 'text', text: message })

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
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
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
