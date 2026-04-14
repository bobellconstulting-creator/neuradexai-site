'use client'

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GraphNode } from '@/types/agent-graph'

interface ConstellationNodeProps {
  node:        GraphNode
  position:    [number, number, number]
  focused:     boolean
  onClick:     (node: GraphNode) => void
  audioLevel?: number
}

export default function ConstellationNode({
  node,
  position,
  focused,
  onClick,
  audioLevel = 0,
}: ConstellationNodeProps) {
  const groupRef      = useRef<THREE.Group>(null)
  const outerRef      = useRef<THREE.Mesh>(null)
  const innerRef      = useRef<THREE.Mesh>(null)
  const coreRef       = useRef<THREE.Mesh>(null)
  const ringRef       = useRef<THREE.Mesh>(null)
  const smoothedAudio = useRef(0)
  const currentScale  = useRef(1)
  const bobPhase      = useRef(Math.random() * Math.PI * 2)

  // Geometries — allocated per-component-mount inside useMemo so they never
  // execute at module scope (SSR-safe) and get disposed on unmount via the
  // effect below.
  const geometries = useMemo(() => ({
    innerGeo: new THREE.IcosahedronGeometry(1, 0),
    outerGeo: new THREE.IcosahedronGeometry(1, 1),
    ringGeo:  new THREE.IcosahedronGeometry(1, 1),
    coreGeo:  new THREE.SphereGeometry(1, 8, 8),
    hitGeo:   new THREE.SphereGeometry(1, 6, 6),
  }), [])

  useEffect(() => {
    return () => {
      geometries.innerGeo.dispose()
      geometries.outerGeo.dispose()
      geometries.ringGeo.dispose()
      geometries.coreGeo.dispose()
      geometries.hitGeo.dispose()
    }
  }, [geometries])

  // Pre-build materials per-node (color is per-instance)
  const outerMat = useMemo(() => new THREE.MeshBasicMaterial({
    color:       node.color,
    wireframe:   true,
    transparent: true,
    opacity:     0.55,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    toneMapped:  false,
  }), [node.color])

  const innerMat = useMemo(() => new THREE.MeshStandardMaterial({
    color:             '#000010',
    emissive:          node.color,
    emissiveIntensity: 2.2,
    transparent:       true,
    opacity:           0.55,
    wireframe:         true,
    toneMapped:        false,
    blending:          THREE.AdditiveBlending,
    depthWrite:        false,
  }), [node.color])

  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({
    color:             '#000010',
    emissive:          node.color,
    emissiveIntensity: 3.5,
    toneMapped:        false,
  }), [node.color])

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color:       node.color,
    wireframe:   true,
    transparent: true,
    opacity:     0.3,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    toneMapped:  false,
  }), [node.color])

  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity:     0,
    depthWrite:  false,
  }), [])

  // Dispose color-keyed materials when they are recreated (node.color change)
  // or when the component unmounts. hitMat has [] deps so its cleanup only
  // fires on unmount — included here so nothing leaks.
  useEffect(() => {
    return () => {
      outerMat.dispose()
      innerMat.dispose()
      coreMat.dispose()
      ringMat.dispose()
      hitMat.dispose()
    }
  }, [outerMat, innerMat, coreMat, ringMat, hitMat])

  useFrame(({ clock }) => {
    smoothedAudio.current = THREE.MathUtils.lerp(
      smoothedAudio.current,
      audioLevel,
      0.15
    )
    const sa = smoothedAudio.current
    const t  = clock.getElapsedTime()

    // Target scale: focused = 1.5×, unfocused = 1.0
    const targetScale = focused ? 1.5 : 1.0
    currentScale.current = THREE.MathUtils.lerp(currentScale.current, targetScale, 0.18)

    if (groupRef.current) {
      const bob = focused
        ? 0
        : Math.sin(t * 0.7 + bobPhase.current) * 0.08
      groupRef.current.position.set(position[0], position[1] + bob, position[2])
      groupRef.current.scale.setScalar(currentScale.current * node.size)
    }

    if (outerRef.current) {
      outerRef.current.rotation.x = t * (focused ? 0.6 : 0.4)
      outerRef.current.rotation.y = t * (focused ? 0.8 : 0.6)
    }

    if (innerRef.current) {
      innerRef.current.rotation.x = -t * (focused ? 0.45 : 0.3)
      innerRef.current.rotation.z = t  * (focused ? 0.7  : 0.5)
      const mat = innerRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 2.2 + sa * 1.5 + (focused ? 1.2 : 0)
    }

    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 3.5 + sa * 2.0 + (focused ? 2.0 : 0)
    }

    if (ringRef.current) {
      ringRef.current.rotation.x = t * 0.25
      ringRef.current.rotation.z = -t * 0.35
      ringRef.current.visible = focused
    }
  })

  const baseRadius = 0.25

  return (
    <group ref={groupRef} position={position}>
      {/* Outer wireframe icosahedron */}
      <mesh ref={outerRef} geometry={geometries.outerGeo} material={outerMat} scale={baseRadius * 1.3} />

      {/* Inner ghost wireframe shell */}
      <mesh ref={innerRef} geometry={geometries.innerGeo} material={innerMat} scale={baseRadius} />

      {/* Solid emissive core */}
      <mesh ref={coreRef} geometry={geometries.coreGeo} material={coreMat} scale={baseRadius * 0.28} />

      {/* Third outer ring — visible only when focused */}
      <mesh ref={ringRef} geometry={geometries.ringGeo} material={ringMat} scale={baseRadius * 1.9} visible={false} />

      {/* Invisible hit sphere for raycasting.
          Using onClick (not onPointerDown) so R3F distinguishes a tap from an
          OrbitControls drag — prevents accidental node selection while rotating. */}
      <mesh
        geometry={geometries.hitGeo}
        material={hitMat}
        scale={baseRadius * 2.0}
        onClick={(e) => { e.stopPropagation(); onClick(node) }}
      />
    </group>
  )
}
