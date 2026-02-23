// ── Messages: Browser → Bridge ────────────────────────────────────────────────
export type ClientMessage =
  | { type: 'msg';       agentId: string; content: string }
  | { type: 'interrupt'; agentId: string }
  | { type: 'ping' }

// ── Messages: Bridge → Browser ────────────────────────────────────────────────
export type ServerMessage =
  | { type: 'token';     agentId: string; content: string }
  | { type: 'done';      agentId: string }
  | { type: 'status';    agentId: string; status: 'idle' | 'thinking' | 'responding' }
  | { type: 'error';     agentId: string; message: string }
  | { type: 'connected'; agentId: string }
  | { type: 'pong' }
