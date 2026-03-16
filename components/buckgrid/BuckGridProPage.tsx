'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  const [searchLabel, setSearchLabel] = useState('')
  const [viewportWidth, setViewportWidth] = useState(1600)
  const isTablet = viewportWidth < 1400
  const isMobile = viewportWidth < 960

  useEffect(() => {
    const syncViewport = () => setViewportWidth(window.innerWidth)
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

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
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (res.ok && typeof data?.lat === 'number' && typeof data?.lon === 'number') {
        setSearchLabel(data.label || q)
        setActiveTool(TOOLS[0])
        if (data?.boundingbox) {
          mapRef.current?.fitBounds(data.boundingbox)
        } else {
          mapRef.current?.flyTo([data.lat, data.lon], 15)
        }
        chatRef.current?.addTonyMessage(`Centered on ${data.label || q}. Draw the border you want Tony to analyze.`)
      } else {
        setSearchError(data?.error || 'Address not found')
        setTimeout(() => setSearchError(''), 3000)
      }
    } catch {
      setSearchError('Search failed')
      setTimeout(() => setSearchError(''), 3000)
    }
    setSearching(false)
  }, [searchQuery])

  return (
    <div
      style={{
        height: '100dvh',
        width: '100vw',
        overflow: 'hidden',
        position: 'fixed',
        background:
          'radial-gradient(circle at top left, rgba(166,109,22,0.16), transparent 26%), linear-gradient(180deg, #0c100c 0%, #0a0d09 100%)',
      }}
    >

      {/* Full-screen map */}
      <MapContainer ref={mapRef} activeTool={activeTool} brushSize={brushSize} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(8,11,8,0.72) 0%, rgba(8,11,8,0.18) 34%, rgba(8,11,8,0.06) 56%, rgba(8,11,8,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 18,
          left: 18,
          zIndex: 2000,
          width: isMobile ? 'calc(100vw - 36px)' : 'min(420px, calc(100vw - 420px))',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 12px',
            borderRadius: 999,
            background: 'rgba(10,12,10,0.72)',
            border: '1px solid rgba(217,164,65,0.18)',
            color: '#d9a441',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            marginBottom: 14,
            backdropFilter: 'blur(14px)',
          }}
        >
          <span>Elite Habitat Intelligence</span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#84cc16', boxShadow: '0 0 10px rgba(132,204,22,0.7)' }} />
        </div>
        <div style={{ color: '#f8f0de', fontSize: 'clamp(28px, 3vw, 40px)', lineHeight: 0.96, fontWeight: 700, letterSpacing: '-0.05em', marginBottom: 10, fontFamily: "'Playfair Display', serif" }}>
          BuckGrid Pro
        </div>
        <div style={{ color: 'rgba(237,227,197,0.76)', fontSize: 14, lineHeight: 1.6, maxWidth: 420, marginBottom: 12 }}>
          Sketch the property, lock the footprint, and get a ranked habitat plan without burying the map under UI.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['Search the farm', 'Paint the plan', 'Ask Tony the next move'].map((line) => (
            <div
              key={line}
              style={{
                padding: '7px 11px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#d8decb',
                fontSize: 11,
                backdropFilter: 'blur(10px)',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* ── ADDRESS SEARCH BAR ── */}
      <div style={{
        position: 'absolute',
        top: isMobile ? 156 : 22,
        left: isMobile ? 18 : '50%',
        transform: isMobile ? 'none' : 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex',
        gap: 0,
        width: isMobile ? 'calc(100vw - 36px)' : 'min(460px, calc(100vw - 40px))',
      }}>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchAddress()}
          placeholder="Search address or property..."
          style={{
            flex: 1,
            background: 'rgba(10,12,10,0.92)',
            border: '1px solid rgba(217,164,65,0.24)',
            borderRight: 'none',
            color: '#f7f0de',
            padding: '14px 16px',
            borderRadius: '14px 0 0 14px',
            fontSize: 13,
            outline: 'none',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.24)',
          }}
        />
        <button
          onClick={searchAddress}
          disabled={searching}
          style={{
            background: 'linear-gradient(135deg, #d9a441 0%, #f6d58e 100%)',
            border: 'none',
            borderRadius: '0 14px 14px 0',
            color: '#17150f',
            fontWeight: 900,
            padding: '0 18px',
            cursor: searching ? 'wait' : 'pointer',
            fontSize: 15,
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
          left: 18,
          top: isMobile ? 214 : 108,
          padding: 14,
          borderRadius: 20,
          width: isMobile ? 'calc(100vw - 36px)' : 214,
          zIndex: 2000,
          background: 'linear-gradient(180deg, rgba(14,18,14,0.94) 0%, rgba(10,12,10,0.98) 100%)',
          border: '1px solid rgba(217,164,65,0.16)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 900, color: '#d9a441', letterSpacing: '0.2em', marginBottom: 6, textTransform: 'uppercase' }}>
          BUCKGRID PRO
        </div>
        <div style={{ color: '#f7f0de', fontSize: 18, fontWeight: 700, lineHeight: 1.1, marginBottom: 8, fontFamily: "'Playfair Display', serif" }}>
          Tools
        </div>
        <div style={{ color: 'rgba(237,227,197,0.68)', fontSize: 12, lineHeight: 1.55, marginBottom: 6 }}>
          Draw only what matters, then lock the boundary when you want Tony to react to the plan.
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
        getSpatialContext={() => ({
          ...(mapRef.current?.getSpatialContext() ?? {
            acreage: propertyAcres,
            boundaryGeoJSON: null,
            mapBounds: null,
            layers: [],
          }),
          locationLabel: searchLabel,
        })}
      />

      {/* ── ACRES DISPLAY (bottom-left) ── */}
      <div
        className="glass"
        style={{
          position: 'absolute',
          left: 18,
          bottom: isMobile ? 18 : 18,
          padding: '14px 18px',
          borderRadius: 20,
          borderLeft: '4px solid #d9a441',
          zIndex: 2000,
          background: 'linear-gradient(180deg, rgba(14,18,14,0.95) 0%, rgba(10,12,10,0.98) 100%)',
          border: '1px solid rgba(217,164,65,0.16)',
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(237,227,197,0.62)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
          Locked Footprint
        </div>
        <div style={{ fontSize: 30, fontWeight: 900, color: '#d9a441', lineHeight: 1 }}>
          {propertyAcres > 0 ? propertyAcres.toLocaleString() : '—'}
          <span style={{ fontSize: 10, color: 'rgba(237,227,197,0.52)', marginLeft: 6, letterSpacing: '0.16em' }}>ACRES</span>
        </div>
        <div style={{ color: 'rgba(237,227,197,0.64)', fontSize: 12, marginTop: 4 }}>
          {propertyAcres > 0 ? 'Ready for a habitat audit.' : 'Draw and lock a boundary to start.'}
        </div>
      </div>
    </div>
  )
}
