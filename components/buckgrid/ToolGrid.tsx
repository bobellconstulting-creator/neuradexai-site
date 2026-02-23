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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '10px 0' }}>
        {tools.map(t => (
          <button
            key={t.id}
            onClick={() => onSelectTool(t)}
            style={{
              padding: '7px 6px',
              borderRadius: 6,
              border: `1px solid ${activeToolId === t.id ? t.color : 'transparent'}`,
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: activeToolId === t.id ? `${t.color}22` : '#222',
              color: activeToolId === t.id ? t.color : '#888',
              transition: 'all 0.15s',
              letterSpacing: '0.04em',
            }}
          >
            <span style={{ fontSize: 12 }}>{t.icon}</span>
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: '0.08em' }}>
          BRUSH SIZE — {brushSize}px
        </div>
        <input
          type="range"
          min={10}
          max={150}
          value={brushSize}
          onChange={e => onBrushSize(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#FF6B00' }}
        />
      </div>

      <button
        onClick={onLockBorder}
        style={{
          width: '100%',
          background: '#FF6B00',
          color: '#000',
          padding: '11px 0',
          borderRadius: 8,
          fontWeight: 900,
          cursor: 'pointer',
          border: 'none',
          fontSize: 11,
          letterSpacing: '0.08em',
          marginBottom: 6,
        }}
      >
        LOCK BORDER
      </button>

      <button
        onClick={onWipeAll}
        style={{
          width: '100%',
          color: '#555',
          background: 'none',
          border: 'none',
          padding: 6,
          cursor: 'pointer',
          fontSize: 10,
        }}
      >
        WIPE ALL
      </button>
    </>
  )
}

export default React.memo(ToolGrid)
