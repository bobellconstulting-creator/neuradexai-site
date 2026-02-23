export interface AgentConfig {
  /** Must match the agent name used in OpenClaw (e.g. `openclaw tui --agent <id>`) */
  id:          string
  label:       string
  title:       string
  specialty:   string
  description: string
  /** Primary accent color for this agent's desk */
  color:       string
  /** Subtle background tint (use rgba) */
  bgColor:     string
  icon:        string
}

export const AGENTS: AgentConfig[] = [
  {
    id:          'main',
    label:       'NEXUS',
    title:       'Chief AI Officer',
    specialty:   'Strategic Oversight',
    description: 'Primary orchestrator. Handles high-level strategy, prioritizes initiatives, and routes complex tasks to the specialist fleet.',
    color:       '#00F2FF',
    bgColor:     'rgba(0, 242, 255, 0.06)',
    icon:        '⬡',
  },
  {
    id:          'devops',
    label:       'FORGE',
    title:       'Lead DevOps Engineer',
    specialty:   'Infrastructure & Deployment',
    description: 'CI/CD pipelines, cloud infrastructure, container orchestration, system reliability, and zero-downtime deployments.',
    color:       '#22C55E',
    bgColor:     'rgba(34, 197, 94, 0.06)',
    icon:        '⚙',
  },
  {
    id:          'marketing',
    label:       'HERALD',
    title:       'Marketing Director',
    specialty:   'Growth & Brand Strategy',
    description: 'Campaign architecture, content strategy, market positioning, funnel optimization, and audience development.',
    color:       '#A78BFA',
    bgColor:     'rgba(167, 139, 250, 0.06)',
    icon:        '◈',
  },
  {
    id:          'analyst',
    label:       'ORACLE',
    title:       'Data Intelligence Analyst',
    specialty:   'Insights & Intelligence',
    description: 'Data analysis, competitive intelligence, KPI dashboards, trend identification, and strategic reporting.',
    color:       '#F59E0B',
    bgColor:     'rgba(245, 158, 11, 0.06)',
    icon:        '◎',
  },
]

export function getAgent(id: string): AgentConfig | undefined {
  return AGENTS.find((a) => a.id === id)
}
