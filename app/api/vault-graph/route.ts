import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VaultNode {
  id: string
  name: string
  type: 'root' | 'folder' | 'file'
  path: string
  folder: string
}

export interface VaultLink {
  source: string
  target: string
}

export interface VaultGraph {
  nodes: VaultNode[]
  links: VaultLink[]
}

// ── Static snapshot (Vercel fallback) ─────────────────────────────────────────

const STATIC_SNAPSHOT: VaultGraph = {
  nodes: [
    { id: 'root', name: 'ObsidianVault', type: 'root', path: '', folder: '' },

    { id: 'folder-00-Inbox',    name: '00-Inbox',    type: 'folder', path: '00-Inbox',    folder: '00-Inbox' },
    { id: 'folder-01-Daily',    name: '01-Daily',    type: 'folder', path: '01-Daily',    folder: '01-Daily' },
    { id: 'folder-02-Projects', name: '02-Projects', type: 'folder', path: '02-Projects', folder: '02-Projects' },
    { id: 'folder-03-Areas',    name: '03-Areas',    type: 'folder', path: '03-Areas',    folder: '03-Areas' },
    { id: 'folder-04-Resources',name: '04-Resources',type: 'folder', path: '04-Resources',folder: '04-Resources' },
    { id: 'folder-05-Fleet',    name: '05-Fleet',    type: 'folder', path: '05-Fleet',    folder: '05-Fleet' },
    { id: 'folder-06-People',   name: '06-People',   type: 'folder', path: '06-People',   folder: '06-People' },
    { id: 'folder-Templates',   name: 'Templates',   type: 'folder', path: 'Templates',   folder: 'Templates' },

    { id: 'file-inbox-readme',      name: 'README',           type: 'file', path: '00-Inbox/README.md',                                                folder: '00-Inbox' },
    { id: 'file-daily-2026-04-13',  name: '2026-04-13',       type: 'file', path: '01-Daily/2026-04-13.md',                                            folder: '01-Daily' },
    { id: 'file-buckgrid-readme',   name: 'BuckGrid-Pro',     type: 'file', path: '02-Projects/BuckGrid-Pro/README.md',                                 folder: '02-Projects' },
    { id: 'file-etsy-pipeline',     name: 'Etsy-POD-Pipeline',type: 'file', path: '02-Projects/Etsy-Revenue-Play/Etsy-POD-Pipeline-2026.md',            folder: '02-Projects' },
    { id: 'file-etsy-readme',       name: 'Etsy-Revenue-Play',type: 'file', path: '02-Projects/Etsy-Revenue-Play/README.md',                            folder: '02-Projects' },
    { id: 'file-jarvis-tma',        name: 'Jarvis-Telegram',  type: 'file', path: '02-Projects/Neuradex-AI/Jarvis-Telegram-Mini-App.md',                folder: '02-Projects' },
    { id: 'file-neuradex-readme',   name: 'Neuradex-AI',      type: 'file', path: '02-Projects/Neuradex-AI/README.md',                                  folder: '02-Projects' },
    { id: 'file-agent-patterns',    name: 'Agent-Loop-Patterns',type:'file', path: '04-Resources/AI-Research/autonomous-agent-loop-patterns.md',         folder: '04-Resources' },
    { id: 'file-ai-research-readme',name: 'AI-Research',      type: 'file', path: '04-Resources/AI-Research/README.md',                                 folder: '04-Resources' },
    { id: 'file-tiktok-creators',   name: 'TikTok-Creators',  type: 'file', path: '04-Resources/Competitors/TikTok-Creators.md',                        folder: '04-Resources' },
    { id: 'file-hunting-content',   name: 'Hunting-Content',  type: 'file', path: '04-Resources/Hunting-Content/README.md',                             folder: '04-Resources' },
    { id: 'file-agent-bridge',      name: 'agent-bridge',     type: 'file', path: '05-Fleet/agent-bridge.md',                                           folder: '05-Fleet' },
    { id: 'file-doc-outputs',       name: 'Doc/outputs',      type: 'file', path: '05-Fleet/Doc/outputs.md',                                            folder: '05-Fleet' },
    { id: 'file-linda-outputs',     name: 'Linda/outputs',    type: 'file', path: '05-Fleet/Linda/outputs.md',                                          folder: '05-Fleet' },
    { id: 'file-marcus-outputs',    name: 'Marcus/outputs',   type: 'file', path: '05-Fleet/Marcus/outputs.md',                                         folder: '05-Fleet' },
    { id: 'file-fleet-readme',      name: 'Fleet-README',     type: 'file', path: '05-Fleet/README.md',                                                 folder: '05-Fleet' },
    { id: 'file-vault-outputs',     name: 'Vault/outputs',    type: 'file', path: '05-Fleet/Vault/outputs.md',                                          folder: '05-Fleet' },
    { id: 'file-tpl-agent-output',  name: 'agent-output',     type: 'file', path: 'Templates/agent-output.md',                                          folder: 'Templates' },
    { id: 'file-tpl-daily',         name: 'daily-note',       type: 'file', path: 'Templates/daily-note.md',                                            folder: 'Templates' },
    { id: 'file-tpl-meeting',       name: 'meeting',          type: 'file', path: 'Templates/meeting.md',                                               folder: 'Templates' },
    { id: 'file-tpl-person',        name: 'person',           type: 'file', path: 'Templates/person.md',                                                folder: 'Templates' },
    { id: 'file-tpl-project',       name: 'project',          type: 'file', path: 'Templates/project.md',                                               folder: 'Templates' },
    { id: 'file-tpl-research',      name: 'research',         type: 'file', path: 'Templates/research.md',                                              folder: 'Templates' },
  ],
  links: [
    { source: 'root', target: 'folder-00-Inbox' },
    { source: 'root', target: 'folder-01-Daily' },
    { source: 'root', target: 'folder-02-Projects' },
    { source: 'root', target: 'folder-03-Areas' },
    { source: 'root', target: 'folder-04-Resources' },
    { source: 'root', target: 'folder-05-Fleet' },
    { source: 'root', target: 'folder-06-People' },
    { source: 'root', target: 'folder-Templates' },

    { source: 'folder-00-Inbox',    target: 'file-inbox-readme' },
    { source: 'folder-01-Daily',    target: 'file-daily-2026-04-13' },
    { source: 'folder-02-Projects', target: 'file-buckgrid-readme' },
    { source: 'folder-02-Projects', target: 'file-etsy-pipeline' },
    { source: 'folder-02-Projects', target: 'file-etsy-readme' },
    { source: 'folder-02-Projects', target: 'file-jarvis-tma' },
    { source: 'folder-02-Projects', target: 'file-neuradex-readme' },
    { source: 'folder-04-Resources',target: 'file-agent-patterns' },
    { source: 'folder-04-Resources',target: 'file-ai-research-readme' },
    { source: 'folder-04-Resources',target: 'file-tiktok-creators' },
    { source: 'folder-04-Resources',target: 'file-hunting-content' },
    { source: 'folder-05-Fleet',    target: 'file-agent-bridge' },
    { source: 'folder-05-Fleet',    target: 'file-doc-outputs' },
    { source: 'folder-05-Fleet',    target: 'file-linda-outputs' },
    { source: 'folder-05-Fleet',    target: 'file-marcus-outputs' },
    { source: 'folder-05-Fleet',    target: 'file-fleet-readme' },
    { source: 'folder-05-Fleet',    target: 'file-vault-outputs' },
    { source: 'folder-Templates',   target: 'file-tpl-agent-output' },
    { source: 'folder-Templates',   target: 'file-tpl-daily' },
    { source: 'folder-Templates',   target: 'file-tpl-meeting' },
    { source: 'folder-Templates',   target: 'file-tpl-person' },
    { source: 'folder-Templates',   target: 'file-tpl-project' },
    { source: 'folder-Templates',   target: 'file-tpl-research' },
  ],
}

