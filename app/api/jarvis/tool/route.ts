/**
 * POST /api/jarvis/tool
 * Body: { name: string, args: Record<string, unknown> }
 * Returns: ToolResult JSON { ok, result?, error?, receipt }
 *
 * Validates the tool name against the manifest + Zod schema before running.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dispatchTool, JARVIS_TOOLS } from '@/lib/jarvis/tools'

export const runtime = 'nodejs'
// Browser automation + child_process are incompatible with Edge + caching.
export const dynamic = 'force-dynamic'

interface CallBody {
  name?: unknown
  args?: unknown
}

export async function GET() {
  // Expose the manifest so clients can discover available tools.
  const tools = Object.values(JARVIS_TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
  }))
  return NextResponse.json({ ok: true, tools })
}

export async function POST(req: NextRequest) {
  let body: CallBody
  try {
    body = (await req.json()) as CallBody
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid JSON body: ' + (err instanceof Error ? err.message : String(err)),
        receipt: `[${new Date().toISOString()}] /api/jarvis/tool FAIL :: bad json`,
      },
      { status: 400 }
    )
  }

  if (typeof body.name !== 'string' || !body.name) {
    return NextResponse.json(
      {
        ok: false,
        error: 'missing or non-string "name" field',
        receipt: `[${new Date().toISOString()}] /api/jarvis/tool FAIL :: missing name`,
      },
      { status: 400 }
    )
  }

  if (!(body.name in JARVIS_TOOLS)) {
    return NextResponse.json(
      {
        ok: false,
        error: `unknown tool: ${body.name}`,
        receipt: `[${new Date().toISOString()}] /api/jarvis/tool FAIL :: unknown tool ${body.name}`,
      },
      { status: 404 }
    )
  }

  const result = await dispatchTool(body.name, body.args ?? {})
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
