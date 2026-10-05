import { Suspense, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { PLANETS } from '../data/bodies'
import { rt } from '../tour/runtime'
import { useHud } from '../tour/store'
import { Belts } from './Belts'
import { BlackHole } from './BlackHole'
import { Director } from './Director'
import { Dust } from './Dust'
import { Effects } from './Effects'
import { LabelProjector } from './LabelProjector'
import { OrbitLines } from './OrbitLines'
import { Planet } from './Planet'
import { Ship } from './Ship'
import { Starfield } from './Starfield'
import { Sun } from './Sun'
import { Tunnel } from './Tunnel'
import { Wormhole } from './Wormhole'

/**
 * Mounted once every asset has loaded: compiles all shaders up front (including the wormhole and
 * black hole, which are not on screen yet) so nothing stutters the first time it appears.
 */
function Warmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let alive = true
    const done = () => alive && useHud.getState().set({ warm: true })
    gl.compileAsync(scene, camera).then(done, done)
    const t = setTimeout(done, 8000)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [gl, scene, camera])
  return null
}

function SolarSystem() {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (g.current) g.current.visible = rt.solar
  })
  return (
    <group ref={g}>
      <Sun />
      {PLANETS.map((p) => (
        <Planet key={p.id} body={p} />
      ))}
      <OrbitLines />
      <Belts />
      <Wormhole />
    </group>
  )
}

export function Experience({ dpr, onDecline, onIncline, multisampling }: { dpr: number; multisampling: number; onDecline: () => void; onIncline: () => void }) {
  return (
    <Canvas
      className="stage"
      flat
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true }}
      camera={{ fov: 40, near: 0.05, far: 40000, position: [0, 500, 5000] }}
      onCreated={({ gl }) => gl.setClearColor('#000000', 1)}
    >
      <PerformanceMonitor onDecline={onDecline} onIncline={onIncline} flipflops={3} />
      <Director />
      <Suspense fallback={null}>
        <Starfield />
        <SolarSystem />
        <Tunnel />
        <BlackHole />
        <Ship />
        <Dust />
        {/* soft, dim surroundings so the ship's metal has something to reflect */}
        <Environment resolution={64} frames={1} environmentIntensity={0.32}>
          <mesh scale={60}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial color="#04060b" side={THREE.BackSide} />
          </mesh>
          <Lightformer form="rect" intensity={1.6} color="#c9d8ff" position={[0, 12, -6]} scale={[30, 4, 1]} />
          <Lightformer form="rect" intensity={0.7} color="#ffd9b0" position={[-14, -2, 6]} scale={[6, 14, 1]} />
          <Lightformer form="ring" intensity={0.9} color="#9fb8ff" position={[10, 3, 10]} scale={6} />
        </Environment>
        <Warmup />
      </Suspense>
      <LabelProjector />
      <Effects multisampling={multisampling} />
    </Canvas>
  )
}
