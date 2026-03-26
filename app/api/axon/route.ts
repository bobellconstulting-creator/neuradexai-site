import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

const AXON_QUEUE_PATH = 'C:\\Users\\bobel\\.openclaw\\workspace-asa1\\state\\task_queue.json'

type ChatMessage = {
  role?: 'user' | 'assistant' | 'system'
  content?: string
}

type AxonQueueTask = {
  id: string
  title: string
  status: 'queued' | 'completed'
  created: string
  assigned_by: string
  source: string
  project: string
  proof_required: string
  intake: {
    channel: 'mission-control'
    message: string
  }
  artifacts?: Array<{
    kind: 'folder' | 'image' | 'file'
    path: string
    label?: string
    mimeType?: string
    preview?: string
  }>
}

type AxonQueueState = {
  queue: AxonQueueTask[]
  completed: AxonQueueTask[]
  note: string
}

function buildTitle(message: string) {
  const firstLine = message.split(/\r?\n/).find((line) => line.trim())?.trim() || 'Jarvis / Axon HUD handoff'
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine
}

function getLatestUserMessage(messages: ChatMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === 'user' && message.content?.trim())
  return latest?.content?.trim() ?? ''
}

function hasAutonomousIntent(lower: string) {
  return (
    lower.includes('make it happen') ||
    lower.includes('start to finish') ||
    lower.includes('walking away') ||
    lower.includes('when i come back') ||
    lower.includes('launch it') ||
    lower.includes('deploy it')
  )
}

function shouldExecuteDesktopProvision(message: string) {
  const lower = message.toLowerCase()
  const asksForFolder =
    lower.includes('folder') ||
    lower.includes("bo's stuff") ||
    lower.includes('bo’s stuff') ||
    lower.includes('desktop')
  const asksForImage = lower.includes('image') || lower.includes('poster') || lower.includes('logo')
  const autonomousIntent = hasAutonomousIntent(lower)

  return asksForFolder && asksForImage && autonomousIntent
}

