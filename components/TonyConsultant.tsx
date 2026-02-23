"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { captureMapImage } from "@/lib/capture-map"
import { parseTonyResponse, TonyFeature } from "@/lib/parse-tony-response"
import { FEATURE_STYLES, FeatureType } from "@/lib/tony-prompt"

// ── Color palette ──────────────────────────────────────────────
// bg-deep:      #0d1a0d   (darkest bg)
// bg-panel:     #1a2e1a   (side panel)
// accent-amber: #c8860a   (Tony's gold)
// text-cream:   #e8dcc8   (primary text)
// text-muted:   #8a9e82   (secondary text)
// ──────────────────────────────────────────────────────────────

const STATES = [
  "Iowa", "Illinois", "Wisconsin", "Michigan", "Indiana", "Ohio",
  "Missouri", "Kansas", "Minnesota", "Pennsylvania", "New York",
  "Kentucky", "Tennessee", "Alabama", "Mississippi", "Arkansas",
  "Oklahoma", "Texas", "Georgia", "South Carolina", "Virginia",
  "West Virginia", "Maryland", "Nebraska", "South Dakota", "North Dakota",
]

const REGION_MAP: Record<string, string> = {
  Iowa: "Midwest", Illinois: "Midwest", Wisconsin: "Midwest",
  Michigan: "Midwest", Indiana: "Midwest", Ohio: "Midwest",
  Missouri: "Midwest", Kansas: "Midwest", Minnesota: "Midwest",
  Nebraska: "Midwest", "South Dakota": "Midwest", "North Dakota": "Midwest",
  Pennsylvania: "Northeast", "New York": "Northeast", "West Virginia": "Northeast",
  Maryland: "Northeast", Virginia: "Northeast",
  Kentucky: "South", Tennessee: "South", Alabama: "South",
  Mississippi: "South", Arkansas: "South", Oklahoma: "South",
  Texas: "South", Georgia: "South", "South Carolina": "South",
}

type TabId = "chat" | "features" | "plan"

