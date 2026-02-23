import OpenAI from "openai"
import { TONY_SYSTEM_PROMPT } from "@/lib/tony-prompt"
import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

interface TonyRequestBody {
  imageBase64?: string
  boundaryGeoJSON: object
  mapBounds: { sw: [number, number]; ne: [number, number] }
  acreage: number
  region: string
  state: string
  messages?: Array<{ role: "user" | "assistant"; content: string }>
}

export async function POST(req: NextRequest) {
  try {
    const body: TonyRequestBody = await req.json()
    const { imageBase64, boundaryGeoJSON, mapBounds, acreage, region, state, messages } = body

    if (!process.env.OPENAI_API_KEY) {
      return new Response("OPENAI_API_KEY is not configured", { status: 500 })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Build user message content
    const userContent: OpenAI.ChatCompletionContentPart[] = []

    // Attach satellite screenshot
    if (imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${imageBase64}`,
          detail: "high",
        },
      })
    }

    // Property context
    userContent.push({
      type: "text",
      text: `
Property Details:
- Size: ${acreage} acres
- Region: ${region}
- State: ${state}
- Map Bounds SW: [${mapBounds.sw[0].toFixed(6)}, ${mapBounds.sw[1].toFixed(6)}]
- Map Bounds NE: [${mapBounds.ne[0].toFixed(6)}, ${mapBounds.ne[1].toFixed(6)}]
- Property Boundary GeoJSON: ${JSON.stringify(boundaryGeoJSON)}

Analyze this satellite image and provide your full habitat consultation.
Follow the exact response format in your instructions.
ALL coordinates in DRAW_FEATURES must fall strictly within the map bounds above.
Coordinates are [longitude, latitude] — longitude always first.
      `.trim(),
    })

    // Build message history
    const conversationMessages: OpenAI.ChatCompletionMessageParam[] = [
      ...(messages?.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })) ?? []),
      { role: "user", content: userContent },
    ]

    // Stream response
    const stream = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: TONY_SYSTEM_PROMPT },
        ...conversationMessages,
      ],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? ""
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              )
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Stream error"
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    console.error("[Tony API] Error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
