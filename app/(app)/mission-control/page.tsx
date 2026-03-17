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
  role: 'user' | 'agent' | 'system'
  agentId?: string
  content: string
  streaming?: boolean
  toolCalls?: ToolCall[]
}

type AgentStatus = 'idle' | 'thinking' | 'working' | 'responding'

interface Agent {
  id: string
  label: string
  role: string
  clearance: string
  status: AgentStatus
  color: string
}

const AGENTS: Agent[] = [
  { id: 'axon',  label: 'AXON',  role: 'Builder-Operator',   clearance: 'OMEGA', status: 'idle', color: '#00D4FF' },
  { id: 'aria',  label: 'ARIA',  role: 'Strategic Partner',  clearance: 'ALPHA', status: 'idle', color: '#FF8C00' },
  { id: 'bo',    label: 'BO',    role: 'Command',            clearance: 'OMEGA', status: 'idle', color: '#22C55E' },
]

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
  exec:                '⚡',
  read:                '📖',
  write:               '✏️',
  edit:                '🔧',
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

function statusLabel(status: AgentStatus, activeTool?: string, agent?: Agent): string {
  if (!agent) return 'MISSION CONTROL — READY'
  if (status === 'thinking')   return `${agent.label} IS THINKING...`
  if (status === 'working')    return activeTool ? `${agent.label} → ${activeTool.replace(/_/g, ' ').toUpperCase()}` : `${agent.label} IS WORKING...`
  if (status === 'responding') return `${agent.label} IS RESPONDING...`
  return 'MISSION CONTROL — READY'
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MissionControl() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'boot',
      role: 'system',
      content: 'OPENCLAW MISSION CONTROL — ONLINE\nAxon standing by. Aria idle. All systems nominal.\nIssue a directive to begin.',
    },
  ])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [activeTool, setActiveTool] = useState<string | undefined>()
  const [activeAgent, setActiveAgent] = useState<Agent>(AGENTS[0])
  const [chatMode, setChatMode] = useState<'broadcast' | 'private'>('broadcast')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
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

    const targetAgent = chatMode === 'private' && selectedAgentId 
      ? AGENTS.find(a => a.id === selectedAgentId) || AGENTS[0]
      : AGENTS[0] // Default to Axon for broadcast

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      agentId: targetAgent.id,
      content: text.trim(),
    }

    const agentMsgId = (Date.now() + 1).toString()
    const agentMsg: Message = {
      id: agentMsgId,
      role: 'agent',
      agentId: targetAgent.id,
      content: '',
      streaming: true,
      toolCalls: [],
    }

    setMessages((prev) => [...prev, userMsg, agentMsg])
    setInput('')
    setStatus('thinking')
    setActiveAgent(targetAgent)

    // Build history for API
    const history = [...messages, userMsg]
      .filter((m) => m.role === 'user' || m.role === 'agent')
      .map((m) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
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
                  m.id === agentMsgId ? { ...m, content: m.content + (evt.content ?? '') } : m
                )
              )
              break

            case 'done':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId ? { ...m, streaming: false } : m
                )
              )
              setStatus('idle')
              setActiveTool(undefined)
              break

            case 'error':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
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
          m.id === agentMsgId
            ? { ...m, content: `⚠️ Connection error: ${err}`, streaming: false }
            : m
        )
      )
      setStatus('idle')
      setActiveTool(undefined)
    }
  }, [messages, status, chatMode, selectedAgentId])

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
        content: 'MISSION CONTROL — CLEARED\nNew session started.',
      },
    ])
  }

  // ── Agent selection ─────────────────────────────────────────────────────────

  const handleSelectAgent = (agentId: string) => {
    if (agentId === selectedAgentId) {
      setSelectedAgentId(null)
      setChatMode('broadcast')
    } else {
      setSelectedAgentId(agentId)
      setChatMode('private')
    }
  }

  const selectedAgent = AGENTS.find(a => a.id === selectedAgentId) || null

  // ── Render ──────────────────────────────────────────────────────────────────

  const busy = status !== 'idle'

  return (
    <div className="mc-root">
      {/* ── Scanline overlay ── */}
      <div className="mc-scanlines" aria-hidden />

      {/* ── HUD Corner Brackets ── */}
      <div className="mc-corner mc-corner-tl" />
      <div className="mc-corner mc-corner-tr" />
      <div className="mc-corner mc-corner-bl" />
      <div className="mc-corner mc-corner-br" />

      {/* ── Top status bar ── */}
      <header className="mc-header">
        <div className="mc-header-left">
          <span className="mc-logo">⬡ OPENCLAW</span>
          <span className="mc-divider">│</span>
          <span className="mc-subtitle">MISSION CONTROL v1.0</span>
        </div>
        <div className="mc-header-center">
          <motion.div
            className="mc-status-dot"
            animate={{ opacity: busy ? [1, 0.2, 1] : 1 }}
            transition={{ repeat: busy ? Infinity : 0, duration: 0.8 }}
            style={{ backgroundColor: busy ? activeAgent.color : '#00f2ff' }}
          />
          <motion.span
            key={statusLabel(status, activeTool, activeAgent)}
            className="mc-status-text"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {statusLabel(status, activeTool, activeAgent)}
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

      {/* ── Agent Manifest Panel ── */}
      <div className="mc-agent-panel">
        <div className="mc-agent-header">AGENT MANIFEST</div>
        <div className="mc-agent-list">
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              className={`mc-agent-row ${selectedAgentId === agent.id ? 'mc-agent-selected' : ''}`}
              onClick={() => handleSelectAgent(agent.id)}
            >
              <div 
                className="mc-agent-dot" 
                style={{ 
                  background: agent.color,
                  boxShadow: agent.id === activeAgent.id && busy ? `0 0 8px ${agent.color}` : 'none'
                }} 
              />
              <div className="mc-agent-info">
                <div className="mc-agent-label">{agent.label}</div>
                <div className="mc-agent-role">{agent.role}</div>
              </div>
              <div className="mc-agent-clearance">{agent.clearance}</div>
              <div 
                className="mc-agent-status"
                style={{ color: agent.id === activeAgent.id && busy ? agent.color : 'rgba(200,216,232,0.4)' }}
              >
                {agent.id === activeAgent.id && busy ? 'ACTIVE' : 'IDLE'}
              </div>
            </button>
          ))}
        </div>
        
        {/* Mode toggle */}
        <div className="mc-mode-toggle">
          <button
            onClick={() => setChatMode('broadcast')}
            className={chatMode === 'broadcast' ? 'mc-mode-active' : ''}
          >
            ⬡ BROADCAST ALL
          </button>
          <button
            onClick={() => selectedAgentId && setChatMode('private')}
            className={chatMode === 'private' ? 'mc-mode-active' : ''}
            disabled={!selectedAgentId}
          >
            ⬡ PRIVATE: {selectedAgent?.label || 'NONE'}
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <main className="mc-messages" role="log" aria-live="polite">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const agent = AGENTS.find(a => a.id === msg.agentId)
            return (
              <motion.div
                key={msg.id}
                className={`mc-msg mc-msg-${msg.role}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Role label */}
                {msg.role !== 'system' && (
                  <div className="mc-msg-label" style={{ color: agent?.color || '#00f2ff' }}>
                    {msg.role === 'user' ? '⬡ YOU' : `⬡ ${agent?.label || 'AGENT'}`}
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
                    style={{ color: agent?.color || '#00f2ff' }}
                  >
                    ▋
                  </motion.span>
                )}
              </motion.div>
            )
          })}
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
            placeholder={busy ? `${activeAgent.label} is working...` : `Issue a directive${chatMode === 'private' && selectedAgent ? ` to ${selectedAgent.label}` : ''}...`}
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
            style={{ 
              background: activeAgent.color + '14',
              borderColor: activeAgent.color + '40',
              color: activeAgent.color 
            }}
          >
            {busy ? (
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                ◌
              </motion.span>
            ) : (
              'TRANSMIT ▶'
            )}
          </motion.button>
        </div>
      </footer>

      {/* ── Styles ── */}
      <style>{`
        :root {
          --cyan:    #00D4FF;
          --orange:  #FF8C00;
          --green:   #22C55E;
          --black:   #000810;
          --surface: #0a0a18;
          --border:  rgba(0, 212, 255, 0.12);
          --text:    #c8d8e8;
          --dim:     rgba(200, 216, 232, 0.45);
        }

        .mc-root {
          display: grid;
          grid-template-areas:
            "header header"
            "panel  messages"
            "panel  input";
          grid-template-columns: 280px 1fr;
          grid-template-rows: auto 1fr auto;
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
          z-index: 100;
        }

        /* Corner brackets */
        .mc-corner {
          position: fixed;
          width: 40px;
          height: 40px;
          pointer-events: none;
          z-index: 50;
        }
        .mc-corner-tl { top: 10px; left: 10px; border-top: 2px solid rgba(0,212,255,0.5); border-left: 2px solid rgba(0,212,255,0.5); }
        .mc-corner-tr { top: 10px; right: 10px; border-top: 2px solid rgba(0,212,255,0.5); border-right: 2px solid rgba(0,212,255,0.5); }
        .mc-corner-bl { bottom: 10px; left: 10px; border-bottom: 2px solid rgba(0,212,255,0.5); border-left: 2px solid rgba(0,212,255,0.5); }
        .mc-corner-br { bottom: 10px; right: 10px; border-bottom: 2px solid rgba(0,212,255,0.5); border-right: 2px solid rgba(0,212,255,0.5); }

        /* Header */
        .mc-header {
          grid-area: header;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 20px;
          border-bottom: 1px solid var(--border);
          background: rgba(0, 8, 16, 0.95);
          backdrop-filter: blur(10px);
          z-index: 5;
        }
        .mc-header-left { display: flex; align-items: center; gap: 10px; }
        .mc-logo { color: var(--cyan); font-size: 16px; font-weight: 700; letter-spacing: 2px; }
        .mc-divider { color: var(--border); }
        .mc-subtitle { color: var(--dim); font-size: 11px; letter-spacing: 3px; }
        .mc-header-center {
          display: flex; align-items: center; gap: 8px;
          background: rgba(0,212,255,0.04);
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

        /* Agent panel */
        .mc-agent-panel {
          grid-area: panel;
          background: rgba(0, 8, 16, 0.7);
          border-right: 1px solid var(--border);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .mc-agent-header {
          font-size: 10px;
          letter-spacing: 3px;
          color: rgba(0,212,255,0.4);
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
        }
        .mc-agent-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .mc-agent-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: rgba(0,20,40,0.4);
          border: 1px solid transparent;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .mc-agent-row:hover { border-color: rgba(0,212,255,0.2); }
        .mc-agent-selected { 
          border-color: var(--orange) !important; 
          background: rgba(255,140,0,0.08) !important;
        }
        .mc-agent-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .mc-agent-info { flex: 1; }
        .mc-agent-label { font-size: 12px; font-weight: 600; letter-spacing: 1px; color: var(--text); }
        .mc-agent-role { font-size: 9px; color: var(--dim); letter-spacing: 0.5px; }
        .mc-agent-clearance { 
          font-size: 9px; 
          color: rgba(0,212,255,0.4); 
          border: 1px solid rgba(0,212,255,0.2);
          padding: 2px 5px;
          border-radius: 2px;
        }
        .mc-agent-status { font-size: 9px; letter-spacing: 0.5px; }

        /* Mode toggle */
        .mc-mode-toggle {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .mc-mode-toggle button {
          background: rgba(0,20,40,0.4);
          border: 1px solid var(--border);
          color: var(--dim);
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 1px;
          padding: 8px;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mc-mode-toggle button:hover:not(:disabled) { border-color: rgba(0,212,255,0.3); }
        .mc-mode-toggle button:disabled { opacity: 0.3; cursor: not-allowed; }
        .mc-mode-active {
          border-color: var(--orange) !important;
          color: var(--orange) !important;
          background: rgba(255,140,0,0.1) !important;
        }

        /* Messages */
        .mc-messages {
          grid-area: messages;
          overflow-y: auto;
          padding: 24px 28px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          scrollbar-width: thin;
          scrollbar-color: rgba(0,212,255,0.2) transparent;
        }
        .mc-messages::-webkit-scrollbar { width: 4px; }
        .mc-messages::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); border-radius: 2px; }

        /* Message bubbles */
        .mc-msg { max-width: 90%; display: flex; flex-direction: column; gap: 6px; }
        .mc-msg-user { align-self: flex-end; align-items: flex-end; }
        .mc-msg-agent { align-self: flex-start; align-items: flex-start; }
        .mc-msg-system { align-self: center; align-items: center; }

        .mc-msg-label {
          font-size: 10px; letter-spacing: 2px;
          padding: 0 4px;
        }

        .mc-msg-content {
          padding: 12px 16px;
          border-radius: 6px;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .mc-msg-user .mc-msg-content {
          background: rgba(0, 212, 255, 0.07);
          border: 1px solid rgba(0, 212, 255, 0.2);
          color: #e0f4ff;
        }
        .mc-msg-agent .mc-msg-content {
          background: rgba(255, 140, 0, 0.05);
          border: 1px solid rgba(255, 140, 0, 0.15);
          color: var(--text);
        }
        .mc-msg-system .mc-msg-content {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(0,212,255,0.08);
          color: rgba(0,212,255,0.5);
          font-size: 12px;
          letter-spacing: 0.5px;
          text-align: center;
        }

        /* Streaming cursor */
        .mc-cursor {
          display: inline-block;
          font-size: 16px;
          line-height: 1;
          margin-left: 2px;
        }

        /* Markdown styles */
        .mc-msg-content :global(.mc-h1) { font-size: 18px; font-weight: 700; color: var(--cyan); margin: 8px 0 4px; }
        .mc-msg-content :global(.mc-h2) { font-size: 15px; font-weight: 600; color: var(--cyan); margin: 6px 0 3px; }
        .mc-msg-content :global(.mc-h3) { font-size: 13px; font-weight: 600; color: rgba(0,212,255,0.75); margin: 4px 0 2px; }
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
          border-color: rgba(0,212,255,0.15);
          background: rgba(0,212,255,0.03);
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
          color: rgba(0,212,255,0.4);
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
          grid-area: input;
          padding: 14px 20px 20px;
          border-top: 1px solid var(--border);
          background: rgba(0, 8, 16, 0.95);
          backdrop-filter: blur(10px);
        }
        .mc-input-wrap {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          background: rgba(0,212,255,0.03);
          border: 1px solid rgba(0,212,255,0.18);
          border-radius: 6px;
          padding: 10px 12px;
          transition: border-color 0.2s;
        }
        .mc-input-wrap:focus-within { border-color: rgba(0,212,255,0.4); }
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
        .mc-voice-btn:hover { border-color: rgba(0,212,255,0.4); }
        .mc-voice-active { border-color: #00f2ff !important; }

        .mc-send-btn {
          background: rgba(0,212,255,0.08);
          border: 1px solid rgba(0,212,255,0.25);
          font-family: inherit;
          font-size: 12px;
          letter-spacing: 1px;
          padding: 8px 16px;
          border-radius: 5px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s;
          min-width: 100px;
        }
        .mc-send-btn:hover:not(:disabled) {
          opacity: 0.8;
        }
        .mc-send-btn:disabled {
          opacity: 0.4;
          cursor: default;
        }
      `}</style>
    </div>
  )
}
