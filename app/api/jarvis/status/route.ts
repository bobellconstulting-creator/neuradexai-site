import http from 'node:http'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const JARVIS_BASE_URL = process.env.OPENJARVIS_BASE_URL ?? 'http://127.0.0.1:8000'

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

export async function GET() {
  try {
    const response = await requestJarvis('/v1/models', 'GET')

    if (response.status < 200 || response.status >= 300) {
      return NextResponse.json(
        {
          status: 'offline',
          models: [],
          error: `Jarvis responded with ${response.status}.`,
        },
        { status: 502 },
      )
    }

    const data = JSON.parse(response.body) as { data?: Array<{ id: string }> }
    const models = (data.data ?? []).map((model) => model.id)

    return NextResponse.json({
      status: 'online',
      models,
      error: null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'offline',
        models: [],
        error: error instanceof Error ? error.message : 'Jarvis status probe failed.',
      },
      { status: 502 },
    )
  }
}