function shouldExecuteProjectScaffold(message: string) {
  const lower = message.toLowerCase()
  const asksForBuild =
    lower.includes('build') ||
    lower.includes('create') ||
    lower.includes('make') ||
    lower.includes('launch') ||
    lower.includes('deploy')
  const asksForProject =
    lower.includes('website') ||
    lower.includes('websirte') ||
    lower.includes('web site') ||
    lower.includes('landing page') ||
    lower.includes('dashboard') ||
    lower.includes('hud') ||
    lower.includes('mission control') ||
    lower.includes('app')

  return asksForBuild && asksForProject && (hasAutonomousIntent(lower) || lower.includes('build it') || lower.includes('upgrade it'))
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeProjectFolderName(project: string) {
  const slug = toSlug(project)
  return slug || 'jarvis-axon-project'
}

function buildProjectHeroSvg(project: string) {
  const title = project.toUpperCase().slice(0, 28) || 'MISSION CONTROL'
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">
  <defs>
    <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="#030712"/>
      <stop offset="50%" stop-color="#082f49"/>
      <stop offset="100%" stop-color="#07111f"/>
    </linearGradient>
    <linearGradient id="line" x1="0%" x2="100%">
      <stop offset="0%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
  </defs>
  <rect width="1440" height="900" fill="url(#bg)"/>
  <g opacity="0.18" stroke="url(#line)" fill="none">
    <circle cx="1080" cy="180" r="180" stroke-width="2"/>
    <circle cx="1080" cy="180" r="240" stroke-width="1.5" stroke-dasharray="10 14"/>
    <path d="M120 160h520M120 740h980" stroke-width="3"/>
    <path d="M180 120v180M1320 620v140" stroke-width="3"/>
  </g>
  <g transform="translate(120 170)">
    <text fill="#8ae8ff" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="6">JARVIS / AXON AUTONOMOUS BUILD DROP</text>
    <text y="110" fill="#f8fbff" font-family="Arial, Helvetica, sans-serif" font-size="84" font-weight="700">${title}</text>
    <text y="170" fill="#34d399" font-family="Arial, Helvetica, sans-serif" font-size="30" letter-spacing="5">TACTICAL WEBSITE SCAFFOLD READY</text>
  </g>
  <g transform="translate(120 430)">
    <rect width="520" height="220" rx="24" fill="rgba(3,12,24,0.64)" stroke="#00d4ff" stroke-width="2"/>
    <text x="40" y="70" fill="#8ae8ff" font-family="Arial, Helvetica, sans-serif" font-size="22" letter-spacing="3">MODULES</text>
    <text x="40" y="116" fill="#f8fbff" font-family="Arial, Helvetica, sans-serif" font-size="34">Hero / Operator Feed / Mission Tiles</text>
    <text x="40" y="156" fill="#d2f4ff" font-family="Arial, Helvetica, sans-serif" font-size="26">README, spec, and launch-ready HTML included</text>
  </g>
</svg>
`
}

function buildProjectIndexHtml(project: string, message: string) {
  const safeProject = project || 'Jarvis / Axon Project'
  const summary = message.replace(/\s+/g, ' ').trim()
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeProject} | Jarvis / Axon Drop</title>
    <style>
      :root {
        --bg-0: #020611;
        --bg-1: #07243f;
        --bg-2: #081522;
        --cyan: #00d4ff;
        --mint: #34d399;
        --text: #edf8ff;
        --dim: #8db4c9;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at 20% 20%, rgba(0,212,255,0.18), transparent 30%),
          radial-gradient(circle at 80% 0%, rgba(52,211,153,0.14), transparent 28%),
          linear-gradient(135deg, var(--bg-0), var(--bg-1) 45%, var(--bg-2));
      }
      .frame {
        max-width: 1180px;
        margin: 0 auto;
        padding: 48px 24px 64px;
      }
      .eyebrow {
        color: var(--cyan);
        letter-spacing: 0.35rem;
        font-size: 0.8rem;
        text-transform: uppercase;
      }
      h1 {
        margin: 14px 0 18px;
        font-size: clamp(3rem, 8vw, 6rem);
        line-height: 0.95;
      }
      .lede {
        max-width: 760px;
        color: #d7eefc;
        font-size: 1.15rem;
        line-height: 1.6;
      }
      .hero {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 24px;
        align-items: end;
      }
      .panel, .tile {
        border: 1px solid rgba(0,212,255,0.18);
        background: rgba(2, 10, 22, 0.56);
        backdrop-filter: blur(14px);
        border-radius: 26px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.34);
      }
      .panel {
        padding: 24px;
        min-height: 300px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 40px;
      }
      .tile {
        padding: 18px 20px;
      }
      .tile strong {
        display: block;
        font-size: 2rem;
        color: var(--cyan);
      }
      .strip {
        margin-top: 48px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 18px;
      }
      .card {
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 22px;
        padding: 20px;
        background: rgba(8,17,30,0.7);
      }
      .card h2 {
        margin: 0 0 8px;
        font-size: 1rem;
        color: var(--mint);
        letter-spacing: 0.14rem;
        text-transform: uppercase;
      }
      .card p {
        margin: 0;
        color: var(--dim);
        line-height: 1.65;
      }
      @media (max-width: 900px) {
        .hero, .stats, .strip {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="frame">
      <section class="hero">
        <div>
          <div class="eyebrow">Jarvis / Axon Build Drop</div>
          <h1>${safeProject}</h1>
          <p class="lede">${summary || 'Autonomous tactical scaffold generated by Jarvis and Axon.'}</p>
          <div class="stats">
            <div class="tile"><strong>01</strong>Operator-first UI shell</div>
            <div class="tile"><strong>02</strong>Mission modules mapped</div>
            <div class="tile"><strong>03</strong>Ready for iteration</div>
          </div>
        </div>
        <div class="panel">
          <div class="eyebrow">Command Surface</div>
          <h2 style="margin: 14px 0 12px; font-size: 2rem;">Mission Control</h2>
          <p style="color: var(--dim); line-height: 1.7;">
            This scaffold gives you a bold launch point: a cinematic hero, a modular command strip,
            and a high-contrast visual system tuned for HUD and operator dashboards.
          </p>
        </div>
      </section>
      <section class="strip">
        <article class="card">
          <h2>Chat</h2>
          <p>Direct operator communication with Jarvis and Axon in one place.</p>
        </article>
        <article class="card">
          <h2>Projects</h2>
          <p>Track active initiatives, deliverables, and artifacts without losing the thread.</p>
        </article>
        <article class="card">
          <h2>Execution</h2>
          <p>Wire actions and completions back into the room so the system shows proof, not promises.</p>
        </article>
      </section>
    </main>
  </body>
</html>
`
}

function buildProjectReadme(project: string, message: string, folderName: string) {
  return `# ${project}

Autonomous scaffold generated by Jarvis / Axon HUD.

## Operator intent

${message}

## Deliverables

- \`index.html\` for a launch-ready static shell
- \`hero.svg\` for branded visual proof
- \`SPEC.md\` for the initial build spec

## Local folder

\`${folderName}\`

## Next move

Open \`index.html\` in a browser, then iterate the modules and connect live data sources.
`
}

function buildProjectSpec(project: string, message: string) {
  return `# ${project} Spec

## Mission

Build a bold Jarvis / Axon operator surface that can be iterated into a real product.

## User request

${message}

## Initial modules

1. Cinematic hero and command frame
2. Project/task monitoring strip
3. Agent chat surface
4. Artifact and proof panel

## Execution stance

This scaffold was created under autonomous execution rules. When the request is clear enough to start, the system should generate a default build drop instead of stalling on clarification loops.
`
}

function buildBoStuffSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="#031326"/>
      <stop offset="55%" stop-color="#071f35"/>
      <stop offset="100%" stop-color="#000810"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="42%">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="#00d4ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>
  <g opacity="0.18" stroke="#00d4ff" fill="none">
    <path d="M80 120h280M1240 120h280M80 780h280M1240 780h280" stroke-width="3"/>
    <path d="M120 80v180M1480 80v180M120 640v180M1480 640v180" stroke-width="3"/>
    <circle cx="800" cy="450" r="220" stroke-width="2"/>
    <circle cx="800" cy="450" r="300" stroke-width="1.5" stroke-dasharray="8 12"/>
  </g>
  <g transform="translate(800 450)">
    <circle r="160" fill="rgba(0,212,255,0.06)" stroke="#00d4ff" stroke-width="4"/>
    <circle r="105" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="10 8"/>
    <text x="0" y="-18" text-anchor="middle" fill="#c8f7ff" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="700">JARVIS / AXON</text>
    <text x="0" y="42" text-anchor="middle" fill="#7dd3fc" font-family="Arial, Helvetica, sans-serif" font-size="34" letter-spacing="8">BO'S STUFF</text>
    <text x="0" y="92" text-anchor="middle" fill="#22c55e" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="5">MISSION CONTROL ACTIVE</text>
  </g>
  <text x="100" y="110" fill="#00d4ff" font-family="Arial, Helvetica, sans-serif" font-size="28" letter-spacing="4">COMMAND HUD</text>
  <text x="100" y="150" fill="#7dd3fc" font-family="Arial, Helvetica, sans-serif" font-size="18" letter-spacing="3">AUTONOMOUS ARTIFACT DROP</text>
  <text x="1160" y="810" fill="#22c55e" font-family="Arial, Helvetica, sans-serif" font-size="20" letter-spacing="3">AXON EXECUTION COMPLETE</text>
</svg>
`
}

async function executeDesktopProvision() {
  const desktopPath = path.join('C:\\Users\\bobel', 'Desktop')
  const folderPath = path.join(desktopPath, "Bo's Stuff")
  const imagePath = path.join(folderPath, 'jarvis-axon-hud.svg')

  await mkdir(folderPath, { recursive: true })
  await writeFile(imagePath, buildBoStuffSvg(), 'utf8')

  return {
    folderPath,
    imagePath,
    imagePreview: buildBoStuffSvg(),
  }
}

async function executeProjectScaffold(project: string, message: string) {
  const desktopPath = path.join('C:\\Users\\bobel', 'Desktop')
  const folderName = normalizeProjectFolderName(project)
  const folderPath = path.join(desktopPath, folderName)
  const heroSvg = buildProjectHeroSvg(project)
  const indexHtml = buildProjectIndexHtml(project, message)
  const readme = buildProjectReadme(project, message, folderName)
  const spec = buildProjectSpec(project, message)

  const indexPath = path.join(folderPath, 'index.html')
  const readmePath = path.join(folderPath, 'README.md')
  const specPath = path.join(folderPath, 'SPEC.md')
  const heroPath = path.join(folderPath, 'hero.svg')

  await mkdir(folderPath, { recursive: true })
  await writeFile(indexPath, indexHtml, 'utf8')
  await writeFile(readmePath, readme, 'utf8')
  await writeFile(specPath, spec, 'utf8')
  await writeFile(heroPath, heroSvg, 'utf8')

  return {
    folderName,
    folderPath,
    indexPath,
    readmePath,
    specPath,
    heroPath,
    heroSvg,
    readmePreview: readme,
    specPreview: spec,
    indexPreview: indexHtml,
  }
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
          content: error instanceof Error ? error.message : 'Axon bridge failed.',
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
        project?: string
        title?: string
      }
    | null

  const message = body?.messages?.length ? getLatestUserMessage(body.messages) : body?.message?.trim() ?? ''

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required.' }), { status: 400 })
  }

  return createSseResponse(async (send) => {
    send({ type: 'status', tool: 'axon_queue', content: 'Writing task to Axon queue' })

    const raw = await readFile(AXON_QUEUE_PATH, 'utf8')
    const queueState = JSON.parse(raw) as AxonQueueState
    const created = new Date().toISOString()
    const task: AxonQueueTask = {
      id: `axon-${Math.floor(Date.now() / 1000)}-${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      title: body?.title?.trim() || buildTitle(message),
      status: 'queued',
      created,
      assigned_by: 'Jarvis / Axon HUD',
      source: 'jarvis-axon-hud',
      project: body?.project?.trim() || 'shared',
      proof_required:
        'Read the mission-control intake message, act on it through the Axon workflow, and return any result through the normal Axon workspace.',
      intake: {
        channel: 'mission-control',
        message,
      },
    }

    const projectName = body?.project?.trim() || 'shared'
    const shouldExecuteDesktopNow = shouldExecuteDesktopProvision(message)
    const shouldExecuteProjectNow = !shouldExecuteDesktopNow && shouldExecuteProjectScaffold(message)
    let completionNote = ''

    if (shouldExecuteDesktopNow) {
      send({ type: 'status', tool: 'filesystem', content: 'Creating desktop folder' })
      const result = await executeDesktopProvision()
      send({ type: 'status', tool: 'image_renderer', content: 'Generating branded HUD image' })

      task.status = 'completed'
      task.artifacts = [
        { kind: 'folder', path: result.folderPath, label: "Bo's Stuff folder" },
        {
          kind: 'image',
          path: result.imagePath,
          label: 'Jarvis / Axon HUD poster',
          mimeType: 'image/svg+xml',
          preview: result.imagePreview,
        },
      ]
      queueState.completed = [task, ...(queueState.completed ?? [])]
      completionNote = `Axon completed the task. Folder created at ${result.folderPath}. Image saved at ${result.imagePath}.`
    } else if (shouldExecuteProjectNow) {
      send({ type: 'status', tool: 'filesystem', content: 'Creating project drop folder' })
      const result = await executeProjectScaffold(projectName, message)
      send({ type: 'status', tool: 'website_scaffold', content: 'Building static mission-control scaffold' })
      send({ type: 'status', tool: 'spec_writer', content: 'Writing README and initial project spec' })

      task.status = 'completed'
      task.artifacts = [
        { kind: 'folder', path: result.folderPath, label: `${result.folderName} folder` },
        {
          kind: 'file',
          path: result.indexPath,
          label: 'Launch-ready index.html',
          mimeType: 'text/html',
          preview: result.indexPreview,
        },
        {
          kind: 'file',
          path: result.readmePath,
          label: 'Project README',
          mimeType: 'text/markdown',
          preview: result.readmePreview,
        },
        {
          kind: 'file',
          path: result.specPath,
          label: 'Build spec',
          mimeType: 'text/markdown',
          preview: result.specPreview,
        },
        {
          kind: 'image',
          path: result.heroPath,
          label: 'Branded project hero',
          mimeType: 'image/svg+xml',
          preview: result.heroSvg,
        },
      ]
      queueState.completed = [task, ...(queueState.completed ?? [])]
      completionNote = `Axon completed the build drop. Project folder created at ${result.folderPath}. Static site scaffold, README, spec, and branded hero asset are ready.`
    } else {
      queueState.queue = [...(queueState.queue ?? []), task]
    }

    const directory = path.dirname(AXON_QUEUE_PATH)
    const tempPath = `${AXON_QUEUE_PATH}.tmp`
    await mkdir(directory, { recursive: true })
    await writeFile(tempPath, `${JSON.stringify(queueState, null, 2)}\n`, 'utf8')
    await rename(tempPath, AXON_QUEUE_PATH)

    send({
      type: 'task_created',
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        created: task.created,
        project: task.project,
        assignedBy: task.assigned_by,
        message: task.intake.message,
        artifacts: task.artifacts ?? [],
      },
    })

    const reply = shouldExecuteDesktopNow || shouldExecuteProjectNow
      ? completionNote
      : `Axon execution task created. Task ${task.id} is now queued for implementation in project ${task.project}.`
    for (let index = 0; index < reply.length; index += 10) {
      send({ type: 'token', content: reply.slice(index, index + 10) })
    }
  })
}
