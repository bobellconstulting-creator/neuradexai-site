'use client'

import React, { useState, useEffect, useRef } from 'react'

const C = {
  bg: '#020818', surface: '#040f2a',
  cyan: '#00d4ff', violet: '#7b5cf0', amber: '#f97316', emerald: '#10b981', red: '#ef4444',
  text: '#e2f4ff', muted: '#4a7fa5', border: 'rgba(0,212,255,0.15)', borderDim: 'rgba(0,212,255,0.08)',
}

const glass: React.CSSProperties = {
  background: 'rgba(4,15,42,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(0,212,255,0.12)', borderRadius: 12,
  boxShadow: '0 0 30px rgba(0,212,255,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
}

const AGENTS = [
  { id: 'ALPHA',   status: 'active',     color: '#00d4ff', delay: '0s'   },
  { id: 'BETA',    status: 'active',     color: '#00d4ff', delay: '0.5s' },
  { id: 'GAMMA',   status: 'active',     color: '#00d4ff', delay: '1.0s' },
  { id: 'DELTA',   status: 'processing', color: '#7b5cf0', delay: '1.5s' },
  { id: 'EPSILON', status: 'processing', color: '#7b5cf0', delay: '2.0s' },
  { id: 'ZETA',    status: 'warning',    color: '#f97316', delay: '2.5s' },
  { id: 'ETA',     status: 'idle',       color: '#10b981', delay: '3.0s' },
  { id: 'THETA',   status: 'idle',       color: '#10b981', delay: '3.5s' },
]

const FEED_ACTIONS: Record<string, string[]> = {
  ALPHA:   ['Market scan complete', 'Pattern match confirmed', 'Data stream processed', 'Uplink synchronized'],
  BETA:    ['Neural pathway optimized', 'Resource allocation adjusted', 'Query batch complete'],
  GAMMA:   ['Threat assessment updated', 'Signal decoded', 'Protocol delta executed'],
  DELTA:   ['Deep analysis running', 'Compression cycle active', 'Model update 67%'],
  EPSILON: ['Processing batch #4471', 'Neural loop active', 'Inference running'],
  ZETA:    ['⚠ Anomaly in sector 7', '⚠ Threshold exceeded', '⚠ Calibration required'],
  ETA:     ['Standby — queue empty', 'Health check passed', 'Environment nominal'],
  THETA:   ['Watchdog active', 'Monitoring passive', 'Ready for dispatch'],
}

const PRIORITY_TASKS = [
  { label: 'Neural pathway recalibration', priority: 'CRITICAL', color: '#f97316' },
  { label: 'Market data stream analysis',  priority: 'HIGH',     color: '#7b5cf0' },
  { label: 'Agent health diagnostics',     priority: 'NORMAL',   color: '#10b981' },
]

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview',   icon: '◈' },
  { id: 'agents',   label: 'Agents',     icon: '⬡' },
  { id: 'neural',   label: 'Neural Map', icon: '◎' },
  { id: 'markets',  label: 'Markets',    icon: '↗' },
  { id: 'settings', label: 'Settings',   icon: '⚙' },
]

function agentPos(i: number, cx: number, cy: number, r: number) {
  const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function genData() {
  return Array.from({ length: 20 }, (_, i) => ({
    t: i,
    neural:  Math.round(55 + Math.random() * 40),
    quantum: Math.round(40 + Math.random() * 45),
  }))
}

function useCountUp(target: number, duration = 1600) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const tick = setInterval(() => {
      const p = Math.min((Date.now() - start) / duration, 1)
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p >= 1) clearInterval(tick)
    }, 16)
    return () => clearInterval(tick)
  }, [target, duration])
  return val
}

