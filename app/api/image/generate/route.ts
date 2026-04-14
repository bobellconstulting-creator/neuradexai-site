import { NextResponse } from 'next/server'
import { generateImage, type AspectRatio, type ImageResolution } from '@/lib/nanoBanana'
import { consumeBudget, DAILY_CAP } from '@/lib/nanoBananaBudget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface GenerateBody {
  prompt?: unknown
  aspectRatio?: unknown
  resolution?: unknown
}

const VALID_AR: readonly AspectRatio[] = ['1:1', '4:3', '3:4', '16:9', '9:16']
const VALID_RES: readonly ImageResolution[] = ['1K', '2K', '4K']

export async function POST(req: Request): Promise<NextResponse> {
  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return NextResponse.json({ ok: false, error: 'prompt required' }, { status: 400 })
  }

  const aspectRatio =
    typeof body.aspectRatio === 'string' && (VALID_AR as readonly string[]).includes(body.aspectRatio)
      ? (body.aspectRatio as AspectRatio)
      : undefined

  const resolution =
    typeof body.resolution === 'string' && (VALID_RES as readonly string[]).includes(body.resolution)
      ? (body.resolution as ImageResolution)
      : undefined

  // Budget gate
  try {
    const check = await consumeBudget()
    if (!check.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `daily cap reached (${DAILY_CAP}) — reset tomorrow`,
          used: check.state.count,
          cap: DAILY_CAP,
          remaining: 0,
        },
        { status: 429 },
      )
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'budget error'
    return NextResponse.json({ ok: false, error: `budget: ${msg}` }, { status: 500 })
  }

  const result = await generateImage({ prompt: body.prompt, aspectRatio, resolution })

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'generation failed' },
      { status: 502 },
    )
  }

  return NextResponse.json({
    ok: true,
    publicUrl: result.publicUrl,
    mimeType: result.mimeType,
  })
}
