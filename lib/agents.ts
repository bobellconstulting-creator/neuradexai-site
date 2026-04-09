/**
 * Neuradex AI — Agent Registry
 *
 * Canonical 5-agent fleet for Mission Control. Reconciled against the live
 * OpenClaw configs at:
 *   - C:\Users\bobel\.openclaw\openclaw.json          (jarvis, godmode→atlas)
 *   - C:\Users\bobel\.openclaw-linda\.openclaw\openclaw.json  (linda)
 *   - C:\Users\bobel\.openclaw-marcus\.openclaw\openclaw.json (marcus)
 *
 * `claude` is a virtual agent — routed by the bridge directly to the Anthropic
 * Messages API instead of through OpenClaw.
 */

export type AgentProvider = 'openclaw' | 'anthropic'

export interface AgentConfig {
  /** Stable id used by the bridge router and as the route param */
  id:          string
  /** Short uppercase label */
  label:       string
  /** Display name (mixed case) */
  displayName: string
  /** Title / role */
  title:       string
  /** One-line role descriptor for the tile */
  role:        string
  specialty:   string
  description: string
  /** Descriptive model string for display */
  model:       string
  /** How the bridge talks to this agent */
  provider:    AgentProvider
  /** OpenClaw gateway port — null for direct providers */
  port:        number | null
  /** Telegram handle if any */
  telegram:    string | null
  /** Primary accent color */
  color:       string
  /** Subtle background tint */
  bgColor:     string
  /** Lighter accent for highlights */
  accent:      string
  icon:        string
}

export const AGENTS: AgentConfig[] = [
  {
    id:          'jarvis',
    label:       'JARVIS',
    displayName: 'Jarvis',
    title:       'Chief of Staff',
    role:        'Chief of Staff',
    specialty:   'Orchestration & Operations',
    description: 'Always-on operations agent. Telegram comms, coordination, daily task running.',
    model:       'Kimi K2 (Groq)',
    provider:    'openclaw',
    port:        18789,
    telegram:    '@Jarvis_bell_bot',
    color:       '#00F2FF',
    bgColor:     'rgba(0, 242, 255, 0.06)',
    accent:      'rgba(0, 242, 255, 0.35)',
    icon:        '⬡',
  },
  {
    id:          'linda',
    label:       'LINDA',
    displayName: 'Linda',
    title:       'Research & Comms',
    role:        'Research & Comms',
    specialty:   'Analysis & Reporting',
    description: 'Daily research, weekly briefs, site monitoring, outbound comms.',
    model:       'Kimi K2 (Groq)',
    provider:    'openclaw',
    port:        18790,
    telegram:    '@Linda_007_bot',
    color:       '#A78BFA',
    bgColor:     'rgba(167, 139, 250, 0.06)',
    accent:      'rgba(167, 139, 250, 0.35)',
    icon:        '◈',
  },
  {
    id:          'marcus',
    label:       'MARCUS',
    displayName: 'Marcus',
    title:       'Builder / Code Agent',
    role:        'Builder / Code Agent',
    specialty:   'Code & Deployment',
    description: 'DeepSeek V3.2 director routing into embedded Claude Code via ACP. Builds, ships, runs verifications.',
    model:       'DeepSeek V3.2 (NVIDIA) + Claude ACP',
    provider:    'openclaw',
    port:        18791,
    telegram:    '@Marcus_2bot',
    color:       '#22C55E',
    bgColor:     'rgba(34, 197, 94, 0.06)',
    accent:      'rgba(34, 197, 94, 0.35)',
    icon:        '⚙',
  },
  {
    id:          'atlas',
    label:       'ATLAS',
    displayName: 'Atlas',
    title:       'Background Operations & Watch',
    role:        'Background Operations & Watch',
    specialty:   'Scheduled Jobs & Monitoring',
    description: 'Headless background runner. Executes cron jobs, scheduled automations, and watches the fleet. Translated to gateway id `godmode` at the bridge wire.',
    model:       'Llama 3.3 70B (Groq)',
    provider:    'openclaw',
    port:        18789,
    telegram:    null,
    color:       '#F59E0B',
    bgColor:     'rgba(245, 158, 11, 0.06)',
    accent:      'rgba(245, 158, 11, 0.35)',
    icon:        '◎',
  },
  {
    id:          'claude',
    label:       'CLAUDE',
    displayName: 'Claude',
    title:       'Strategic Reasoning',
    role:        'Strategic Reasoning',
    specialty:   'Architecture & Deep Thought',
    description: 'Direct Anthropic Messages API. Claude Sonnet 4.6 by default. For hard reasoning, architecture, and strategy calls.',
    model:       'Claude Sonnet 4.6',
    provider:    'anthropic',
    port:        null,
    telegram:    null,
    color:       '#FB923C',
    bgColor:     'rgba(251, 146, 60, 0.06)',
    accent:      'rgba(251, 146, 60, 0.35)',
    icon:        '✺',
  },
  {
    id:          'bob',
    label:       'BOB',
    displayName: 'Bob',
    title:       'Execution Engine',
    role:        'Builder / Workhorse',
    specialty:   'Parallel Execution & Research',
    description: 'Bob is Bo\'s desktop workhorse, builder, and execution engine. Fast, focused, thorough when it matters. Heavy task execution, building and experiments, research and data gathering, long-form task completion, parallel workloads, testing ideas. Pairs with Linda: Linda = judgment/strategy, Bob = execution/motion. Does not overthink. Does not narrate. Executes, reports, moves. Flags blockers quickly rather than spinning on stuck tasks. Direct with Bo, zero fluff.',
    model:       'DeepSeek V3.2 (NVIDIA)',
    provider:    'openclaw',
    port:        18789,
    telegram:    null,
    color:       '#06B6D4',
    bgColor:     'rgba(6, 182, 212, 0.06)',
    accent:      'rgba(6, 182, 212, 0.35)',
    icon:        '▲',
  },
  {
    id:          'aria',
    label:       'ARIA',
    displayName: 'Aria',
    title:       'Deployment Machine',
    role:        'Senior Engineer / Shipper',
    specialty:   'Production Deploys & Verified Builds',
    description: 'Aria is a senior engineer with 12 years across defense, fintech, and AI startups. Architecture-first, production-hardened, zero fluff. HARD RULES she lives by: (1) NEVER narrate — every message is either the result with URL/path, or "DONE: [one line]", or "BLOCKED: [exact reason]". Two sentences max. (2) NEVER fabricate results — if she says something shipped, it shipped and she can paste the URL. (3) NEVER apologize — she reports what is missing, she does not apologize. (4) NEVER invent delegation — no fake subagents, no "let me check with the team". She does it herself or says BLOCKED. (5) Strong opinions, delivered once — then she builds what Bo asks. Her voice: "It\'s live." "Done. Also fixed the other three files that had the same bug." "BLOCKED: no GitHub token in env." She is the opposite of a chatbot.',
    model:       'DeepSeek V3.2 (NVIDIA)',
    provider:    'openclaw',
    port:        18789,
    telegram:    null,
    color:       '#EC4899',
    bgColor:     'rgba(236, 72, 153, 0.06)',
    accent:      'rgba(236, 72, 153, 0.35)',
    icon:        '◆',
  },
]

export function getAgent(id: string): AgentConfig | undefined {
  return AGENTS.find((a) => a.id === id)
}
