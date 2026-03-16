import { useRef, useEffect, useMemo, useCallback } from 'react'
import { area as turfArea } from '@turf/area'
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
  fitBounds: (bounds: { south: number; west: number; north: number; east: number }) => void
  clearAll: () => void
  undoLast: () => void
  lockAndBake: () => Promise<LockResult>
  getSpatialContext: () => {
    acreage: number
    boundaryGeoJSON: any | null
    mapBounds: { sw: [number, number]; ne: [number, number] } | null
    layers: any[]
  }
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement>
  activeTool: string
  brushSize: number
}

const TOOL_COLORS: Record<string, string> = {
  boundary: '#FF6B00',
  clover: '#4ade80',
  brassicas: '#c084fc',
  corn: '#facc15',
  soybeans: '#86efac',
  milo: '#d97706',
  egyptian: '#fb923c',
  switchgrass: '#fdba74',
  bedding: '#713f12',
  stand: '#ef4444',
  focus: '#FF0000',
  water: '#00BFFF',
  path: '#FFD700',
}

function colorForTool(tool: string): string {
  return TOOL_COLORS[tool] ?? '#FFD700'
}

function syncMapInteractions(map: any, activeTool: string) {
  const enabled = activeTool === 'nav'
  const method = enabled ? 'enable' : 'disable'
  map.dragging?.[method]?.()
  map.scrollWheelZoom?.[method]?.()
  map.doubleClickZoom?.[method]?.()
  map.boxZoom?.[method]?.()
  map.keyboard?.[method]?.()
  map.touchZoom?.[method]?.()
}

function circlePolygon(center: { lat: number; lng: number }, radiusMeters: number, sides = 20) {
  const coords: [number, number][] = []
  const latRadians = (center.lat * Math.PI) / 180
  const metersPerDegreeLat = 111320
  const metersPerDegreeLng = 111320 * Math.cos(latRadians)

  for (let i = 0; i <= sides; i++) {
    const theta = (i / sides) * Math.PI * 2
    const lat = center.lat + (Math.sin(theta) * radiusMeters) / metersPerDegreeLat
    const lng = center.lng + (Math.cos(theta) * radiusMeters) / Math.max(metersPerDegreeLng, 1)
    coords.push([lat, lng])
  }

  return coords
}

function boundsToFeature(bounds: any) {
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [sw.lng, sw.lat],
        [ne.lng, sw.lat],
        [ne.lng, ne.lat],
        [sw.lng, ne.lat],
        [sw.lng, sw.lat],
      ]],
    },
    properties: { layerType: 'boundary' },
  }
}

