'use client'

import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { useMapDrawing, type LayerSummary, type LockResult } from '@/lib/buckgrid/useMapDrawing'
import 'leaflet/dist/leaflet.css'

export interface MapContainerHandle {
  lockBoundary: () => Promise<LockResult>
  wipeAll: () => void
  getCaptureElement: () => HTMLDivElement | null
  flyTo: (center: [number, number], zoom: number) => void
  fitBounds: (bounds: { south: number; west: number; north: number; east: number }) => void
  getSpatialContext: () => {
    acreage: number
    boundaryGeoJSON: any | null
    mapBounds: { sw: [number, number]; ne: [number, number] } | null
    layers: any[]
  }
}

interface Props {
  activeTool: any
  brushSize: number
}

const MapContainer = forwardRef<MapContainerHandle, Props>(({ activeTool, brushSize }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { api } = useMapDrawing({ containerRef, activeTool: activeTool.id, brushSize })

  useImperativeHandle(ref, () => ({
    lockBoundary: () => {
      const result = api.lockAndBake()
      return Promise.resolve(result as any)
    },
    wipeAll: () => api.clearAll(),
    getCaptureElement: () => containerRef.current,
    flyTo: (center, zoom) => api.flyTo(center, zoom),
    fitBounds: (bounds) => api.fitBounds(bounds),
    getSpatialContext: () => api.getSpatialContext(),
  }))

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
})

MapContainer.displayName = 'MapContainer'
export default MapContainer
