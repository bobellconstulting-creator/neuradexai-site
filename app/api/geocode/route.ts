import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() || ''

  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 })
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BuckGridPro/1.0 (contact: admin@neuradexai.com)',
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Geocoder unavailable' }, { status: 502 })
    }

    const data = await response.json() as Array<{
      lat: string
      lon: string
      display_name: string
      boundingbox?: [string, string, string, string]
    }>
    if (!data[0]) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    }

    const boundingbox = data[0].boundingbox
      ? {
          south: Number(data[0].boundingbox[0]),
          north: Number(data[0].boundingbox[1]),
          west: Number(data[0].boundingbox[2]),
          east: Number(data[0].boundingbox[3]),
        }
      : null

    return NextResponse.json({
      lat: Number(data[0].lat),
      lon: Number(data[0].lon),
      label: data[0].display_name,
      boundingbox,
    })
  } catch (error) {
    console.error('[BuckGrid Geocode]', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