// Pure SVG area chart — no dependencies
function SvgAreaChart({ data, w = 276, h = 76 }: { data: { neural: number; quantum: number }[]; w?: number; h?: number }) {
  const pad = 2
  const minV = 0, maxV = 100
  const toX = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2)
  const toY = (v: number) => h - pad - ((v - minV) / (maxV - minV)) * (h - pad * 2)

  const line = (key: 'neural' | 'quantum') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(' ')

  const area = (key: 'neural' | 'quantum') => {
    const pts = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(' L')
    return `M${toX(0).toFixed(1)},${h} L${pts} L${toX(data.length - 1).toFixed(1)},${h} Z`
  }

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.cyan}   stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.cyan}   stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gQ" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.violet} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.violet} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area('quantum')} fill="url(#gQ)" />
      <path d={area('neural')}  fill="url(#gN)" />
      <path d={line('quantum')} fill="none" stroke={C.violet} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={line('neural')}  fill="none" stroke={C.cyan}   strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function StyleSheet() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;900&display=swap');
      .nd { font-family: 'Space Grotesk', sans-serif; }
      .nd-scroll::-webkit-scrollbar { width: 3px; }
      .nd-scroll::-webkit-scrollbar-track { background: transparent; }
      .nd-scroll::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.25); border-radius: 2px; }
      @keyframes nd-pulse  { 0%,100%{transform:scale(1);opacity:.85} 50%{transform:scale(1.07);opacity:1} }
      @keyframes nd-rotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes nd-dash   { to{stroke-dashoffset:-60} }
      @keyframes nd-slide  { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
      @keyframes nd-blink  { 0%,100%{opacity:1} 50%{opacity:.15} }
      @keyframes nd-ping   { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.1);opacity:0} }
      @keyframes nd-rot2   { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
      .nd-node  { animation: nd-pulse 3s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
      .nd-dash  { animation: nd-dash 2s linear infinite; }
      .nd-blink { animation: nd-blink 1.5s ease-in-out infinite; }
      .nd-ping  { animation: nd-ping 2s ease-out infinite; transform-box:fill-box; transform-origin:center; }
      .nd-slide { animation: nd-slide 0.3s ease-out; }
      .nd-rot1  { animation: nd-rotate 20s linear infinite; transform-origin: 0 0; }
      .nd-rot2  { animation: nd-rot2 35s linear infinite; transform-origin: 0 0; }
      .nd-panel { position: relative; }
      .nd-panel::before,.nd-panel::after {
        content:''; position:absolute; width:10px; height:10px;
        border-color:rgba(0,212,255,0.45); border-style:solid; z-index:2; pointer-events:none;
      }
      .nd-panel::before { top:-1px; left:-1px; border-width:2px 0 0 2px; }
      .nd-panel::after  { top:-1px; right:-1px; border-width:2px 2px 0 0; }
      .nd-scanline::after {
        content:''; position:absolute; inset:0; pointer-events:none; z-index:1;
        background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px);
      }
      .nd-hl { height:1px; background-image:linear-gradient(90deg,transparent,rgba(0,212,255,0.5),transparent); flex-shrink:0; }
    `}</style>
  )
}

function Sidebar({ active, setActive }: { active: string; setActive: (id: string) => void }) {
  return (
    <div style={{ width:220, minWidth:220, height:'100vh', background:C.surface, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'22px 20px 18px', borderBottom:`1px solid ${C.borderDim}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:8, background:'rgba(0,212,255,0.08)', border:'1px solid rgba(0,212,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px rgba(0,212,255,0.2)' }}>
            <span style={{ fontFamily:'Orbitron', fontSize:17, fontWeight:900, color:C.cyan }}>N</span>
          </div>
          <div>
            <div style={{ fontFamily:'Space Grotesk', fontSize:14, fontWeight:700, color:C.text, letterSpacing:'0.04em' }}>Neuradex<span style={{ color:C.cyan }}>AI</span></div>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.18em', textTransform:'uppercase', marginTop:2 }}>Command Intelligence</div>
          </div>
        </div>
      </div>
      <nav style={{ flex:1, padding:'10px 0' }}>
        {NAV_ITEMS.map(item => {
          const on = active === item.id
          return (
            <button key={item.id} onClick={() => setActive(item.id)} style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'11px 20px', background:on?'rgba(0,212,255,0.06)':'transparent', borderLeft:`2px solid ${on?C.cyan:'transparent'}`, border:'none', cursor:'pointer', textAlign:'left', transition:'all 0.2s' }}>
              <span style={{ fontSize:14, color:on?C.cyan:C.muted, width:16, textAlign:'center' }}>{item.icon}</span>
              <span style={{ fontFamily:'Space Grotesk', fontSize:13, fontWeight:on?600:400, color:on?C.text:C.muted, letterSpacing:'0.02em', flex:1 }}>{item.label}</span>
              {on && <div className="nd-blink" style={{ width:4, height:4, borderRadius:'50%', background:C.cyan }} />}
            </button>
          )
        })}
      </nav>
      <div style={{ padding:'14px 20px', borderTop:`1px solid ${C.borderDim}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(0,212,255,0.1)', border:'1px solid rgba(0,212,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:13, color:C.cyan, fontWeight:700, fontFamily:'Orbitron' }}>B</span>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:C.text }}>Commander</div>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
              <div className="nd-blink" style={{ width:5, height:5, borderRadius:'50%', background:C.emerald }} />
              <span style={{ fontSize:9, color:C.muted, letterSpacing:'0.12em', textTransform:'uppercase' }}>Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentNetwork() {
  const cx=240, cy=225, r=155, nodeR=20
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', minHeight:0 }}>
      <svg viewBox="0 0 480 450" style={{ width:'100%', maxWidth:480, height:'auto' }}>
        <circle cx={cx} cy={cy} r={r+30} fill="none" stroke="rgba(0,212,255,0.02)" strokeWidth={55} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,212,255,0.07)" strokeWidth={1} strokeDasharray="3 8" />
        <g transform={`translate(${cx},${cy})`}>
          <g className="nd-rot1"><circle cx={0} cy={0} r={r+10} fill="none" stroke="rgba(0,212,255,0.2)" strokeWidth={0.75} strokeDasharray="18 28" /></g>
        </g>
        <g transform={`translate(${cx},${cy})`}>
          <g className="nd-rot2"><circle cx={0} cy={0} r={r+22} fill="none" stroke="rgba(123,92,240,0.12)" strokeWidth={0.5} strokeDasharray="8 40" /></g>
        </g>
        {AGENTS.map((agent, i) => {
          const pos = agentPos(i, cx, cy, r)
          return (
            <line key={`ln-${i}`} x1={cx} y1={cy} x2={pos.x} y2={pos.y}
              stroke={agent.color} strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray="6 5"
              className="nd-dash" style={{ animationDelay:agent.delay, animationDuration:`${2+i*0.18}s` }} />
          )
        })}
        <g>
          <circle cx={cx} cy={cy} r={56} fill="rgba(0,212,255,0.02)" stroke="rgba(0,212,255,0.06)" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={45} fill="none" stroke="rgba(0,212,255,0.12)" strokeWidth={1} className="nd-ping" />
          <circle cx={cx} cy={cy} r={40} fill="rgba(0,212,255,0.06)" stroke="rgba(0,212,255,0.28)" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={28} fill="rgba(0,212,255,0.09)" />
          <text x={cx} y={cy-4} textAnchor="middle" fill="#00d4ff" fontSize="9" fontFamily="Orbitron" fontWeight="700" letterSpacing="3">CORE</text>
          <text x={cx} y={cy+10} textAnchor="middle" fill="#4a7fa5" fontSize="7.5" fontFamily="Space Grotesk">247 tasks</text>
        </g>
        {AGENTS.map((agent, i) => {
          const pos = agentPos(i, cx, cy, r)
          const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
          const lDist = nodeR + 15
          const lx = pos.x + lDist * Math.cos(angle)
          const ly = pos.y + lDist * Math.sin(angle)
          return (
            <g key={agent.id}>
              <circle cx={pos.x} cy={pos.y} r={nodeR+8} fill={`${agent.color}06`} stroke={`${agent.color}15`} strokeWidth={1} />
              <circle cx={pos.x} cy={pos.y} r={nodeR} fill={`${agent.color}0d`} stroke={agent.color} strokeWidth={1.5} className="nd-node" style={{ animationDelay:agent.delay }} />
              <text x={pos.x} y={pos.y+3} textAnchor="middle" fill={agent.color} fontSize="7" fontFamily="Orbitron" fontWeight="700" letterSpacing="1">{agent.id}</text>
              <text x={lx} y={ly+3} textAnchor="middle" fill="#4a7fa5" fontSize="7" fontFamily="Space Grotesk" letterSpacing="1">{agent.status.toUpperCase()}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function MetricCards() {
  const agents = useCountUp(8), tasks = useCountUp(247), eff = useCountUp(947)
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, flexShrink:0 }}>
      <div className="nd-panel" style={{ ...glass, padding:'14px 16px' }}>
        <div className="nd-hl" style={{ marginBottom:10 }} />
        <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.22em', textTransform:'uppercase', marginBottom:6 }}>Active Agents</div>
        <div style={{ fontFamily:'Orbitron', fontSize:28, fontWeight:700, color:C.cyan, letterSpacing:'0.04em' }}>{agents} <span style={{ fontSize:14, color:C.muted }}>/ 12</span></div>
        <div style={{ fontSize:10, color:C.emerald, marginTop:4, fontWeight:500 }}>↑ +2 this cycle</div>
      </div>
      <div className="nd-panel" style={{ ...glass, padding:'14px 16px' }}>
        <div className="nd-hl" style={{ marginBottom:10 }} />
        <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.22em', textTransform:'uppercase', marginBottom:6 }}>Tasks Queued</div>
        <div style={{ fontFamily:'Orbitron', fontSize:28, fontWeight:700, color:C.violet, letterSpacing:'0.04em' }}>{tasks}</div>
        <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:4 }}>
          <div className="nd-blink" style={{ width:5, height:5, borderRadius:'50%', background:C.amber }} />
          <span style={{ fontSize:9, color:C.amber, letterSpacing:'0.15em', textTransform:'uppercase', fontWeight:600 }}>Live</span>
        </div>
      </div>
      <div className="nd-panel" style={{ ...glass, padding:'14px 16px' }}>
        <div className="nd-hl" style={{ marginBottom:10 }} />
        <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.22em', textTransform:'uppercase', marginBottom:6 }}>Neural Efficiency</div>
        <div style={{ fontFamily:'Orbitron', fontSize:28, fontWeight:700, color:C.cyan, letterSpacing:'0.04em' }}>{(eff/10).toFixed(1)}<span style={{ fontSize:16, color:C.muted }}>%</span></div>
        <div style={{ height:3, background:'rgba(0,212,255,0.1)', borderRadius:2, marginTop:6, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${eff/10}%`, background:`linear-gradient(90deg,${C.cyan},${C.violet})`, borderRadius:2, transition:'width 1.6s ease-out', boxShadow:`0 0 8px ${C.cyan}60` }} />
        </div>
      </div>
    </div>
  )
}

