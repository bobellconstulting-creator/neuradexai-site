export type AgentStatus = 'idle' | 'processing' | 'speaking' | 'alert'

export interface JarvisAgent {
  id: string
  label: string
  role: string
  clearance: string
  status: AgentStatus
}

export interface JarvisMessage {
  id: string
  agentId: string | 'broadcast'
  role: 'user' | 'agent'
  text: string
  ts: number
}

export const JARVIS_TEAM: JarvisAgent[] = [
  { id: 'jarvis',  label: 'J.A.R.V.I.S.',    role: 'Primary Intelligence',   clearance: 'OMEGA', status: 'speaking'   },
  { id: 'friday',  label: 'F.R.I.D.A.Y.',    role: 'Operations Director',    clearance: 'ALPHA', status: 'processing' },
  { id: 'edith',   label: 'E.D.I.T.H.',      role: 'Surveillance & Recon',   clearance: 'ALPHA', status: 'idle'       },
  { id: 'homer',   label: 'H.O.M.E.R.',      role: 'Architecture Systems',   clearance: 'BETA',  status: 'processing' },
  { id: 'jocasta', label: 'J.O.C.A.S.T.A.', role: 'Neural Defense Matrix',  clearance: 'ALPHA', status: 'idle'       },
  { id: 'plato',   label: 'P.L.A.T.O.',      role: 'Tactical Analytics',     clearance: 'BETA',  status: 'idle'       },
  { id: 'vita',    label: 'V.I.T.A.',         role: 'Biosynth Interface',     clearance: 'BETA',  status: 'idle'       },
]

export const JARVIS_STUBS: Record<string, string[]> = {
  jarvis: [
    'Of course. Running full diagnostics on that query now.',
    "Already on it. I've identified three optimal approaches.",
    'Understood. Cross-referencing all available intelligence vectors.',
    'My projections indicate a 94.7% probability of success.',
    'Certainly. Neural pathways reallocating to this priority.',
    "Consider it done. I'll have a full report within moments.",
  ],
  friday: [
    'On it. Operations are being redirected immediately.',
    "F.R.I.D.A.Y. here — processing that now. Stand by.",
    'Got it. Coordinating all available resources.',
    'Acknowledged. Running the numbers as we speak.',
  ],
  edith: [
    'Surveillance nets deployed. Scanning for relevant intel.',
    'Eyes everywhere. Compiling the data now.',
    'Confirmed. All tracking systems are fully active.',
    'Visual feeds online. I see everything.',
  ],
  homer: [
    'Architecture systems engaged. Rebuilding the framework.',
    'Structural analysis complete. Ready to deploy.',
    'Systems updated. New parameters integrated.',
  ],
  jocasta: [
    'Neural defense matrix online. No intrusions detected.',
    'Defensive protocols engaged. All perimeters secured.',
    'Countermeasures deployed. We are clean.',
  ],
  plato: [
    'Tactical analysis complete. Three vectors identified.',
    'Running probability matrices. Results incoming.',
    'Strategic options mapped. Awaiting your directive.',
  ],
  vita: [
    'Biosynth interface synchronized. Vitals nominal.',
    'All biological integration points confirmed stable.',
    'Bio-signature verification complete.',
  ],
}

export const BROADCAST_STUBS = [
  'All units acknowledging. Standing by for further directives.',
  'Boardroom synchronized. All agents are processing.',
  'Fleet-wide acknowledgment received. Executing protocol.',
  'All systems nominal. Awaiting next command.',
  'Every agent has confirmed receipt. Standing by.',
]
