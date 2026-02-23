import type mapboxgl from "mapbox-gl"

export interface MapBounds {
  sw: [number, number] // [longitude, latitude]
  ne: [number, number]
}

export interface MapCapture {
  imageBase64: string
  bounds: MapBounds
}

/**
 * Captures the current Mapbox map canvas as a base64 PNG and extracts bounds.
 * Must be called after the map has fully loaded (map.loaded() === true).
 */
export async function captureMapImage(mapInstance: mapboxgl.Map): Promise<MapCapture> {
  // Ensure map is fully rendered before capturing
  await new Promise<void>((resolve) => {
    if (mapInstance.loaded()) {
      resolve()
    } else {
      mapInstance.once("idle", () => resolve())
    }
  })

  const b = mapInstance.getBounds()!
  const bounds: MapBounds = {
    sw: [b.getSouthWest().lng, b.getSouthWest().lat],
    ne: [b.getNorthEast().lng, b.getNorthEast().lat],
  }

  const canvas = mapInstance.getCanvas()
  const imageBase64 = canvas
    .toDataURL("image/png")
    .replace("data:image/png;base64,", "")

  return { imageBase64, bounds }
}
