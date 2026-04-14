/**
 * Persona Parser — reads an agent's six persona .md files and splits
 * each one into H2/H3 sections, extracting tags for each.
 *
 * File layout (agentId ∈ 'doc' | 'linda' | 'marcus' | 'vault'):
 *   lib/personas/<agentId>/SOUL.md
 *   lib/personas/<agentId>/IDENTITY.md
 *   lib/personas/<agentId>/MEMORY.md
 *   lib/personas/<agentId>/TOOLS.md
 *   lib/personas/<agentId>/USER.md
 *   lib/personas/<agentId>/HEARTBEAT.md
 *
 * Missing files are silently skipped so partial personas still render.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type PersonaKind = 'soul' | 'identity' | 'memory' | 'tools' | 'user' | 'heartbeat'

export interface PersonaSection {
  kind:    PersonaKind
  heading: string
  body:    string
  tags:    string[]
}

export interface ParsedPersona {
  agentId:  string
  sections: PersonaSection[]
}

const PERSONA_ROOT = 'C:\\Users\\bobel\\projects\\neuradexai\\lib\\personas'

// File order is load-bearing: SOUL first, HEARTBEAT last.
const FILE_ORDER: ReadonlyArray<{ kind: PersonaKind; filename: string }> = [
  { kind: 'soul',      filename: 'SOUL.md' },
  { kind: 'identity',  filename: 'IDENTITY.md' },
  { kind: 'memory',    filename: 'MEMORY.md' },
  { kind: 'tools',     filename: 'TOOLS.md' },
  { kind: 'user',      filename: 'USER.md' },
  { kind: 'heartbeat', filename: 'HEARTBEAT.md' },
]

const STOPWORDS = new Set<string>([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'about',
  'into', 'onto', 'over', 'when', 'what', 'where', 'have', 'has', 'are',
  'was', 'were', 'not', 'but', 'you', 'our', 'its', 'they', 'them', 'their',
])

function extractTags(heading: string, body: string): string[] {
  const tags = new Set<string>()

  // Heading words (tokens >= 3 chars, stopword filtered, lowercased)
  const headingTokens = heading
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 3 && !STOPWORDS.has(tok))
  for (const tok of headingTokens) tags.add(tok)

  // @mentions in body
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g
  let match: RegExpExecArray | null
  while ((match = mentionRegex.exec(body)) !== null) {
    tags.add(`@${match[1].toLowerCase()}`)
  }

  // CAPS_KEYWORDS (ALL-CAPS underscore tokens, >= 3 chars)
  const capsRegex = /\b[A-Z][A-Z0-9_]{2,}\b/g
  while ((match = capsRegex.exec(`${heading}\n${body}`)) !== null) {
    tags.add(match[0])
  }

  return Array.from(tags)
}

/**
 * Split a single markdown document into sections by H2/H3 headings.
 * Content before the first H2/H3 becomes a synthetic "intro" section
 * using the first non-empty line (or the filename stem) as the heading.
 */
function splitSections(
  kind: PersonaKind,
  raw: string,
  fallbackHeading: string,
): PersonaSection[] {
  const lines = raw.split(/\r?\n/)
  const sections: PersonaSection[] = []

  let currentHeading = ''
  let currentBody: string[] = []
  let hasSeenHeading = false

  const flush = (): void => {
    const body = currentBody.join('\n').trim()
    if (!currentHeading && !body) return
    const heading = currentHeading || fallbackHeading
    sections.push({
      kind,
      heading,
      body,
      tags: extractTags(heading, body),
    })
  }

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/)
    const h3 = line.match(/^###\s+(.*)$/)
    if (h2 || h3) {
      // Flush previous section
      flush()
      currentHeading = (h2?.[1] ?? h3?.[1] ?? '').trim()
      currentBody = []
      hasSeenHeading = true
      continue
    }
    if (!hasSeenHeading && !currentHeading) {
      // Capture the first non-empty line as the intro heading
      const trimmed = line.trim()
      if (trimmed && !currentHeading) {
        // Strip a leading H1 if present
        const h1 = trimmed.match(/^#\s+(.*)$/)
        currentHeading = (h1?.[1] ?? trimmed).slice(0, 120)
        continue
      }
    }
    currentBody.push(line)
  }
  flush()

  return sections
}

export async function parsePersona(agentId: string): Promise<ParsedPersona> {
  // Guard the agentId so it cannot traverse paths
  const safeAgent = agentId.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safeAgent) {
    return { agentId, sections: [] }
  }

  const allSections: PersonaSection[] = []

  for (const { kind, filename } of FILE_ORDER) {
    const full = path.join(PERSONA_ROOT, safeAgent, filename)
    let raw: string
    try {
      raw = await readFile(full, 'utf8')
    } catch {
      // File doesn't exist — skip silently
      continue
    }
    const fallback = filename.replace(/\.md$/i, '')
    const sections = splitSections(kind, raw, fallback)
    allSections.push(...sections)
  }

  return { agentId: safeAgent, sections: allSections }
}