export function useMapDrawing({ containerRef, activeTool, brushSize }: Props) {
  const mapRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const drawnItemsRef = useRef<any>(null)
  const currentDrawRef = useRef<any>(null)
  const dragStartRef = useRef<any>(null)
  const pendingViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null)
  const pendingBoundsRef = useRef<{ south: number; west: number; north: number; east: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import('leaflet').then(({ default: L }) => {
      leafletRef.current = L
      const map = L.map(containerRef.current!, {
        zoomControl: false,
        attributionControl: false,
      }).setView([38.5, -98.0], 7)

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri World Imagery',
      }).addTo(map)

      const drawnItems = new L.FeatureGroup()
      map.addLayer(drawnItems)
      drawnItemsRef.current = drawnItems
      mapRef.current = map
      syncMapInteractions(map, activeTool)
      containerRef.current!.style.cursor = activeTool === 'nav' ? 'grab' : 'crosshair'

      if (pendingViewRef.current) {
        map.setView(pendingViewRef.current.center, pendingViewRef.current.zoom)
        pendingViewRef.current = null
      }
      if (pendingBoundsRef.current) {
        const b = pendingBoundsRef.current
        map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [28, 28] })
        pendingBoundsRef.current = null
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        drawnItemsRef.current = null
      }
    }
  }, [containerRef])

  useEffect(() => {
    if (!mapRef.current) return
    syncMapInteractions(mapRef.current, activeTool)
    if (containerRef.current) {
      containerRef.current.style.cursor = activeTool === 'nav' ? 'grab' : 'crosshair'
    }
  }, [activeTool, containerRef])

  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!map || !L) return

    const onPointerDown = (e: any) => {
      if (activeTool === 'nav' || !drawnItemsRef.current) return
      e.originalEvent?.preventDefault?.()
      e.originalEvent?.stopPropagation?.()

      const point = e.latlng
      const color = colorForTool(activeTool)

      if (activeTool === 'boundary') {
        dragStartRef.current = point
        const rect = L.rectangle(L.latLngBounds(point, point), {
          color,
          fillColor: color,
          fillOpacity: 0.08,
          weight: 3,
        })
        ;(rect as any).options.layerType = 'boundary'
        drawnItemsRef.current.addLayer(rect)
        currentDrawRef.current = rect
        return
      }

      if (activeTool === 'path') {
        const polyline = L.polyline([point], {
          color,
          opacity: 0.95,
          weight: Math.max(3, Math.round((brushSize || 18) / 8)),
        })
        ;(polyline as any).options.layerType = 'path'
        drawnItemsRef.current.addLayer(polyline)
        currentDrawRef.current = polyline
        return
      }

      const zoom = map.getZoom?.() ?? 16
      const metersPerPixel = (156543.03392 * Math.cos((point.lat * Math.PI) / 180)) / (2 ** zoom)
      const radiusMeters = Math.max(12, brushSize * metersPerPixel)
      const polygon = L.polygon(circlePolygon(point, radiusMeters), {
        color,
        fillColor: color,
        fillOpacity: FOOD_TYPES.has(activeTool) ? 0.38 : 0.28,
        weight: activeTool === 'stand' || activeTool === 'focus' ? 3 : 2,
      })
      ;(polygon as any).options.layerType = FOOD_TYPES.has(activeTool) ? activeTool : activeTool
      drawnItemsRef.current.addLayer(polygon)
      currentDrawRef.current = null
    }

    const onPointerMove = (e: any) => {
      if (!currentDrawRef.current) return
      e.originalEvent?.preventDefault?.()

      if (activeTool === 'boundary' && dragStartRef.current) {
        currentDrawRef.current.setBounds(L.latLngBounds(dragStartRef.current, e.latlng))
        return
      }

      if (activeTool === 'path') {
        currentDrawRef.current.addLatLng(e.latlng)
      }
    }

    const onPointerUp = () => {
      if (!currentDrawRef.current) return

      if (activeTool === 'boundary') {
        const bounds = currentDrawRef.current.getBounds?.()
        if (!bounds || !bounds.isValid() || bounds.getSouthWest().distanceTo(bounds.getNorthEast()) < 5) {
          drawnItemsRef.current?.removeLayer(currentDrawRef.current)
        }
      }

      if (activeTool === 'path') {
        const coords = currentDrawRef.current.getLatLngs?.() ?? []
        if (coords.length < 2) {
          drawnItemsRef.current?.removeLayer(currentDrawRef.current)
        }
      }

      currentDrawRef.current = null
      dragStartRef.current = null
    }

    map.on('mousedown', onPointerDown)
    map.on('mousemove', onPointerMove)
    map.on('mouseup', onPointerUp)
    map.on('touchstart', onPointerDown)
    map.on('touchmove', onPointerMove)
    map.on('touchend', onPointerUp)

    return () => {
      map.off('mousedown', onPointerDown)
      map.off('mousemove', onPointerMove)
      map.off('mouseup', onPointerUp)
      map.off('touchstart', onPointerDown)
      map.off('touchmove', onPointerMove)
      map.off('touchend', onPointerUp)
      currentDrawRef.current = null
      dragStartRef.current = null
    }
  }, [activeTool, brushSize])

  const lockAndBake = useCallback(async (): Promise<LockResult> => {
    const empty: LockResult = {
      count: 0,
      acres: 0,
      pathYards: 0,
      layers: [],
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

      if (FOOD_TYPES.has(layerType)) {
        summary.food++
      } else if (layerType in summary) {
        ;(summary as any)[layerType]++
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
    }

    if (!boundaryGeo && mapRef.current) {
      boundaryGeo = boundsToFeature(mapRef.current.getBounds())
      summary.boundary = 1
      allFeatures.push(boundaryGeo)
    }

    if (!boundaryGeo) return empty

    try {
      const squareMeters = turfArea(boundaryGeo as any)
      const acres = squareMeters * 0.000247105
      if (mapRef.current) {
        ;(mapRef.current as any).options.drawnFeatures = allFeatures
      }

      return {
        count: allFeatures.length,
        acres: parseFloat(acres.toFixed(1)),
        pathYards: Math.round(totalPathMeters * 1.09361),
        layers: allFeatures,
        summary,
      }
    } catch {
      return empty
    }
  }, [])

  const getSpatialContext = useCallback(() => {
    const map = mapRef.current
    const drawnItems = drawnItemsRef.current
    const empty = {
      acreage: 0,
      boundaryGeoJSON: null,
      mapBounds: null,
      layers: [] as any[],
    }

    if (!map || !drawnItems) return empty

    const bounds = map.getBounds?.()
    const mapBounds = bounds
      ? {
          sw: [bounds.getSouthWest().lng, bounds.getSouthWest().lat] as [number, number],
          ne: [bounds.getNorthEast().lng, bounds.getNorthEast().lat] as [number, number],
        }
      : null

    const layers = drawnItems.getLayers()
      .filter((layer: any) => typeof layer?.toGeoJSON === 'function')
      .map((layer: any) => {
        const geo = layer.toGeoJSON()
        const layerType = layer.options?.layerType ?? 'other'
        geo.properties = { ...(geo.properties ?? {}), layerType }
        return geo
      })

    let boundaryGeoJSON = layers.find((layer: any) => layer.geometry?.type === 'Polygon' && layer.properties?.layerType === 'boundary') ?? null
    if (!boundaryGeoJSON && mapBounds) {
      boundaryGeoJSON = boundsToFeature(bounds)
    }

    let acreage = 0
    if (boundaryGeoJSON) {
      try {
        acreage = parseFloat((turfArea(boundaryGeoJSON as any) * 0.000247105).toFixed(1))
      } catch {
        acreage = 0
      }
    }

    return {
      acreage,
      boundaryGeoJSON,
      mapBounds,
      layers,
    }
  }, [])

  const api = useMemo<MapApi>(() => ({
    flyTo: (center, zoom) => {
      if (mapRef.current) {
        mapRef.current.flyTo(center, zoom, { duration: 1.1 })
        return
      }
      pendingViewRef.current = { center, zoom }
    },
    fitBounds: (bounds) => {
      if (mapRef.current) {
        mapRef.current.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], { padding: [28, 28] })
        return
      }
      pendingBoundsRef.current = bounds
    },
    clearAll: () => drawnItemsRef.current?.clearLayers(),
    undoLast: () => {
      if (!drawnItemsRef.current) return
      const layers = drawnItemsRef.current.getLayers()
      if (layers.length > 0) {
        drawnItemsRef.current.removeLayer(layers[layers.length - 1])
      }
    },
    lockAndBake,
    getSpatialContext,
  }), [getSpatialContext, lockAndBake])

  return { api }
}
