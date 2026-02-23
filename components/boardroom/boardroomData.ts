export type AgentStatus = 'idle' | 'processing' | 'speaking'

export interface Agent {
  id: string
  label: string
  specialty: string
  status: AgentStatus
}

export interface Message {
  id: string
  agentId: string | 'all'
  role: 'user' | 'agent'
  text: string
  ts: number
}

export const AGENTS: Agent[] = [
  { id: 'nexus-1', label: 'NEXUS-1', specialty: 'Strategic Planning',  status: 'idle' },
  { id: 'nexus-2', label: 'NEXUS-2', specialty: 'Data Analysis',       status: 'processing' },
  { id: 'nexus-3', label: 'NEXUS-3', specialty: 'Market Intelligence', status: 'idle' },
  { id: 'nexus-4', label: 'NEXUS-4', specialty: 'Risk Assessment',     status: 'speaking' },
  { id: 'nexus-5', label: 'NEXUS-5', specialty: 'Operations Control',  status: 'idle' },
  { id: 'nexus-6', label: 'NEXUS-6', specialty: 'Neural Architecture', status: 'processing' },
  { id: 'nexus-7', label: 'NEXUS-7', specialty: 'Security Protocols',  status: 'idle' },
  { id: 'nexus-8', label: 'NEXUS-8', specialty: 'Swarm Coordination',  status: 'idle' },
]