export default function TonyConsultant() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const drawRef = useRef<any>(null)
  const mapboxglRef = useRef<any>(null)

  const [mapLoaded, setMapLoaded] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [tonyResponse, setTonyResponse] = useState<ReturnType<typeof parseTonyResponse> | null>(null)
  const [streamingText, setStreamingText] = useState("")
  const [drawnFeatures, setDrawnFeatures] = useState<TonyFeature[]>([])
  const [propertyBoundary, setPropertyBoundary] = useState<any>(null)
  const [acreage, setAcreage] = useState<number>(0)
  const [activeTab, setActiveTab] = useState<TabId>("chat")
  const [state, setState] = useState("Iowa")
  const [drawingFeatureIndex, setDrawingFeatureIndex] = useState<number>(-1)
  const [error, setError] = useState<string | null>(null)

  const region = REGION_MAP[state] ?? "Midwest"

  // ── Initialize Mapbox + Draw ────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return

    // Dynamic imports to avoid SSR issues
    Promise.all([
      import("mapbox-gl"),
      import("@mapbox/mapbox-gl-draw"),
      import("@turf/area"),
    ]).then(([mapboxModule, MapboxDrawModule, turfModule]) => {
      const mapboxgl = mapboxModule.default
      const MapboxDraw = MapboxDrawModule.default
      const turfArea = turfModule.default
      mapboxglRef.current = mapboxgl

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

      const map = new mapboxgl.Map({
        container: mapContainerRef.current!,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [-93.5, 41.8],
        zoom: 14,
        preserveDrawingBuffer: true, // Required for canvas capture
      })

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        styles: [
          {
            id: "gl-draw-polygon-fill-inactive",
            type: "fill",
            filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"]],
            paint: { "fill-color": "#c8860a", "fill-opacity": 0.08 },
          },
          {
            id: "gl-draw-polygon-fill-active",
            type: "fill",
            filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
            paint: { "fill-color": "#c8860a", "fill-opacity": 0.12 },
          },
          {
            id: "gl-draw-polygon-stroke-inactive",
            type: "line",
            filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"]],
            paint: { "line-color": "#c8860a", "line-width": 2, "line-dasharray": [2, 2] },
          },
          {
            id: "gl-draw-polygon-stroke-active",
            type: "line",
            filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
            paint: { "line-color": "#c8860a", "line-width": 2.5 },
          },
          {
            id: "gl-draw-polygon-midpoint",
            type: "circle",
            filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
            paint: { "circle-radius": 4, "circle-color": "#c8860a" },
          },
          {
            id: "gl-draw-polygon-and-line-vertex-inactive",
            type: "circle",
            filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
            paint: { "circle-radius": 5, "circle-color": "#c8860a", "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
          },
        ],
      })

      map.addControl(draw, "top-left")
      map.addControl(new mapboxgl.NavigationControl(), "top-right")
      map.addControl(new mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-right")

      const updateBoundary = (feature: any) => {
        setPropertyBoundary(feature.geometry)
        const areaM2 = turfArea(feature)
        const acres = Math.round(areaM2 * 0.000247105)
        setAcreage(acres)
      }

      map.on("draw.create", (e: any) => {
        const feature = e.features[0]
        updateBoundary(feature)
      })
      map.on("draw.update", (e: any) => {
        const feature = e.features[0]
        updateBoundary(feature)
      })
      map.on("draw.delete", () => {
        setPropertyBoundary(null)
        setAcreage(0)
      })

      map.on("load", () => setMapLoaded(true))

      mapRef.current = map
      drawRef.current = draw
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // ── Ask Tony ────────────────────────────────────────────────
  const askTony = useCallback(async () => {
    const map = mapRef.current
    if (!map || !propertyBoundary) {
      setError("Draw your property boundary on the map first.")
      return
    }

    setError(null)
    setIsAnalyzing(true)
    setStreamingText("")
    setTonyResponse(null)
    setDrawnFeatures([])
    setDrawingFeatureIndex(-1)
    setActiveTab("chat")

    try {
      const { imageBase64, bounds } = await captureMapImage(map)

      const res = await fetch("/api/tony", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          boundaryGeoJSON: propertyBoundary,
          mapBounds: bounds,
          acreage,
          region,
          state,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Server error: ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (payload.error) throw new Error(payload.error)
            if (payload.text) {
              fullText += payload.text
              setStreamingText(fullText)
            }
          } catch (parseErr) {
            // Skip malformed SSE chunks
          }
        }
      }

      const parsed = parseTonyResponse(fullText)
      setTonyResponse(parsed)

      // Animate Tony's features onto the map
      await drawFeaturesAnimated(parsed.features, map)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      console.error("[TonyConsultant] Error:", err)
    } finally {
      setIsAnalyzing(false)
    }
  }, [propertyBoundary, acreage, region, state])

  // ── Animate feature drawing ─────────────────────────────────
  const drawFeaturesAnimated = useCallback(
    async (features: TonyFeature[], map: any) => {
      const sorted = [...features].sort((a, b) => a.priority - b.priority)

      for (let i = 0; i < sorted.length; i++) {
        setDrawingFeatureIndex(i)
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            addFeatureToMap(sorted[i], map)
            setDrawnFeatures((prev) => [...prev, sorted[i]])
            resolve()
          }, 700)
        })
      }
      setDrawingFeatureIndex(-1)
    },
    []
  )

  const addFeatureToMap = (feature: TonyFeature, map: any) => {
    const sourceId = `tony-${feature.id}`
    const layerId = `tony-layer-${feature.id}`

    // Clean up any previous version
    ;[`${layerId}-label`, `${layerId}-stroke`, layerId].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id)
    })
    if (map.getSource(sourceId)) map.removeSource(sourceId)

    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {
          label: feature.label,
          type: feature.type,
          reason: feature.reason,
        },
        geometry: feature.geometry,
      },
    })

    const style = feature.style ?? FEATURE_STYLES[feature.type as FeatureType] ?? {
      color: "#ffffff",
      fillOpacity: 0.3,
      weight: 2,
    }

    if (feature.geometry.type === "Polygon") {
      map.addLayer({
        id: layerId,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": style.color, "fill-opacity": style.fillOpacity },
      })
      map.addLayer({
        id: `${layerId}-stroke`,
        type: "line",
        source: sourceId,
        paint: { "line-color": style.color, "line-width": style.weight, "line-opacity": 0.9 },
      })
    } else if (feature.geometry.type === "LineString") {
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": style.color,
          "line-width": style.weight,
          "line-dasharray": [3, 1.5],
          "line-opacity": 0.85,
        },
      })
    } else if (feature.geometry.type === "Point") {
      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 9,
          "circle-color": style.color,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      })
    }

    // Label layer
    map.addLayer({
      id: `${layerId}-label`,
      type: "symbol",
      source: sourceId,
      layout: {
        "text-field": feature.label,
        "text-size": 11,
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-offset": [0, feature.geometry.type === "Point" ? 1.4 : 0.8],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.5,
      },
    })

    // Popup on click
    const mapboxgl = mapboxglRef.current
    if (!mapboxgl) return

    map.on("click", layerId, (e: any) => {
      new mapboxgl.Popup({ className: "tony-popup", maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:'DM Sans',sans-serif;padding:4px 2px">
            <div style="color:#c8860a;font-weight:700;font-size:13px;margin-bottom:6px">
              ${feature.label}
            </div>
            <div style="font-size:12px;color:#444;line-height:1.5">
              ${feature.reason}
            </div>
          </div>
        `)
        .addTo(map)
    })

    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = ""
    })
  }

  // ── Clear Tony drawings ─────────────────────────────────────
  const clearTonyDrawings = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    drawnFeatures.forEach((f) => {
      const layerId = `tony-layer-${f.id}`
      ;[`${layerId}-label`, `${layerId}-stroke`, layerId].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id)
      })
      if (map.getSource(`tony-${f.id}`)) map.removeSource(`tony-${f.id}`)
    })

    setDrawnFeatures([])
    setTonyResponse(null)
    setStreamingText("")
    setError(null)
    setDrawingFeatureIndex(-1)
  }, [drawnFeatures])

  // ── Derived chat display text ───────────────────────────────
  const chatDisplayText = tonyResponse?.analysis
    ? tonyResponse.analysis
    : streamingText
        .split("PRIORITIES:")[0]
        .replace("ANALYSIS:", "")
        .trim()

  const panelVisible = !!streamingText || !!tonyResponse || !!error

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        background: "#0d1a0d",
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── MAP ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

        {/* Top bar */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            background: "rgba(13,26,13,0.93)",
            border: "1px solid rgba(200,134,10,0.35)",
            borderRadius: 12,
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            whiteSpace: "nowrap",
          }}
        >
          {/* Logo */}
          <span
            style={{
              fontFamily: "'Playfair Display', serif",
              color: "#c8860a",
              fontWeight: 700,
              fontSize: 17,
              letterSpacing: "-0.02em",
            }}
          >
            BuckGrid Pro
          </span>

          <div style={{ width: 1, height: 22, background: "rgba(200,134,10,0.25)" }} />

          {/* Status text */}
          <span style={{ color: "#8a9e82", fontSize: 12 }}>
            {propertyBoundary
              ? `${acreage.toLocaleString()} acres drawn`
              : "Draw your property boundary to begin"}
          </span>

          {acreage > 0 && (
            <>
              {/* State selector */}
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={{
                  background: "#1a2e1a",
                  border: "1px solid rgba(200,134,10,0.3)",
                  color: "#e8dcc8",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                  outline: "none",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Ask Tony button */}
              <button
                onClick={askTony}
                disabled={isAnalyzing}
                style={{
                  background: isAnalyzing ? "rgba(200,134,10,0.25)" : "#c8860a",
                  border: "none",
                  borderRadius: 8,
                  color: isAnalyzing ? "#8a9e82" : "#0d1a0d",
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "8px 22px",
                  cursor: isAnalyzing ? "wait" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.2s",
                  letterSpacing: "0.01em",
                }}
              >
                {isAnalyzing
                  ? drawingFeatureIndex >= 0
                    ? `Drawing feature ${drawingFeatureIndex + 1}…`
                    : "Tony is analyzing…"
                  : "Ask Tony"}
              </button>

              {/* Clear button */}
              {drawnFeatures.length > 0 && (
                <button
                  onClick={clearTonyDrawings}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,100,100,0.35)",
                    borderRadius: 8,
                    color: "#ff9999",
                    fontSize: 12,
                    padding: "6px 14px",
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.2s",
                  }}
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>

        {/* Draw instructions overlay */}
        {!propertyBoundary && mapLoaded && (
          <div
            style={{
              position: "absolute",
              bottom: 60,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
              background: "rgba(13,26,13,0.88)",
              border: "1px solid rgba(200,134,10,0.25)",
              borderRadius: 10,
              padding: "10px 18px",
              color: "#8a9e82",
              fontSize: 12,
              backdropFilter: "blur(8px)",
              pointerEvents: "none",
            }}
          >
            Use the polygon tool (top-left) to draw your property boundary
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div
            style={{
              position: "absolute",
              bottom: 60,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              background: "rgba(120,20,20,0.95)",
              border: "1px solid rgba(255,100,100,0.4)",
              borderRadius: 10,
              padding: "10px 18px",
              color: "#ffbbbb",
              fontSize: 12,
              maxWidth: 400,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* ── TONY PANEL ─────────────────────────────────────── */}
      {panelVisible && (
        <div
          style={{
            width: 390,
            height: "100vh",
            background: "#1a2e1a",
            borderLeft: "1px solid rgba(200,134,10,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: "18px 22px 14px",
              borderBottom: "1px solid rgba(200,134,10,0.12)",
              background: "#0d1a0d",
            }}
          >
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                color: "#c8860a",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "-0.01em",
              }}
            >
              Tony
            </div>
            <div
              style={{
                color: "#8a9e82",
                fontSize: 10,
                marginTop: 3,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              Habitat Intelligence · {acreage.toLocaleString()} Acres · {state}
            </div>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(200,134,10,0.12)",
              background: "#0d1a0d",
            }}
          >
            {(["chat", "features", "plan"] as TabId[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  background: "transparent",
                  border: "none",
                  borderBottom:
                    activeTab === tab
                      ? "2px solid #c8860a"
                      : "2px solid transparent",
                  color: activeTab === tab ? "#c8860a" : "#8a9e82",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                }}
              >
                {tab === "features"
                  ? `Features${drawnFeatures.length > 0 ? ` (${drawnFeatures.length})` : ""}`
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px 20px 32px",
            }}
          >
            {/* ── CHAT TAB ── */}
            {activeTab === "chat" && (
              <div>
                {/* Streaming / analysis */}
                {chatDisplayText ? (
                  <p
                    style={{
                      color: "#e8dcc8",
                      fontSize: 14,
                      lineHeight: 1.75,
                      marginBottom: 22,
                      marginTop: 0,
                    }}
                  >
                    {chatDisplayText}
                    {isAnalyzing && !tonyResponse && (
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 14,
                          background: "#c8860a",
                          marginLeft: 3,
                          verticalAlign: "middle",
                          animation: "blink 0.9s step-end infinite",
                        }}
                      />
                    )}
                  </p>
                ) : isAnalyzing ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "#8a9e82",
                      fontSize: 13,
                      fontStyle: "italic",
                      marginBottom: 20,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🌿</span>
                    Tony is reading your land…
                  </div>
                ) : null}

                {/* This Week callout */}
                {tonyResponse?.thisWeek && (
                  <div
                    style={{
                      background: "rgba(200,134,10,0.08)",
                      border: "1px solid rgba(200,134,10,0.3)",
                      borderRadius: 10,
                      padding: "14px 16px",
                      marginBottom: 22,
                    }}
                  >
                    <div
                      style={{
                        color: "#c8860a",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      ✦ This Week
                    </div>
                    <div
                      style={{
                        color: "#e8dcc8",
                        fontSize: 13,
                        lineHeight: 1.65,
                      }}
                    >
                      {tonyResponse.thisWeek}
                    </div>
                  </div>
                )}

                {/* Priorities */}
                {tonyResponse?.priorities && tonyResponse.priorities.length > 0 && (
                  <div>
                    <div
                      style={{
                        color: "#8a9e82",
                        fontSize: 10,
                        letterSpacing: "0.15em",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        marginBottom: 12,
                      }}
                    >
                      Priority Actions
                    </div>
                    {tonyResponse.priorities.map((p, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          gap: 12,
                          marginBottom: 10,
                          padding: "11px 14px",
                          background: "rgba(255,255,255,0.025)",
                          border: "1px solid rgba(255,255,255,0.055)",
                          borderRadius: 8,
                        }}
                      >
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: "rgba(200,134,10,0.15)",
                            border: "1px solid rgba(200,134,10,0.4)",
                            color: "#c8860a",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            fontFamily: "'DM Mono', monospace",
                          }}
                        >
                          {i + 1}
                        </div>
                        <span
                          style={{
                            color: "#e8dcc8",
                            fontSize: 13,
                            lineHeight: 1.55,
                          }}
                        >
                          {p}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── FEATURES TAB ── */}
            {activeTab === "features" && (
              <div>
                <div
                  style={{
                    color: "#8a9e82",
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 14,
                  }}
                >
                  Drawn on Your Map — {drawnFeatures.length} Features
                </div>

                {drawnFeatures.length === 0 ? (
                  <div style={{ color: "#8a9e82", fontSize: 13, fontStyle: "italic" }}>
                    {isAnalyzing ? "Drawing features onto your map…" : "No features drawn yet."}
                  </div>
                ) : (
                  drawnFeatures.map((f) => {
                    const style = FEATURE_STYLES[f.type as FeatureType] ?? { color: "#ffffff" }
                    return (
                      <div
                        key={f.id}
                        style={{
                          display: "flex",
                          gap: 12,
                          marginBottom: 8,
                          padding: "10px 14px",
                          background: "rgba(255,255,255,0.025)",
                          border: `1px solid ${style.color}25`,
                          borderLeft: `3px solid ${style.color}`,
                          borderRadius: "0 8px 8px 0",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              color: style.color,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              marginBottom: 4,
                            }}
                          >
                            {f.label}
                          </div>
                          <div
                            style={{
                              color: "#8a9e82",
                              fontSize: 12,
                              lineHeight: 1.45,
                            }}
                          >
                            {f.reason}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* ── PLAN TAB ── */}
            {activeTab === "plan" && (
              <div>
                <div
                  style={{
                    color: "#8a9e82",
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 16,
                  }}
                >
                  Habitat Improvement Plan
                </div>

                {/* Property card */}
                <div
                  style={{
                    background: "rgba(200,134,10,0.06)",
                    border: "1px solid rgba(200,134,10,0.2)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      color: "#c8860a",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: 8,
                    }}
                  >
                    Property Overview
                  </div>
                  <div style={{ color: "#e8dcc8", fontSize: 13, lineHeight: 1.7 }}>
                    <div>
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          color: "#c8860a",
                        }}
                      >
                        {acreage.toLocaleString()}
                      </span>{" "}
                      acres · {state} · {region}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          color: "#c8860a",
                        }}
                      >
                        {drawnFeatures.length}
                      </span>{" "}
                      habitat improvements mapped
                    </div>
                  </div>
                </div>

                {/* Phased plan */}
                {tonyResponse?.priorities.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "13px 15px",
                      marginBottom: 8,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.055)",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        color: "#c8860a",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        marginBottom: 6,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      Phase {i + 1}
                    </div>
                    <div style={{ color: "#e8dcc8", fontSize: 13, lineHeight: 1.55 }}>
                      {p}
                    </div>
                  </div>
                ))}

                {/* This Week in plan */}
                {tonyResponse?.thisWeek && (
                  <div
                    style={{
                      background: "rgba(200,134,10,0.08)",
                      border: "1px solid rgba(200,134,10,0.3)",
                      borderRadius: 10,
                      padding: "14px 16px",
                      marginTop: 14,
                    }}
                  >
                    <div
                      style={{
                        color: "#c8860a",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      ✦ Start This Week
                    </div>
                    <div
                      style={{ color: "#e8dcc8", fontSize: 13, lineHeight: 1.65 }}
                    >
                      {tonyResponse.thisWeek}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cursor blink animation */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
