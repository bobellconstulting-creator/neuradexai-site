import html2canvas from "html2canvas"

export interface MapBounds {
  sw: [number, number] // [longitude, latitude]
  ne: [number, number]
}

export interface MapCapture {
  imageBase64: string
  bounds: MapBounds
}

interface LeafletLikeBoundsPoint {
  lng: number
  lat: number
}

interface LeafletLikeBounds {
  getSouthWest(): LeafletLikeBoundsPoint
  getNorthEast(): LeafletLikeBoundsPoint
}

interface LeafletLikeMap {
  whenReady(fn: () => void): void
  getBounds(): LeafletLikeBounds
  getContainer(): HTMLElement
}

/**
 * Captures the current Leaflet map container as a base64 PNG and extracts bounds.
 */
export async function captureMapImage(mapInstance: LeafletLikeMap): Promise<MapCapture> {
  await new Promise<void>((resolve) => {
    mapInstance.whenReady(() => resolve())
  })

  const b = mapInstance.getBounds()!
  const bounds: MapBounds = {
    sw: [b.getSouthWest().lng, b.getSouthWest().lat],
    ne: [b.getNorthEast().lng, b.getNorthEast().lat],
  }

  const container = mapInstance.getContainer()
  const canvas = await html2canvas(container, {
    useCORS: true,
    backgroundColor: null,
    logging: false,
  })

  const imageBase64 = canvas
    .toDataURL("image/png")
    .replace("data:image/png;base64,", "")

  return { imageBase64, bounds }
}
