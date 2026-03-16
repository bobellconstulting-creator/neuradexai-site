'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolCall {
  tool: string
  args?: Record<string, unknown>
  result?: string
  status: 'running' | 'done'
}

interface Message {
  id: string
  role: 'user' | 'jarvis' | 'system'
  content: string
  streaming?: boolean
  toolCalls?: ToolCall[]
}

type JarvisStatus = 'idle' | 'thinking' | 'working' | 'responding'

// ── Tool icons ─────────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  web_search:          '🔍',
  fetch_url:           '🌐',
  telegram_send:       '📤',
  telegram_read:       '📥',
  github_repos:        '📁',
  github_issues:       '🐛',
  github_create_issue: '✍️',
  github_read_file:    '📄',
}

// ── Simple markdown renderer ──────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/```([\s\S]*?)```/g, '<pre class="mc-pre">$1</pre>')
    .replace(/`([^`]+)`/g, '<code class="mc-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<div class="mc-h3">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="mc-h2">$1</div>')
    .replace(/^# (.+)$/gm, '<div class="mc-h1">$1</div>')
    .replace(/^[-•] (.+)$/gm, '<div class="mc-li">▸ $1</div>')
    .replace(/\n/g, '<br/>')
}

// ── Status label ──────────────────────────────────────────────────────────────

function statusLabel(status: JarvisStatus, activeTool?: string): string {
  if (status === 'thinking')   return 'JARVIS IS THINKING...'
  if (status === 'working')    return activeTool ? `JARVIS → ${activeTool.replace(/_/g, ' ').toUpperCase()}` : 'JARVIS IS WORKING...'
  if (status === 'responding') return 'JARVIS IS RESPONDING...'
  return 'MISSION CONTROL — READY'
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MissionControl() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'boot',
      role: 'system',
      content: 'JARVIS MISSION CONTROL — ONLINE\nKimi K2 engine active. All systems nominal.\nType a command or speak.',
    },
  ])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<JarvisStatus>('idle')
  const [activeTool, setActiveTool] = useState<string | undefined>()
  const [listening, setListening] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef  = useRef<any>(null)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || status !== 'idle') return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
    }

    const jarvisId = (Date.now() + 1).toString()
    const jarvisMsg: Message = {
      id: jarvisId,
      role: 'jarvis',
      content: '',
      streaming: true,
      toolCalls: [],
    }

    setMessages((prev) => [...prev, userMsg, jarvisMsg])
    setInput('')
    setStatus('thinking')

    // Build history for API (only user/jarvis messages, not system boot)
    const history = [...messages, userMsg]
      .filter((m) => m.role === 'user' || m.role === 'jarvis')
      .map((m) => ({
        role: m.role === 'jarvis' ? 'assistant' : 'user',
        content: m.content,
      }))

    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })

        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let evt: { type: string; content?: string; tool?: string; args?: Record<string, unknown> }
          try { evt = JSON.parse(raw) } catch { continue }

          switch (evt.type) {
            case 'status':
              setStatus('working')
              setActiveTool(evt.tool)
              // Add tool call to the jarvis message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jarvisId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls ?? []),
                          { tool: evt.tool!, args: evt.args, status: 'running' },
                        ],
                      }
                    : m
                )
              )
              break

            case 'tool_result':
              // Mark tool call as done
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jarvisId
                    ? {
                        ...m,
                        toolCalls: m.toolCalls?.map((tc) =>
                          tc.tool === evt.tool && tc.status === 'running'
                            ? { ...tc, result: evt.content, status: 'done' }
                            : tc
                        ),
                      }
                    : m
                )
              )
              break

            case 'token':
              setStatus('responding')
              setActiveTool(undefined)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jarvisId ? { ...m, content: m.content + (evt.content ?? '') } : m
                )
              )
              break

            case 'done':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jarvisId ? { ...m, streaming: false } : m
                )
              )
              setStatus('idle')
              setActiveTool(undefined)
              break

            case 'error':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === jarvisId
                    ? { ...m, content: `⚠️ Error: ${evt.content}`, streaming: false }
                    : m
                )
              )
              setStatus('idle')
              break
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === jarvisId
            ? { ...m, content: `⚠️ Connection error: ${err}`, streaming: false }
            : m
        )
      )
      setStatus('idle')
      setActiveTool(undefined)
    }
  }, [messages, status])

  // ── Keyboard handler ────────────────────────────────────────────────────────

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // ── Voice input ─────────────────────────────────────────────────────────────

  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      alert('Voice input not supported in this browser. Use Chrome.')
      return
    }

    if (listening) {
      recogRef.current?.stop()
      setListening(false)
      return
    }

    const recog = new SpeechRecognition()
    recog.lang = 'en-US'
    recog.interimResults = false
    recog.maxAlternatives = 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      setInput((prev) => (prev ? prev + ' ' + transcript : transcript))
      setListening(false)
    }

    recog.onend = () => setListening(false)
    recog.onerror = () => setListening(false)

    recog.start()
    recogRef.current = recog
    setListening(true)
  }

  // ── Clear history ───────────────────────────────────────────────────────────

  const clearHistory = () => {
    setMessages([
      {
        id: 'boot-' + Date.now(),
        role: 'system',
        content: 'JARVIS MISSION CONTROL — CLEARED\nNew session started.',
      },
    ])
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const busy = status !== 'idle'

  return (
    <div className="mc-root">
      {/* ── Scanline overlay ── */}
      <div className="mc-scanlines" aria-hidden />

      {/* ── Top status bar ── */}
      <header className="mc-header">
        <div className="mc-header-left">
          <span className="mc-logo">⬡ JARVIS</span>
          <span className="mc-divider">│</span>
          <span className="mc-subtitle">MISSION CONTROL</span>
        </div>
        <div className="mc-header-center">
          <motion.div
            className="mc-status-dot"
            animate={{ opacity: busy ? [1, 0.2, 1] : 1 }}
            transition={{ repeat: busy ? Infinity : 0, duration: 0.8 }}
            style={{ backgroundColor: busy ? '#f97316' : '#00f2ff' }}
          />
          <motion.span
            key={statusLabel(status, activeTool)}
            className="mc-status-text"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {statusLabel(status, activeTool)}
          </motion.span>
        </div>
        <div className="mc-header-right">
          <button className="mc-btn-ghost" onClick={clearHistory} title="Clear history">
            ✕ CLEAR
          </button>
          <a href="/dashboard" className="mc-btn-ghost">
            ← DASHBOARD
          </a>
        </div>
      </header>

      {/* ── Messages ── */}
      <main className="mc-messages" role="log" aria-live="polite">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className={`mc-msg mc-msg-${msg.role}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Role label */}
              {msg.role !== 'system' && (
                <div className="mc-msg-label">
                  {msg.role === 'user' ? '⬡ YOU' : '⬡ JARVIS'}
                </div>
              )}

              {/* Tool calls */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mc-tools">
                  {msg.toolCalls.map((tc, i) => (
                    <motion.div
                      key={i}
                      className={`mc-tool mc-tool-${tc.status}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <span className="mc-tool-icon">
                        {TOOL_ICONS[tc.tool] ?? '⚙️'}
                      </span>
                      <span className="mc-tool-name">{tc.tool.replace(/_/g, ' ')}</span>
                      {tc.status === 'running' && (
                        <motion.span
                          className="mc-tool-spinner"
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        >
                          ◌
                        </motion.span>
                      )}
                      {tc.status === 'done' && <span className="mc-tool-check">✓</span>}
                      {tc.result && (
                        <details className="mc-tool-result">
                          <summary>view result</summary>
                          <pre>{tc.result}</pre>
                        </details>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Message content */}
              <div
                className="mc-msg-content"
                dangerouslySetInnerHTML={{
                  __html: msg.role === 'system'
                    ? msg.content.replace(/\n/g, '<br/>')
                    : renderMarkdown(msg.content),
                }}
              />

              {/* Streaming cursor */}
              {msg.streaming && msg.content && (
                <motion.span
                  className="mc-cursor"
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6 }}
                >
                  ▋
                </motion.span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </main>

      {/* ── Input bar ── */}
      <footer className="mc-input-bar">
        <div className={`mc-input-wrap ${busy ? 'mc-input-busy' : ''}`}>
          <textarea
            ref={inputRef}
            className="mc-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={busy ? 'Jarvis is working...' : 'Issue a directive... (Enter to send, Shift+Enter for newline)'}
            disabled={busy}
            rows={1}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 140) + 'px'
            }}
          />

          {/* Voice button */}
          <motion.button
            className={`mc-voice-btn ${listening ? 'mc-voice-active' : ''}`}
            onClick={toggleVoice}
            whileTap={{ scale: 0.9 }}
            title={listening ? 'Stop listening' : 'Voice input'}
            animate={listening ? { boxShadow: ['0 0 0 0 rgba(0,242,255,0.4)', '0 0 0 10px rgba(0,242,255,0)'] } : {}}
            transition={listening ? { repeat: Infinity, duration: 1 } : {}}
          >
            {listening ? '🔴' : '🎙️'}
          </motion.button>

          {/* Send button */}
          <motion.button
            className="mc-send-btn"
            onClick={() => sendMessage(input)}
            disabled={busy || !input.trim()}
            whileTap={{ scale: 0.95 }}
          >
            {busy ? (
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                ◌
              </motion.span>
            ) : (
              'SEND ▶'
            )}
          </motion.button>
        </div>
      </footer>

      {/* ── Styles ── */}
      <style>{`
        :root {
          --cyan:    #00f2ff;
          --indigo:  #4b3fa0;
          --black:   #050508;
          --surface: #0a0a12;
          --border:  rgba(0, 242, 255, 0.12);
          --text:    #c8d8e8;
          --dim:     rgba(200, 216, 232, 0.45);
        }

        .mc-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--black);
          color: var(--text);
          font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
          font-size: 14px;
          overflow: hidden;
          position: relative;
        }

        /* Scanlines */
        .mc-scanlines {
          position: fixed;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.03) 2px,
            rgba(0,0,0,0.03) 4px
          );
          pointer-events: none;
          z-index: 10;
        }

        /* Header */
        .mc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 20px;
          border-bottom: 1px solid var(--border);
          background: rgba(10, 10, 18, 0.95);
          backdrop-filter: blur(10px);
          flex-shrink: 0;
          z-index: 5;
        }
        .mc-header-left { display: flex; align-items: center; gap: 10px; }
        .mc-logo { color: var(--cyan); font-size: 16px; font-weight: 700; letter-spacing: 2px; }
        .mc-divider { color: var(--border); }
        .mc-subtitle { color: var(--dim); font-size: 11px; letter-spacing: 3px; }
        .mc-header-center {
          display: flex; align-items: center; gap: 8px;
          background: rgba(0,242,255,0.04);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 5px 14px;
        }
        .mc-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .mc-status-text { font-size: 11px; letter-spacing: 1.5px; color: var(--cyan); }
        .mc-header-right { display: flex; align-items: center; gap: 8px; }
        .mc-btn-ghost {
          background: none; border: 1px solid var(--border);
          color: var(--dim); font-size: 11px; letter-spacing: 1px;
          padding: 5px 10px; border-radius: 3px; cursor: pointer;
          font-family: inherit; text-decoration: none;
          transition: all 0.2s;
        }
        .mc-btn-ghost:hover { border-color: var(--cyan); color: var(--cyan); }

        /* Messages */
        .mc-messages {
          flex: 1;
          overflow-y: auto;
          padding: 24px 28px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          scrollbar-width: thin;
          scrollbar-color: rgba(0,242,255,0.2) transparent;
        }
        .mc-messages::-webkit-scrollbar { width: 4px; }
        .mc-messages::-webkit-scrollbar-thumb { background: rgba(0,242,255,0.2); border-radius: 2px; }

        /* Message bubbles */
        .mc-msg { max-width: 820px; display: flex; flex-direction: column; gap: 6px; }
        .mc-msg-user { align-self: flex-end; align-items: flex-end; }
        .mc-msg-jarvis { align-self: flex-start; align-items: flex-start; }
        .mc-msg-system { align-self: center; align-items: center; }

        .mc-msg-label {
          font-size: 10px; letter-spacing: 2px; color: var(--dim);
          padding: 0 4px;
        }
        .mc-msg-user .mc-msg-label { color: rgba(0,242,255,0.6); }
        .mc-msg-jarvis .mc-msg-label { color: rgba(75,63,160,0.9); }

        .mc-msg-content {
          padding: 12px 16px;
          border-radius: 6px;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .mc-msg-user .mc-msg-content {
          background: rgba(0, 242, 255, 0.07);
          border: 1px solid rgba(0, 242, 255, 0.2);
          color: #e0f4ff;
        }
        .mc-msg-jarvis .mc-msg-content {
          background: rgba(75, 63, 160, 0.08);
          border: 1px solid rgba(75, 63, 160, 0.25);
          color: var(--text);
        }
        .mc-msg-system .mc-msg-content {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(0,242,255,0.08);
          color: rgba(0,242,255,0.5);
          font-size: 12px;
          letter-spacing: 0.5px;
          text-align: center;
        }

        /* Streaming cursor */
        .mc-cursor {
          display: inline-block;
          color: var(--cyan);
          font-size: 16px;
          line-height: 1;
          margin-left: 2px;
        }

        /* Markdown styles */
        .mc-msg-content :global(.mc-h1) { font-size: 18px; font-weight: 700; color: var(--cyan); margin: 8px 0 4px; }
        .mc-msg-content :global(.mc-h2) { font-size: 15px; font-weight: 600; color: var(--cyan); margin: 6px 0 3px; }
        .mc-msg-content :global(.mc-h3) { font-size: 13px; font-weight: 600; color: rgba(0,242,255,0.75); margin: 4px 0 2px; }
        .mc-msg-content :global(.mc-li) { color: var(--text); margin: 2px 0; padding-left: 4px; }
        .mc-msg-content :global(.mc-pre) {
          background: rgba(0,0,0,0.5); border: 1px solid var(--border);
          padding: 10px 14px; border-radius: 4px;
          overflow-x: auto; white-space: pre; font-size: 12px;
          margin: 8px 0; color: #a8d8b0;
        }
        .mc-msg-content :global(.mc-code) {
          background: rgba(0,0,0,0.4); border: 1px solid var(--border);
          padding: 1px 5px; border-radius: 3px; font-size: 12px; color: #a8d8b0;
        }

        /* Tool calls */
        .mc-tools {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 0 4px;
        }
        .mc-tool {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          padding: 5px 10px;
          border-radius: 4px;
          border: 1px solid;
        }
        .mc-tool-running {
          border-color: rgba(249,115,22,0.3);
          background: rgba(249,115,22,0.05);
          color: #f97316;
        }
        .mc-tool-done {
          border-color: rgba(0,242,255,0.15);
          background: rgba(0,242,255,0.03);
          color: var(--dim);
        }
        .mc-tool-icon { font-size: 13px; }
        .mc-tool-name { letter-spacing: 0.5px; }
        .mc-tool-spinner { color: #f97316; display: inline-block; }
        .mc-tool-check { color: #10b981; font-size: 13px; }
        .mc-tool-result {
          margin-top: 4px;
          font-size: 10px;
          width: 100%;
        }
        .mc-tool-result summary {
          cursor: pointer;
          color: rgba(0,242,255,0.4);
          letter-spacing: 0.5px;
          user-select: none;
        }
        .mc-tool-result pre {
          margin-top: 6px;
          background: rgba(0,0,0,0.4);
          padding: 8px;
          border-radius: 3px;
          white-space: pre-wrap;
          color: #888;
          max-height: 200px;
          overflow-y: auto;
          font-size: 10px;
          line-height: 1.5;
        }

        /* Input bar */
        .mc-input-bar {
          padding: 14px 20px 20px;
          border-top: 1px solid var(--border);
          background: rgba(10, 10, 18, 0.95);
          backdrop-filter: blur(10px);
          flex-shrink: 0;
        }
        .mc-input-wrap {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          background: rgba(0,242,255,0.03);
          border: 1px solid rgba(0,242,255,0.18);
          border-radius: 6px;
          padding: 10px 12px;
          transition: border-color 0.2s;
        }
        .mc-input-wrap:focus-within { border-color: rgba(0,242,255,0.4); }
        .mc-input-busy { border-color: rgba(249,115,22,0.2) !important; }

        .mc-textarea {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.55;
          resize: none;
          min-height: 22px;
          max-height: 140px;
        }
        .mc-textarea::placeholder { color: rgba(200,216,232,0.25); }

        .mc-voice-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 6px 9px;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          flex-shrink: 0;
          transition: border-color 0.2s;
        }
        .mc-voice-btn:hover { border-color: rgba(0,242,255,0.4); }
        .mc-voice-active { border-color: #00f2ff !important; }

        .mc-send-btn {
          background: rgba(0,242,255,0.08);
          border: 1px solid rgba(0,242,255,0.25);
          color: var(--cyan);
          font-family: inherit;
          font-size: 12px;
          letter-spacing: 1px;
          padding: 8px 16px;
          border-radius: 5px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s;
          min-width: 80px;
        }
        .mc-send-btn:hover:not(:disabled) {
          background: rgba(0,242,255,0.15);
          border-color: rgba(0,242,255,0.5);
        }
        .mc-send-btn:disabled {
          opacity: 0.4;
          cursor: default;
        }
      `}</style>
    </div>
  )
}