// ── Live vault reader ─────────────────────────────────────────────────────────

const VAULT_ROOT = 'C:/Users/bobel/ObsidianVault'

function readVaultLive(): VaultGraph {
  const nodes: VaultNode[] = [
    { id: 'root', name: 'ObsidianVault', type: 'root', path: '', folder: '' },
  ]
  const links: VaultLink[] = []

  function walkDir(dirPath: string, relativePath: string, parentId: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name
      const entryId = `node-${entryRelative.replace(/[^a-zA-Z0-9]/g, '-')}`
      const topFolder = relativePath.split('/')[0] ?? entry.name

      if (entry.isDirectory()) {
        nodes.push({
          id: entryId,
          name: entry.name,
          type: 'folder',
          path: entryRelative,
          folder: topFolder,
        })
        links.push({ source: parentId, target: entryId })
        walkDir(path.join(dirPath, entry.name), entryRelative, entryId)
      } else if (entry.name.endsWith('.md')) {
        nodes.push({
          id: entryId,
          name: entry.name.replace(/\.md$/, ''),
          type: 'file',
          path: entryRelative,
          folder: topFolder,
        })
        links.push({ source: parentId, target: entryId })
      }
    }
  }

  walkDir(VAULT_ROOT, '', 'root')
  return { nodes, links }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    if (fs.existsSync(VAULT_ROOT)) {
      const graph = readVaultLive()
      return NextResponse.json(graph)
    }
    return NextResponse.json(STATIC_SNAPSHOT)
  } catch {
    return NextResponse.json(STATIC_SNAPSHOT)
  }
}
