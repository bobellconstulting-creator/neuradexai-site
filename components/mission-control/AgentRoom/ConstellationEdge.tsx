'use client'

import { useMemo } from 'react'
import { Line } from '@react-three/drei'

interface ConstellationEdgeProps {
  from:   [number, number, number]
  to:     [number, number, number]
  weight: number    // 0..1, drives opacity + lineWidth
  color?: string
}

export default function ConstellationEdge({
  from,
  to,
  weight,
  color = 'rgba(138, 160, 191, 0.22)',
}: ConstellationEdgeProps) {
  const points = useMemo<[number, number, number][]>(() => [from, to], [from, to])

  const opacity   = 0.1 + weight * 0.4
  const lineWidth = 0.5 + weight * 1.5

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      transparent
      opacity={opacity}
      depthWrite={false}
      toneMapped={false}
    />
  )
}
