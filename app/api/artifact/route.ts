import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ALLOWED_ROOTS = [path.resolve('C:\\Users\\bobel\\Desktop')]

function isAllowedPath(targetPath: string) {
  const resolved = path.resolve(targetPath)
  return ALLOWED_ROOTS.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))
}

function contentTypeFor(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.md':
      return 'text/markdown; charset=utf-8'
    case '.txt':
      return 'text/plain; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildDirectoryListing(directoryPath: string, entries: string[]) {
  const links = entries
    .map((entry) => {
      const fullPath = path.join(directoryPath, entry)
      return `<li><a href="/api/artifact?path=${encodeURIComponent(fullPath)}">${escapeHtml(entry)}</a></li>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Artifact Directory</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: #07111f;
        color: #e9f6ff;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.5rem;
      }
      p {
        color: #9bc6d9;
        word-break: break-all;
      }
      ul {
        margin: 24px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 10px;
      }
      a {
        display: block;
        padding: 14px 16px;
        border-radius: 12px;
        color: #8ae8ff;
        text-decoration: none;
        border: 1px solid rgba(0, 212, 255, 0.2);
        background: rgba(0, 18, 34, 0.7);
      }
      a:hover {
        border-color: rgba(52, 211, 153, 0.4);
        color: #dffef3;
      }
    </style>
  </head>
  <body>
    <h1>Artifact Directory</h1>
    <p>${escapeHtml(directoryPath)}</p>
    <ul>${links}</ul>
  </body>
</html>`
}

export async function GET(request: NextRequest) {
  const targetPath = request.nextUrl.searchParams.get('path')

  if (!targetPath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  if (!isAllowedPath(targetPath)) {
    return NextResponse.json({ error: 'path is not allowed' }, { status: 403 })
  }

  try {
    const targetStat = await stat(targetPath)

    if (targetStat.isDirectory()) {
      const entries = await readdir(targetPath)
      return new Response(buildDirectoryListing(targetPath, entries), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const file = await readFile(targetPath)
    return new Response(file, {
      headers: {
        'Content-Type': contentTypeFor(targetPath),
        'Content-Disposition': `inline; filename="${path.basename(targetPath)}"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'artifact read failed' },
      { status: 404 },
    )
  }
}