interface FeedEntry { id: number; agent: typeof AGENTS[0]; action: string; time: string }

function LiveFeed() {
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id = 0
    const add = () => {
      const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)]
      const acts = FEED_ACTIONS[agent.id]
      setEntries(p => [...p.slice(-35), { id: id++, agent, action: acts[Math.floor(Math.random()*acts.length)], time: ts() }])
    }
    add()
    const t = setInterval(add, 2500)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [entries])
  return (
    <div ref={ref} className="nd-scroll" style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:3, padding:'2px 0' }}>
      {entries.map(e => (
        <div key={e.id} className="nd-slide" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, padding:'6px 10px', borderRadius:6, background:`${e.agent.color}07`, borderLeft:`2px solid ${e.agent.color}45` }}>
          <div style={{ flex:1, minWidth:0 }}>
            <span style={{ fontFamily:'Orbitron', fontSize:8, fontWeight:700, color:e.agent.color, letterSpacing:'0.15em' }}>{e.agent.id}</span>
            <span style={{ fontSize:10, color:C.muted, margin:'0 5px' }}>→</span>
            <span style={{ fontSize:11, color:C.text }}>{e.action}</span>
          </div>
          <span style={{ fontFamily:'monospace', fontSize:9, color:C.muted, whiteSpace:'nowrap', marginTop:1 }}>{e.time}</span>
        </div>
      ))}
    </div>
  )
}

