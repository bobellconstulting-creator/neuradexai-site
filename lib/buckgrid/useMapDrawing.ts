import { useRef, useEffect, useMemo, useCallback } from 'react'
import { FOOD_TYPES } from './tools'

export type LayerType = 'boundary' | 'bedding' | 'food' | 'water' | 'path' | 'stand' | 'focus' | 'other'

export interface LayerSummary {
  boundary: number
  food: number
  bedding: number
  water: number
  path: number
  stand: number
  other: number
}

export interface LockResult {
  count: number
  acres: number
  pathYards: number
  layers: any[]
  summary: LayerSummary
}

export interface MapApi {
  flyTo: (center: [number, number], zoom: number) => void
  clearAll: () => void
  undoLast: () => void
  lockAndBake: () => Promise<LockResult>
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement>
  activeTool: string
  brushSize: number
}

const TOOL_COLORS: Record<string, string> = {
  boundary:    '#FF6B00',
  clover:      '#4ade80',
  brassicas:   '#c084fc',
  corn:        '#facc15',
  soybeans:    '#86efac',
  milo:        '#d97706',
  egyptian:    '#fb923c',
  switchgrass: '#fdba74',
  bedding:     '#713f12',
  stand:       '#ef4444',
  focus:       '#FF0000',
  water:       '#00BFFF',
  path:        '#FFD700',
}

function colorForTool(tool: string): string {
  return TOOL_COLORS[tool] ?? '#FFD700'
}

export function useMapDrawing({ containerRef, activeTool, brushSize }: Props) {
  const mapRef = useRef<any>(null)
  const drawnItemsRef = useRef<any>(null)
  const currentDrawRef = useRef<any>(null)

  // 1. INITIALIZE MAP
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let map: any
    let L: any

    import('leaflet').then((leafletModule) => {
      L = leafletModule.default

      map = L.map(containerRef.current!, {
        zoomControl: false,
        attributionControl: false,
      }).setView([38.5, -98.0], 7)

      // Google Satellite tiles
      L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Google Satellite',
      }).addTo(map)

      const drawnItems = new L.FeatureGroup()
      map.addLayer(drawnItems)
      drawnItemsRef.current = drawnItems
      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        drawnItemsRef.current = null
      }
    }
  }, [containerRef])

  // 2. DRAWING HANDLERS
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const onMouseDown = (e: any) => {
      if (activeTool === 'nav') return
      const { lat, lng } = e.latlng
      const color = colorForTool(activeTool)

      import('leaflet').then(({ default: L }) => {
        const polyline = L.polyline([[lat, lng]], {
          color,
          weight: brushSize || 4,
          opacity: 0.85,
        })
        ;(polyline as any).options.layerType = activeTool
        polyline.addTo(drawnItemsRef.current!)
        currentDrawRef.current = polyline
      })
    }

    const onMouseMove = (e: any) => {
      if (!currentDrawRef.current) return
      currentDrawRef.current.addLatLng(e.latlng)
    }

    const onMouseUp = () => {
      if (!currentDrawRef.current) return
      const shape = currentDrawRef.current
      const coords = shape.getLatLngs()
      const layerType = (shape as any).options.layerType

      // Auto-close: convert polyline → filled polygon (skip for nav/path/stand/focus)
      const skipClose = ['nav', 'path', 'stand', 'focus']
      if (!skipClose.includes(layerType) && coords.length > 2) {
        import('leaflet').then(({ default: L }) => {
          const start = coords[0]
          const end = coords[coords.length - 1]
          if (start.distanceTo(end) > 5) shape.addLatLng(start)

          const polygon = L.polygon(shape.getLatLngs(), {
            color: shape.options.color,
            fillColor: shape.options.color,
            fillOpacity: 0.3,
            weight: 2,
          })
          ;(polygon as any).options.layerType = layerType
          drawnItemsRef.current?.removeLayer(shape)
          drawnItemsRef.current?.addLayer(polygon)
        })
      }
      currentDrawRef.current = null
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)
    map.on('touchstart', onMouseDown)
    map.on('touchmove', onMouseMove)
    map.on('touchend', onMouseUp)

    return () => {
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      map.off('touchstart', onMouseDown)
      map.off('touchmove', onMouseMove)
      map.off('touchend', onMouseUp)
    }
  }, [activeTool, brushSize])

  // 3. SPATIAL RECOGNITION
  const lockAndBake = useCallback(async (): Promise<LockResult> => {
    const empty: LockResult = {
      count: 0, acres: 0, pathYards: 0, layers: [],
      summary: { boundary: 0, food: 0, bedding: 0, water: 0, path: 0, stand: 0, other: 0 },
    }
    if (!drawnItemsRef.current) return empty

    const layers = drawnItemsRef.current.getLayers()
    let boundaryGeo: any = null
    const allFeatures: any[] = []
    let totalPathMeters = 0
    const summary: LayerSummary = { boundary: 0, food: 0, bedding: 0, water: 0, path: 0, stand: 0, other: 0 }

    for (const layer of layers) {
      if (!(layer as any).toGeoJSON) continue
      const geo = (layer as any).toGeoJSON()
      const layerType: string = (layer as any).options?.layerType ?? 'other'

      // Bucket food plot types into "food"
      if (FOOD_TYPES.has(layerType)) {
        summary.food++
      } else if (layerType in summary) {
        (summary as any)[layerType]++
      } else {
        summary.other++
      }

      if (geo.geometry.type === 'LineString') {
        const latlngs: any[] = (layer as any).getLatLngs?.() ?? []
        for (let i = 0; i < latlngs.length - 1; i++) {
          totalPathMeters += latlngs[i].distanceTo(latlngs[i + 1])
        }
      }

      geo.properties = { ...(geo.properties ?? {}), layerType }
      allFeatures.push(geo)

      if (geo.geometry.type === 'Polygon' && layerType === 'boundary') {
        boundaryGeo = geo
      }
      if (!boundaryGeo && geo.geometry.type === 'Polygon') {
        boundaryGeo = geo
      }
    }

    if (!boundaryGeo) return empty

    try {
      const { polygonToCells } = await import('h3-js')
      const hexIds = polygonToCells(boundaryGeo.geometry, 10, true)
      if (mapRef.current) {
        ;(mapRef.current as any).options.hexGrid = hexIds
        ;(mapRef.current as any).options.drawnFeatures = allFeatures
      }
      return {
        count: hexIds.length,
        acres: parseFloat((hexIds.length * 3.718).toFixed(1)),
        pathYards: Math.round(totalPathMeters * 1.09361),
        layers: allFeatures,
        summary,
      }
    } catch {
      return empty
    }
  }, [])

  const api = useMemo<MapApi>(() => ({
    flyTo: (center, zoom) => mapRef.current?.setView(center, zoom),
    clearAll: () => drawnItemsRef.current?.clearLayers(),
    undoLast: () => {
      if (drawnItemsRef.current) {
        const l = drawnItemsRef.current.getLayers()
        if (l.length > 0) drawnItemsRef.current.removeLayer(l[l.length - 1])
      }
    },
    lockAndBake,
  }), [lockAndBake])

  return { api }
}
