'use client'

import React from 'react'
import type { Tool } from '@/lib/buckgrid/tools'

type Props = {
  tools: Tool[]
  activeToolId: string
  brushSize: number
  onSelectTool: (t: Tool) => void
  onBrushSize: (n: number) => void
  onLockBorder: () => void
  onWipeAll: () => void
}

function ToolGrid({ tools, activeToolId, brushSize, onSelectTool, onBrushSize, onLockBorder, onWipeAll }: Props) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'rgba(237,227,197,0.64)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
          Paint Plan
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0 14px' }}>
        {tools.map(t => (
          <button
            key={t.id}
            onClick={() => onSelectTool(t)}
            style={{
              padding: '10px 8px',
              borderRadius: 12,
              border: `1px solid ${activeToolId === t.id ? `${t.color}88` : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              minHeight: 72,
              background: activeToolId === t.id
                ? `linear-gradient(180deg, ${t.color}26 0%, rgba(17,20,16,0.96) 100%)`
                : 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(14,18,15,0.94) 100%)',
              color: activeToolId === t.id ? '#f7f0de' : '#8f9684',
              transition: 'all 0.18s',
              letterSpacing: '0.08em',
              boxShadow: activeToolId === t.id ? `0 0 0 1px ${t.color}22 inset` : 'none',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(180deg, ${t.color}30 0%, rgba(17,20,16,0.1) 100%)`,
                border: `1px solid ${activeToolId === t.id ? `${t.color}66` : 'rgba(255,255,255,0.08)'}`,
                color: activeToolId === t.id ? '#fff5dc' : t.color,
                fontSize: 11,
                fontWeight: 900,
              }}
            >
              {t.badge}
            </span>
            <span style={{ color: activeToolId === t.id ? t.color : '#c7ccb9' }}>{t.name}</span>
            <span style={{ color: 'rgba(237,227,197,0.52)', fontSize: 9, letterSpacing: '0.04em', textTransform: 'none' }}>
              {t.icon}
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 14, padding: '12px 12px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, color: 'rgba(237,227,197,0.64)', marginBottom: 8, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          Brush Size
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#f7f0de', fontWeight: 700 }}>Coverage</span>
          <span style={{ fontSize: 11, color: '#d9a441', fontFamily: "'DM Mono', monospace" }}>{brushSize}px</span>
        </div>
        <input
          type="range"
          min={10}
          max={150}
          value={brushSize}
          onChange={e => onBrushSize(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#d9a441' }}
        />
      </div>

      <button
        onClick={onLockBorder}
        style={{
          width: '100%',
          background: 'linear-gradient(135deg, #d9a441 0%, #f6d58e 100%)',
          color: '#17150f',
          padding: '13px 0',
          borderRadius: 14,
          fontWeight: 900,
          cursor: 'pointer',
          border: 'none',
          fontSize: 11,
          letterSpacing: '0.18em',
          marginBottom: 8,
          textTransform: 'uppercase',
          boxShadow: '0 14px 30px rgba(217,164,65,0.24)',
        }}
      >
        Lock Border And Scan
      </button>

      <button
        onClick={onWipeAll}
        style={{
          width: '100%',
          color: 'rgba(237,227,197,0.56)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: '10px 0',
          cursor: 'pointer',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        Wipe Canvas
      </button>
    </>
  )
}

export default React.memo(ToolGrid)