function SignalChart() {
  const [data, setData] = useState(genData)
  useEffect(() => {
    const t = setInterval(() => {
      setData(p => {
        const last = p[p.length - 1]
        return [...p.slice(1), { t: last.t + 1, neural: Math.round(55 + Math.random() * 40), quantum: Math.round(40 + Math.random() * 45) }]
      })
    }, 2000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="nd-panel" style={{ ...glass, padding:'14px 16px', flexShrink:0 }}>
      <div className="nd-hl" style={{ marginBottom:10 }} />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:9, color:C.muted, letterSpacing:'0.22em', textTransform:'uppercase' }}>Signal Intelligence</span>
        <div style={{ display:'flex', gap:12 }}>
          {[{label:'Neural',color:C.cyan},{label:'Quantum',color:C.violet}].map(l => (
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:10, height:2, background:l.color, borderRadius:1 }} />
              <span style={{ fontSize:8.5, color:C.muted, letterSpacing:'0.12em', textTransform:'uppercase' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <SvgAreaChart data={data} />
    </div>
  )
}

function PriorityTasks() {
  return (
    <div className="nd-panel" style={{ ...glass, padding:'14px 16px', flexShrink:0 }}>
      <div className="nd-hl" style={{ marginBottom:10 }} />
      <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.22em', textTransform:'uppercase', marginBottom:10 }}>Top Task Priority</div>
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {PRIORITY_TASKS.map(task => (
          <div key={task.label} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:6, background:`${task.color}07`, border:`1px solid ${task.color}20` }}>
            <span style={{ fontSize:7.5, fontWeight:700, color:task.color, background:`${task.color}15`, padding:'2px 6px', borderRadius:3, letterSpacing:'0.12em', textTransform:'uppercase', whiteSpace:'nowrap', border:`1px solid ${task.color}30` }}>{task.priority}</span>
            <span style={{ fontSize:11, color:C.text }}>{task.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MainPanel() {
  const [time, setTime] = useState(ts)
  useEffect(() => { const t = setInterval(() => setTime(ts()), 1000); return () => clearInterval(t) }, [])
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', height:'100vh', padding:14, gap:12, minWidth:0, overflow:'hidden' }}>
      <div className="nd-panel" style={{ ...glass, padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, position:'relative' }}>
        <div className="nd-hl" style={{ position:'absolute', top:0, left:0, right:0, borderRadius:'12px 12px 0 0' }} />
        <div>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.22em', textTransform:'uppercase', marginBottom:3 }}>Neuradex AI</div>
          <div style={{ fontFamily:'Orbitron', fontSize:14, fontWeight:700, color:C.text, letterSpacing:'0.06em' }}>Agent Orchestration Center</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6 }}>
            <div className="nd-blink" style={{ width:5, height:5, borderRadius:'50%', background:C.red }} />
            <span style={{ fontFamily:'Orbitron', fontSize:9, fontWeight:700, color:C.red, letterSpacing:'0.28em' }}>LIVE</span>
          </div>
          <span style={{ fontFamily:'monospace', fontSize:13, color:C.muted }}>{time}</span>
        </div>
      </div>
      <div className="nd-panel nd-scanline" style={{ ...glass, flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden', position:'relative' }}>
        <div className="nd-hl" />
        <div style={{ padding:'10px 16px 4px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, position:'relative', zIndex:2 }}>
          <span style={{ fontSize:9, color:C.muted, letterSpacing:'0.22em', textTransform:'uppercase' }}>Agent Network</span>
          <div style={{ display:'flex', gap:14 }}>
            {[{label:'Active',color:C.cyan},{label:'Processing',color:C.violet},{label:'Warning',color:C.amber},{label:'Idle',color:C.emerald}].map(s => (
              <div key={s.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:s.color }} />
                <span style={{ fontSize:8.5, color:C.muted, letterSpacing:'0.1em', textTransform:'uppercase' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex:1, minHeight:0, position:'relative', zIndex:2, display:'flex', flexDirection:'column' }}>
          <AgentNetwork />
        </div>
      </div>
      <MetricCards />
    </div>
  )
}

function RightPanel() {
  return (
    <div style={{ width:308, minWidth:308, height:'100vh', display:'flex', flexDirection:'column', gap:12, padding:14, borderLeft:`1px solid ${C.border}`, overflow:'hidden' }}>
      <div className="nd-panel" style={{ ...glass, flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>
        <div className="nd-hl" />
        <div style={{ padding:'12px 14px 8px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span style={{ fontSize:9, color:C.muted, letterSpacing:'0.22em', textTransform:'uppercase' }}>Live Agent Feed</span>
          <div className="nd-blink" style={{ width:5, height:5, borderRadius:'50%', background:C.cyan }} />
        </div>
        <div style={{ flex:1, overflow:'hidden', padding:'0 14px 12px' }}>
          <LiveFeed />
        </div>
      </div>
      <SignalChart />
      <PriorityTasks />
    </div>
  )
}

export default function OrchestrationDashboard() {
  const [activeNav, setActiveNav] = useState('overview')
  return (
    <div className="nd" style={{ display:'flex', width:'100vw', height:'100vh', background:C.bg, overflow:'hidden', position:'relative' }}>
      <StyleSheet />
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0, backgroundImage:'radial-gradient(rgba(0,212,255,0.06) 1px,transparent 1px)', backgroundSize:'30px 30px' }} />
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0, background:'radial-gradient(ellipse 80% 80% at 50% 50%,rgba(0,212,255,0.02) 0%,transparent 70%)' }} />
      <div style={{ position:'relative', zIndex:1, display:'flex', width:'100%', height:'100%' }}>
        <Sidebar active={activeNav} setActive={setActiveNav} />
        <MainPanel />
        <RightPanel />
      </div>
    </div>
  )
}
