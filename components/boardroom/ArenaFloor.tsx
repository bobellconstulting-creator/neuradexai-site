'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function ArenaFloor() {
  const matRef = useRef<THREE.ShaderMaterial>(null!)

  const shader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#00e5ff') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;

      float grid(vec2 uv, float spacing) {
        vec2 g = abs(fract(uv / spacing - 0.5) - 0.5) / fwidth(uv / spacing);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }

      void main() {
        vec2 centered = vUv - 0.5;
        float dist = length(centered);

        // Dual-scale grid
        float g1 = grid(vUv * 10.0, 1.0) * 0.55;
        float g2 = grid(vUv * 40.0, 1.0) * 0.22;
        float gridVal = max(g1, g2);

        // Radial fade — bright near center, dark near edge
        float fade = 1.0 - smoothstep(0.18, 0.5, dist);

        // Pulse wave emanating from center
        float wave = sin(dist * 18.0 - uTime * 1.4) * 0.5 + 0.5;
        wave = pow(wave, 3.0) * 0.25 * (1.0 - smoothstep(0.0, 0.45, dist));

        float alpha = (gridVal * fade + wave) * 0.75;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  }), [])

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.elapsedTime
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
      <planeGeometry args={[22, 22]} />
      <shaderMaterial
        ref={matRef}
        {...shader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}
