/**
 * Graph builder — walks the project source tree and builds an import graph.
 * Shared between /api/graph/route.ts and /api/graph/query/route.ts.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeType = 'root' | 'folder' | 'file' | 'function'

export interface GraphNode {
  id: string
  name: string
  type: NodeType
  path: string
  val: number
  color?: string
}

export interface GraphLink {
  source: string
  target: string
  type: 'import' | 'dependency'
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.openclaw',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const IMPORT_RE = /import\s+(?:.+\s+from\s+)?['"]([^'"]+)['"]/g
const MAX_NODES = 500
const CACHE_TTL_MS = 30_000

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface Cache {
  data: GraphData
  ts: number
}

let graphCache: Cache | null = null

// ---------------------------------------------------------------------------
// File-system walker
// ---------------------------------------------------------------------------

function walkDir(
  dir: string,
  rootDir: string,
  allFiles: string[],
  allDirs: string[],
): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    let s
    try {
      s = statSync(fullPath)
    } catch {
      continue
    }

    if (s.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) {
        allDirs.push(fullPath)
        walkDir(fullPath, rootDir, allFiles, allDirs)
      }
    } else if (s.isFile()) {
      const ext = path.extname(entry)
      if (SOURCE_EXTS.has(ext)) {
        allFiles.push(fullPath)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

function resolveImport(
  importSpec: string,
  importingFile: string,
  rootDir: string,
  fileSet: Set<string>,
): string | null {
  let candidate: string

  if (importSpec.startsWith('@/')) {
    candidate = path.join(rootDir, importSpec.slice(2))
  } else if (importSpec.startsWith('.')) {
    candidate = path.resolve(path.dirname(importingFile), importSpec)
  } else {
    return null
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx']
  const tryPaths = [
    candidate,
    ...extensions.map((ext) => candidate + ext),
    ...extensions.map((ext) => path.join(candidate, `index${ext}`)),
  ]

  for (const p of tryPaths) {
    if (fileSet.has(p)) return p
  }
  return null
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

function buildGraph(): GraphData {
  const rootDir = process.cwd()

  const allFiles: string[] = []
  const allDirs: string[] = []
  walkDir(rootDir, rootDir, allFiles, allDirs)

  const fileSet = new Set(allFiles)

  const toId = (absPath: string): string =>
    absPath.replace(/\\/g, '/').replace(rootDir.replace(/\\/g, '/'), '').replace(/^\//, '')

  const nodesMap = new Map<string, GraphNode>()
  const links: GraphLink[] = []

  nodesMap.set('root', {
    id: 'root',
    name: 'neuradexai',
    type: 'root',
    path: rootDir,
    val: 8,
  })

  const topLevel = readdirSync(rootDir)
  for (const entry of topLevel) {
    const fullPath = path.join(rootDir, entry)
    let s
    try {
      s = statSync(fullPath)
    } catch {
      continue
    }
    if (s.isDirectory() && !SKIP_DIRS.has(entry)) {
      const id = toId(fullPath)
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          name: entry,
          type: 'folder',
          path: fullPath,
          val: 4,
        })
      }
      links.push({ source: 'root', target: id, type: 'dependency' })
    }
  }

  for (const dir of allDirs) {
    const id = toId(dir)
    if (!nodesMap.has(id)) {
      nodesMap.set(id, {
        id,
        name: path.basename(dir),
        type: 'folder',
        path: dir,
        val: 4,
      })
    }
  }

  for (const file of allFiles) {
    const fileId = toId(file)
    if (!nodesMap.has(fileId)) {
      nodesMap.set(fileId, {
        id: fileId,
        name: path.basename(file),
        type: 'file',
        path: file,
        val: 2,
      })
    }

    let src: string
    try {
      src = readFileSync(file, 'utf-8')
    } catch {
      continue
    }

    const seen = new Set<string>()
    let match: RegExpExecArray | null
    IMPORT_RE.lastIndex = 0
    while ((match = IMPORT_RE.exec(src)) !== null) {
      const spec = match[1]
      const resolved = resolveImport(spec, file, rootDir, fileSet)
      if (resolved) {
        const targetId = toId(resolved)
        const key = `${fileId}→${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          links.push({ source: fileId, target: targetId, type: 'import' })
        }
      }
    }
  }

  let nodes = [...nodesMap.values()]
  if (nodes.length > MAX_NODES) {
    const priority = (n: GraphNode): number => {
      if (n.type === 'root') return 0
      if (n.type === 'folder') return 1
      return 2 + n.id.split('/').length
    }
    nodes.sort((a, b) => priority(a) - priority(b))
    const kept = new Set(nodes.slice(0, MAX_NODES).map((n) => n.id))
    nodes = nodes.slice(0, MAX_NODES)
    return {
      nodes,
      links: links.filter((l) => kept.has(l.source) && kept.has(l.target)),
    }
  }

  return { nodes, links }
}

// ---------------------------------------------------------------------------
// Cached accessor
// ---------------------------------------------------------------------------

export function getGraph(): GraphData {
  const now = Date.now()
  if (graphCache && now - graphCache.ts < CACHE_TTL_MS) {
    return graphCache.data
  }
  const data = buildGraph()
  graphCache = { data, ts: now }
  return data
}
