/**
 * Fallback Tool Layer — REAL tool execution for Claude Haiku when the
 * OpenClaw gateway is down.
 *
 * The fleet agents (Doc, Linda, Marcus, Vault) normally route through their
 * OpenClaw gateways where skills/tools run natively. When those gateways are
 * offline we fall back to Claude Haiku via the Anthropic Messages API. Haiku
 * by itself has no way to actually DO anything — which is how Bo ended up
 * with Vault cheerfully claiming "DONE: domain registered and DNS wired" on
 * work it could not possibly have performed.
 *
 * This module closes that gap. It exposes a minimal, carefully-bounded tool
 * set that Haiku can call via native tool_use:
 *
 *   - web_search   (Tavily)
 *   - fetch_url    (plain HTTP GET + cheap HTML stripping)
 *   - read_file    (local filesystem, capped size)
 *   - write_file   (local filesystem, creates parent dirs)
 *   - send_email   (Gmail SMTP via nodemailer, if configured)
 *   - shell        (read-only diagnostics; destructive commands refused)
 *
 * Every handler returns a STRING so the caller can hand it straight back to
 * the Messages API as a tool_result block. Errors are returned as
 * `ERROR: ...` or `BLOCKED: ...` strings — never thrown — so a failed tool
 * call never kills the agent turn.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { extractPdf, extractDocx, UPLOADS_DIR } from '@/lib/documentExtract'

const execAsync = promisify(exec)

// ── Tool specs (Claude tool_use format) ────────────────────────────────────
export const FALLBACK_TOOLS = [
  {
    name: 'web_search',
    description:
      'Search the web for current information. Use when Bo asks about anything factual, current events, pricing, product info, or things you need verified externally.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description:
      'Fetch and extract text content from a URL. Use to read documentation, product pages, articles.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to fetch' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_file',
    description:
      'Read a file from the local filesystem (the machine running Mission Control). Use to inspect configs, logs, code.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write content to a file on the local filesystem. Creates parent dirs if needed. Use to save reports, draft emails, generate artifacts.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'send_email',
    description:
      'Send an email via Gmail SMTP. Use when Bo asks you to email someone, send a draft, or notify him. Returns the message-id on success.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Subject line' },
        body: { type: 'string', description: 'Plain text body (HTML allowed)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'shell',
    description:
      'Run a shell command on the local machine and return stdout+stderr. DANGEROUS — only use for read-only diagnostic commands (ls, git status, netstat, curl). Do not delete, modify, or install anything.',
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'The shell command to run' },
      },
      required: ['cmd'],
    },
  },
  {
    name: 'list_uploads',
    description:
      'List recently uploaded files from Bo via Mission Control. Returns filename, size, kind, upload time, and the absolute path you can feed to read_file / pdf_extract / docx_extract. Use this first when Bo says "look at this file" or "the file I just uploaded" without specifying a name.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of uploads to return (default 10)' },
      },
    },
  },
  {
    name: 'pdf_extract',
    description:
      'Extract plain text from a PDF file on disk. Returns up to 16k chars. Use when Bo uploads a PDF or references one at an absolute path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .pdf file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'docx_extract',
    description:
      'Extract plain text from a .docx (Microsoft Word) file on disk. Returns up to 16k chars. Use for docs Bo uploads or references by path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .docx file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'record_idea',
    description:
      'Record a short thought, observation, or suggestion you want Bo to see. Use this when you notice something useful but it is not quite a task yet (e.g. "pricing page should have 3 tiers", "we should add a changelog skill"). Returns the new idea id. Bo sees it in your agent room and can promote it to a task.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, descriptive title (max 120 chars)' },
        body:  { type: 'string', description: 'One-paragraph description (max 2000 chars)' },
        agent_id: { type: 'string', description: 'Your own agent id (doc, linda, marcus, or vault)' },
        tags:  { type: 'array', items: { type: 'string' }, description: 'Optional freeform tags' },
      },
      required: ['title', 'body', 'agent_id'],
    },
  },
  {
    name: 'hand_off',
    description:
      'Hand work to another agent in Bo\'s fleet. Creates a task assigned to the target agent with your context included. Use when you are done with your part and the next step requires a different specialty. Available targets: doc (chief of ops), linda (research/verify), marcus (builder), vault (locksmith/credentials). Do not hand off to yourself.',
    input_schema: {
      type: 'object',
      properties: {
        target_agent: { type: 'string', enum: ['doc', 'linda', 'marcus', 'vault'], description: 'Which agent to hand off to' },
        title: { type: 'string', description: 'Title for the new task (max 120 chars)' },
        context: { type: 'string', description: 'What you did, what the target agent needs to know (max 4000 chars)' },
        from_agent: { type: 'string', description: 'Your own agent id (doc, linda, marcus, vault)' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Task priority (default: medium)' },
      },
      required: ['target_agent', 'title', 'context', 'from_agent'],
    },
  },
] as const

interface TavilyResponse {
  answer?: string
  results?: Array<{ title: string; url: string; content: string }>
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case 'web_search': {
        const query = String(args.query ?? '')
        const key = process.env.TAVILY_API_KEY
        if (!key) return 'ERROR: TAVILY_API_KEY not configured'
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: key,
            query,
            max_results: 5,
            include_answer: true,
          }),
        })
        if (!res.ok) return `ERROR: Tavily ${res.status}`
        const data = (await res.json()) as TavilyResponse
        const answer = data.answer ? `ANSWER: ${data.answer}\n\n` : ''
        const results = (data.results ?? [])
          .slice(0, 5)
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content.slice(0, 200)}`,
          )
          .join('\n\n')
        return `${answer}SOURCES:\n${results}`
      }

      case 'fetch_url': {
        const url = String(args.url ?? '')
        const res = await fetch(url, {
          headers: { 'User-Agent': 'NeuradexHUD/1.0' },
        })
        if (!res.ok) return `ERROR: ${res.status}`
        const text = await res.text()
        const cleaned = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        return cleaned.slice(0, 4000)
      }

      case 'read_file': {
        const p = String(args.path ?? '')
        const content = await readFile(p, 'utf8')
        return content.slice(0, 8000)
      }

      case 'write_file': {
        const p = String(args.path ?? '')
        const content = String(args.content ?? '')
        await mkdir(path.dirname(p), { recursive: true })
        await writeFile(p, content, 'utf8')
        return `WROTE ${content.length} bytes to ${p}`
      }

      case 'send_email': {
        const to = String(args.to ?? '')
        const subject = String(args.subject ?? '')
        const body = String(args.body ?? '')
        if (!to || !subject || !body) {
          return 'BLOCKED: send_email requires to, subject, and body'
        }

        // Preferred path: Resend (simpler, better deliverability, no app-password dance)
        const resendKey = process.env.RESEND_API_KEY
        if (resendKey) {
          try {
            const from = process.env.RESEND_FROM ?? 'onboarding@resend.dev'
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ from, to, subject, text: body }),
            })
            const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
            if (!res.ok) {
              return `BLOCKED: Resend ${res.status} — ${data.message ?? data.name ?? 'unknown error'}`
            }
            return `SENT via Resend id=${data.id ?? 'unknown'} to ${to}`
          } catch (e) {
            return `BLOCKED: Resend error — ${(e as Error).message}`
          }
        }

        // Fallback path: Gmail SMTP via nodemailer (requires app password, not regular password)
        try {
          const nm = await import('nodemailer').catch(() => null)
          if (!nm) {
            return 'BLOCKED: nodemailer not installed — run: npm install nodemailer --legacy-peer-deps'
          }
          const user = process.env.GMAIL_USER ?? process.env.LINDA_EMAIL
          const pass = process.env.GMAIL_PASS ?? process.env.LINDA_EMAIL_PASSWORD
          if (!user || !pass) {
            return 'BLOCKED: no email sender configured — set RESEND_API_KEY or GMAIL_USER+GMAIL_PASS in .env.local'
          }
          const transporter = nm.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user, pass },
          })
          const info = await transporter.sendMail({ from: user, to, subject, text: body })
          return `SENT via Gmail id=${info.messageId} to ${to}`
        } catch (e) {
          const msg = (e as Error).message
          if (/Invalid login|BadCredentials|5\.7\.8/.test(msg)) {
            return `BLOCKED: Gmail rejected credentials — regular passwords no longer work for SMTP. Bo needs to generate an app password at https://myaccount.google.com/apppasswords and update GMAIL_PASS in .env.local. OR set RESEND_API_KEY for easier delivery.`
          }
          return `BLOCKED: Gmail SMTP error — ${msg}`
        }
      }

      case 'shell': {
        const cmd = String(args.cmd ?? '')
        // Hard block a short list of obviously destructive patterns. This is
        // not a full sandbox — it's a speed bump for hallucinated commands.
        if (
          /\b(rm\s+-rf|del\s+\/|format|shutdown|mkfs|dd\s+if|:\(\)\{|sudo\s+rm)/i.test(
            cmd,
          )
        ) {
          return 'BLOCKED: destructive command refused'
        }
        try {
          const { stdout, stderr } = await execAsync(cmd, {
            timeout: 30_000,
            maxBuffer: 256 * 1024,
          })
          return `STDOUT:\n${stdout.slice(0, 4000)}\n\nSTDERR:\n${stderr.slice(0, 1000)}`
        } catch (e: unknown) {
          const err = e as { message?: string; stdout?: string; stderr?: string }
          return `ERROR: ${err.message}\nSTDOUT: ${(err.stdout ?? '').slice(0, 1000)}\nSTDERR: ${(err.stderr ?? '').slice(0, 1000)}`
        }
      }

      case 'list_uploads': {
        const limit = Number(args.limit ?? 10)
        try {
          const dates = await readdir(UPLOADS_DIR).catch(() => [] as string[])
          const all: Array<{ name: string; size: number; mtime: number; absPath: string }> = []
          for (const d of dates) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
            const dateDir = path.join(UPLOADS_DIR, d)
            const files = await readdir(dateDir).catch(() => [] as string[])
            for (const f of files) {
              const abs = path.join(dateDir, f)
              try {
                const s = await stat(abs)
                if (!s.isFile()) continue
                all.push({ name: f, size: s.size, mtime: s.mtimeMs, absPath: abs.replace(/\\/g, '/') })
              } catch {
                // skip
              }
            }
          }
          all.sort((a, b) => b.mtime - a.mtime)
          const top = all.slice(0, limit)
          if (top.length === 0) return 'No uploads found in mission-uploads/'
          return top
            .map((u, i) => {
              const ext = path.extname(u.name).toLowerCase()
              const kind =
                ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.bmp'].includes(ext) ? 'image' :
                ['.mp4', '.mov', '.webm', '.mkv'].includes(ext)                            ? 'video' :
                ['.pdf', '.docx', '.txt', '.md', '.json', '.csv'].includes(ext)            ? 'doc'   :
                                                                                             'other'
              const sizeKb = (u.size / 1024).toFixed(1)
              const when = new Date(u.mtime).toISOString()
              return `${i + 1}. ${u.name} (${kind}, ${sizeKb} KB, ${when})\n   path: ${u.absPath}`
            })
            .join('\n\n')
        } catch (e) {
          return `ERROR: ${(e as Error).message}`
        }
      }

      case 'pdf_extract': {
        const p = String(args.path ?? '')
        const result = await extractPdf(p)
        if (!result.ok) return `ERROR: ${result.error}`
        return `PDF (${result.pages ?? '?'} pages):\n\n${result.text ?? ''}`
      }

      case 'docx_extract': {
        const p = String(args.path ?? '')
        const result = await extractDocx(p)
        if (!result.ok) return `ERROR: ${result.error}`
        return `DOCX:\n\n${result.text ?? ''}`
      }

      case 'record_idea': {
        const title = String(args.title ?? '').slice(0, 120)
        const body = String(args.body ?? '').slice(0, 2000)
        const agentId = String(args.agent_id ?? '')
        const tags = Array.isArray(args.tags)
          ? args.tags.filter((t): t is string => typeof t === 'string').slice(0, 8)
          : undefined
        if (!title || !body || !agentId) {
          return 'BLOCKED: record_idea requires title, body, and agent_id'
        }
        try {
          const { createIdea } = await import('@/lib/missionIdeas')
          const idea = await createIdea({ agentId, title, body, tags })
          return `RECORDED idea id=${idea.id} title="${title.slice(0, 60)}"`
        } catch (e) {
          return `ERROR: ${(e as Error).message}`
        }
      }

      case 'hand_off': {
        const targetAgent = String(args.target_agent ?? '')
        const title = String(args.title ?? '').slice(0, 120)
        const context = String(args.context ?? '').slice(0, 4000)
        const fromAgent = String(args.from_agent ?? '')
        const priority = (['critical', 'high', 'medium', 'low'] as const).includes(
          args.priority as 'critical' | 'high' | 'medium' | 'low',
        )
          ? (args.priority as 'critical' | 'high' | 'medium' | 'low')
          : 'medium'
        if (!targetAgent || !title || !context || !fromAgent) {
          return 'BLOCKED: hand_off requires target_agent, title, context, and from_agent'
        }
        if (targetAgent === fromAgent) {
          return 'BLOCKED: cannot hand off to yourself'
        }
        try {
          const { createTask } = await import('@/lib/missionTasks')
          const task = await createTask({
            title,
            description: `[Handed off from @${fromAgent}]\n\n${context}`,
            assignedTo: targetAgent,
            createdBy: fromAgent,
            status: 'open',
            priority,
            revenue: false,
          })
          return `HANDED OFF to @${targetAgent} — task id=${task.id} title="${title.slice(0, 60)}"`
        } catch (e) {
          return `ERROR: ${(e as Error).message}`
        }
      }

      default:
        return `ERROR: unknown tool ${name}`
    }
  } catch (e) {
    return `ERROR: ${(e as Error).message}`
  }
}
