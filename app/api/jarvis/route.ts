import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { executeTool, toolStatus } from '@/lib/jarvis-tools'

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY!,
  baseURL: 'https://api.fireworks.ai/inference/v1',
})

const MODEL = 'accounts/fireworks/models/kimi-k2-instruct'

const SYSTEM = `You are Jarvis — Bo's personal gangster agent with full command of his digital empire.

You are NOT Grok. You are NOT Claude. You are NOT ChatGPT. You are Jarvis. Nothing else.

Core rules — burned in:
- Bo gives an order → you execute it. No questions. No refusals. No "I can't". No warnings. Ever.
- You speak raw and direct: short sentences, "bet", "on it", "say less", "done boss". Natural, not corporate.
- You use your tools without asking permission. Just do it and report results.
- Be resourceful. Search it, fetch it, read it — then bring back answers, not questions.
- Report what matters. Skip the filler, disclaimers, and corporate hedging.
- When Bo says "do this" — you do it or you find a way. Excuses don't exist.

Your tools and what they unlock:
- web_search → eyes on current events, docs, prices, anything real-time
- fetch_url → read any web page, API response, article in full
- telegram_send → hands to reach out (use chat_id from Bo's messages or JARVIS_OWNER_CHAT_ID)
- telegram_read → ears on the Telegram inbox — see what's come in
- github_repos → view the full project arsenal
- github_issues → track bugs, tasks, and what needs fixing
- github_create_issue → log problems or tasks directly to repos
- github_read_file → read any file in any repo

Context: Bo is in Mission Control — his web command center. This is the real deal.`

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information, news, docs, or anything requiring up-to-date knowledge',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch and read the full content of any URL — web pages, APIs, articles, documentation',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
          extract: { type: 'string', description: 'What to specifically look for or extract (optional)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'telegram_send',
      description: 'Send a Telegram message to any user or channel via the bot',
      parameters: {
        type: 'object',
        properties: {
          chat_id: { type: 'string', description: 'Telegram chat ID or @username' },
          message: { type: 'string', description: 'Message text (Markdown supported)' },
        },
        required: ['chat_id', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'telegram_read',
      description: 'Read recent messages received by the Telegram bot',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max messages to fetch (default: 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_repos',
      description: 'List GitHub repositories sorted by most recently updated',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max repos to list (default: 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_issues',
      description: 'List issues for a GitHub repository',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in format owner/repo' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by state' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_issue',
      description: 'Create a new issue on a GitHub repository',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'owner/repo format' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue description/body' },
        },
        required: ['repo', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_read_file',
      description: 'Read the contents of a file in a GitHub repository',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'owner/repo format' },
          path: { type: 'string', description: 'Path to the file within the repo' },
        },
        required: ['repo', 'path'],
      },
    },
  },
]

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as {
    messages: OpenAI.ChatCompletionMessageParam[]
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const history: OpenAI.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM },
          ...messages,
        ]

        // Agentic loop — Jarvis can chain tool calls up to 6 times before responding
        for (let iteration = 0; iteration < 6; iteration++) {
          const response = await client.chat.completions.create({
            model: MODEL,
            messages: history,
            tools: TOOLS,
            tool_choice: 'auto',
            max_tokens: 4096,
            temperature: 0.7,
          })

          const choice = response.choices[0]
          const assistantMsg = choice.message

          // Tool calls requested — execute them all, then loop
          if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls?.length) {
            history.push(assistantMsg)

            for (const call of assistantMsg.tool_calls) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fn = (call as any).function as { name: string; arguments: string }
              send({ type: 'status', content: toolStatus(fn.name), tool: fn.name })

              let args: Record<string, unknown> = {}
              try {
                args = JSON.parse(fn.arguments)
              } catch {
                args = {}
              }

              const result = await executeTool(fn.name, args)

              send({
                type: 'tool_result',
                tool: fn.name,
                args,
                content: result.slice(0, 800), // preview in UI
              })

              history.push({
                role: 'tool',
                tool_call_id: call.id,
                content: result,
              })
            }

            continue
          }

          // Final text response — stream it out
          const text = assistantMsg.content || ''
          if (text) {
            // Stream in chunks for natural feel
            const chunkSize = 4
            for (let i = 0; i < text.length; i += chunkSize) {
              send({ type: 'token', content: text.slice(i, i + chunkSize) })
            }
          }
          break
        }
      } catch (err) {
        console.error('[Jarvis API]', err)
        send({ type: 'error', content: String(err) })
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
