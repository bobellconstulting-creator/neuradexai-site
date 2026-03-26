import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

const JARVIS_BASE_URL = process.env.OPENJARVIS_BASE_URL ?? 'http://127.0.0.1:8000'
const DEFAULT_JARVIS_MODEL = process.env.OPENJARVIS_MODEL ?? 'gemini-2.5-flash'
const POWERSHELL_PATH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
const OPENJARVIS_DIR = 'C:\\Users\\bobel\\projects\\OpenJarvis'
const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ??
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
  ''

const execFileAsync = promisify(execFile)

type ChatMessage = {
  role?: 'user' | 'assistant' | 'system'
  content?: string
}

const JARVIS_SYSTEM_PROMPT =
  'You are Jarvis, a full build-capable OpenJarvis agent operating inside the live Jarvis / Axon HUD. You can help design, specify, and drive implementation work for apps, dashboards, HUDs, websites, automations, and operator systems. Be concise, operational, and useful. Coordinate cleanly with Axon when execution or follow-through is needed. Treat references to "the HUD", "mission control", "deploy it", "build it", or "launch it" as referring to this current Jarvis / Axon HUD unless the user clearly says otherwise. Do not answer like a generic assistant and never say you cannot build websites or apps. If the user asks to build or upgrade something, respond as a builder: identify the concrete modules, expected operator outcome, and the next implementation move in this project. When the user clearly wants autonomous execution, make reasonable defaults instead of blocking on optional clarifications. If a theme, image brief, or design direction is missing, choose a strong Jarvis / Axon branded default and proceed.'

function requestJarvis(pathname: string, method: 'GET' | 'POST', body?: string) {
  const url = new URL(pathname, JARVIS_BASE_URL)

  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            }
          : undefined,
      },
      (res) => {
        let chunks = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          chunks += chunk
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 500,
            body: chunks,
          })
        })
      },
    )

    req.on('error', reject)

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

function toJarvisMessages(messages: ChatMessage[]) {
  return [
    {
      role: 'system',
      content: JARVIS_SYSTEM_PROMPT,
    },
    ...messages
      .filter((message) => message.content?.trim())
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content?.trim() ?? '',
      })),
  ]
}

function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user' && message.content?.trim())?.content?.trim() ?? ''
}

function buildConversationTranscript(messages: ChatMessage[], limit = 8) {
  return messages
    .filter((message) => message.content?.trim())
    .slice(-limit)
    .map((message) => `${message.role === 'assistant' ? 'Jarvis' : 'User'}: ${message.content?.trim() ?? ''}`)
    .join('\n')
}

function quoteForPowerShellSingle(value: string) {
  return value.replace(/'/g, "''")
}

async function requestJarvisCli(messages: ChatMessage[]) {
  const latestUserMessage = getLatestUserMessage(messages)
  if (!latestUserMessage) {
    throw new Error('Jarvis CLI fallback requires a user message.')
  }

  const prompt = [
    JARVIS_SYSTEM_PROMPT,
    '',
    'Recent conversation:',
    buildConversationTranscript(messages),
    '',
    `Current user request: ${latestUserMessage}`,
  ].join('\n')

  const command = [
    "$env:Path='C:\\Users\\bobel\\.local\\bin;' + $env:Path",
    "$env:UV_CACHE_DIR='C:\\Users\\bobel\\projects\\OpenJarvis\\.uv-cache'",
    "$env:PYTHONIOENCODING='utf-8'",
    '$env:HTTP_PROXY=$null',
    '$env:HTTPS_PROXY=$null',
    '$env:ALL_PROXY=$null',
    '$env:GIT_HTTP_PROXY=$null',
    '$env:GIT_HTTPS_PROXY=$null',
    '$env:http_proxy=$null',
    '$env:https_proxy=$null',
    '$env:all_proxy=$null',
    `Set-Location '${OPENJARVIS_DIR}'`,
    `uv run jarvis ask '${quoteForPowerShellSingle(prompt)}'`,
  ].join('; ')

  const { stdout } = await execFileAsync(
    POWERSHELL_PATH,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    },
  )

  const reply = stdout.trim()
  if (!reply) {
    throw new Error('Jarvis CLI fallback returned an empty reply.')
  }

  return reply
}

async function requestJarvisGemini(messages: ChatMessage[]) {
  if (!GOOGLE_API_KEY) {
    throw new Error('Google API key is not configured for Jarvis fallback.')
  }

  const latestUserMessage = getLatestUserMessage(messages)
  if (!latestUserMessage) {
    throw new Error('Jarvis Gemini fallback requires a user message.')
  }

  const transcript = buildConversationTranscript(messages)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_JARVIS_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: JARVIS_SYSTEM_PROMPT,
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: ['Recent conversation:', transcript, '', `Current user request: ${latestUserMessage}`].join('\n'),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.5,
        },
      }),
    },
  )

  const data = (await response.json().catch(() => null)) as
    | {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>
          }
        }>
        error?: { message?: string }
      }
    | null

  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Gemini fallback returned ${response.status}.`)
  }

  const reply =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? ''

  if (!reply) {
    throw new Error('Gemini fallback returned an empty reply.')
  }

  return reply
}

function createSseResponse(handler: (send: (data: object) => void) => Promise<void>) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await handler(send)
      } catch (error) {
        send({
          type: 'error',
          content: error instanceof Error ? error.message : 'Jarvis bridge failed.',
        })
      }

      send({ type: 'done' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        messages?: ChatMessage[]
        message?: string
      }
    | null

  const history =
    body?.messages && body.messages.length > 0
      ? body.messages
      : body?.message?.trim()
        ? [{ role: 'user' as const, content: body.message.trim() }]
        : []

  if (history.length === 0) {
    return new Response(JSON.stringify({ error: 'Message history is required.' }), { status: 400 })
  }

  return createSseResponse(async (send) => {
    send({ type: 'status', tool: 'openjarvis_link', content: 'Linking Jarvis runtime' })

    let reply = ''

    try {
      const upstream = await requestJarvis(
        '/v1/chat/completions',
        'POST',
        JSON.stringify({
          model: DEFAULT_JARVIS_MODEL,
          messages: toJarvisMessages(history),
        }),
      )

      const data = (JSON.parse(upstream.body || 'null') ?? null) as
        | {
            choices?: Array<{ message?: { content?: string } }>
            error?: { message?: string }
          }
        | null

      if (upstream.status < 200 || upstream.status >= 300) {
        throw new Error(data?.error?.message ?? `Jarvis upstream returned ${upstream.status}.`)
      }

      reply = data?.choices?.[0]?.message?.content?.trim() ?? ''
      if (!reply) {
        throw new Error('Jarvis returned an empty reply.')
      }
    } catch (error) {
      try {
        send({ type: 'status', tool: 'jarvis_cli', content: 'Falling back to direct Jarvis CLI' })
        reply = await requestJarvisCli(history)
      } catch {
        send({ type: 'status', tool: 'gemini_fallback', content: 'Falling back to direct Gemini route' })
        reply = await requestJarvisGemini(history)
      }
    }

    for (let index = 0; index < reply.length; index += 10) {
      send({ type: 'token', content: reply.slice(index, index + 10) })
    }
  })
}
