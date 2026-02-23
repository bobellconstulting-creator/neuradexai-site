'use client'

import React, { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import ToolGrid from './ToolGrid'
import TonyChat, { type TonyChatHandle } from './TonyChat'
import { TOOLS, type Tool } from '@/lib/buckgrid/tools'
import type { MapContainerHandle } from './MapContainer'

// Dynamic import prevents SSR errors with Leaflet
const MapContainer = dynamic(() => import('./MapContainer'), { ssr: false })

export default function BuckGridProPage() {
  const mapRef = useRef<MapContainerHandle>(null)
  const chatRef = useRef<TonyChatHandle>(null)
  const [activeTool, setActiveTool] = useState<Tool>(TOOLS[0])
  const [brushSize, setBrushSize] = useState(30)
  const [propertyAcres, setPropertyAcres] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const onLockBorder = useCallback(async () => {
    const result = await mapRef.current?.lockBoundary()
    if (!result || result.count === 0) {
      chatRef.current?.addTonyMessage("Draw your property boundary first, then lock it.")
      return
    }
    setPropertyAcres(result.acres)

    const { summary } = result
    const parts: string[] = []
    if (summary.food > 0)    parts.push(`${summary.food} food plot${summary.food > 1 ? 's' : ''}`)
    if (summary.bedding > 0) parts.push(`${summary.bedding} bedding area${summary.bedding > 1 ? 's' : ''}`)
    if (summary.water > 0)   parts.push(`${summary.water} water source${summary.water > 1 ? 's' : ''}`)
    if (summary.path > 0)    parts.push(`${summary.path} trail${summary.path > 1 ? 's' : ''}`)
    if (summary.stand > 0)   parts.push(`${summary.stand} stand${summary.stand > 1 ? 's' : ''}`)

    const layerLine = parts.length > 0 ? ` I can see ${parts.join(', ')}.` : ''
    const contextPrompt =
      `Property locked at ${result.acres} acres.${layerLine}` +
      (result.pathYards > 0 ? ` Total trail: ${result.pathYards} yds.` : '') +
      ` Give me a quick habitat audit.`

    setActiveTool(TOOLS[0])
    chatRef.current?.triggerScan(contextPrompt)
  }, [])

  const searchAddress = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setSearchError('')
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`
      const res = await fetch(url, { headers: { 'User-Agent': 'BuckGridPro/1.0' } })
      const data = await res.json()
      if (data && data[0]) {
        const { lat, lon } = data[0]
        mapRef.current?.flyTo([parseFloat(lat), parseFloat(lon)], 15)
      } else {
        setSearchError('Address not found')
        setTimeout(() => setSearchError(''), 3000)
      }
    } catch {
      setSearchError('Search failed')
      setTimeout(() => setSearchError(''), 3000)
    }
    setSearching(false)
  }, [searchQuery])

  return (
    <div style={{ height: '100dvh', width: '100vw', background: '#000', overflow: 'hidden', position: 'fixed' }}>

      {/* Full-screen map */}
      <MapContainer ref={mapRef} activeTool={activeTool} brushSize={brushSize} />

      {/* ── ADDRESS SEARCH BAR ── */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex',
        gap: 0,
        width: 380,
        maxWidth: 'calc(100vw - 220px)',
      }}>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchAddress()}
          placeholder="Search address or property..."
          style={{
            flex: 1,
            background: 'rgba(15,15,15,0.97)',
            border: '1px solid rgba(255,107,0,0.35)',
            borderRight: 'none',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '8px 0 0 8px',
            fontSize: 12,
            outline: 'none',
            backdropFilter: 'blur(12px)',
          }}
        />
        <button
          onClick={searchAddress}
          disabled={searching}
          style={{
            background: '#FF6B00',
            border: 'none',
            borderRadius: '0 8px 8px 0',
            color: '#000',
            fontWeight: 900,
            padding: '0 14px',
            cursor: searching ? 'wait' : 'pointer',
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {searching ? '…' : '🔍'}
        </button>
        {searchError && (
          <div style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            background: 'rgba(180,30,30,0.95)',
            color: '#fff',
            fontSize: 11,
            padding: '5px 10px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
          }}>
            {searchError}
          </div>
        )}
      </div>

      {/* ── TOOL PANEL (left) ── */}
      <div
        className="glass"
        style={{
          position: 'absolute',
          left: 10,
          top: 10,
          padding: 12,
          borderRadius: 12,
          width: 182,
          zIndex: 2000,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 900, color: '#FF6B00', letterSpacing: '0.08em', marginBottom: 2 }}>
          BUCKGRID PRO
        </div>
        <ToolGrid
          tools={TOOLS}
          activeToolId={activeTool.id}
          brushSize={brushSize}
          onSelectTool={setActiveTool}
          onBrushSize={setBrushSize}
          onLockBorder={onLockBorder}
          onWipeAll={() => {
            mapRef.current?.wipeAll()
            setPropertyAcres(0)
          }}
        />
      </div>

      {/* ── TONY CHAT (right) ── */}
      <TonyChat
        ref={chatRef}
        getCaptureTarget={() => mapRef.current?.getCaptureElement() ?? null}
      />

      {/* ── ACRES DISPLAY (bottom-left) ── */}
      <div
        className="glass"
        style={{
          position: 'absolute',
          left: 10,
          bottom: 10,
          padding: '10px 16px',
          borderRadius: 10,
          borderLeft: '4px solid #FF6B00',
          zIndex: 2000,
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 900, color: '#FF6B00', lineHeight: 1 }}>
          {propertyAcres > 0 ? propertyAcres.toLocaleString() : '—'}
          <span style={{ fontSize: 9, color: '#555', marginLeft: 5, letterSpacing: '0.1em' }}>ACRES</span>
        </div>
      </div>
    </div>
  )
}
