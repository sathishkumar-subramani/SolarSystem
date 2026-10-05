import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { rt } from '../tour/runtime'
import { SEGS, WORMHOLE_POS, evalSeg } from '../tour/timeline'
import { guardNaN, makeRockGeometry, mulberry32 } from './assets'

type BeltProps = { count: number; inner: number; outer: number; thickness: number; size: [number, number]; color: string; seed: number; clearWormhole?: boolean }

/** flight-path samples, so no rock is ever generated in the camera's way */
const pathSamples = (() => {
  const pts: THREE.Vector3[] = []
  const p = new THREE.Vector3()
  const t = new THREE.Vector3()
  for (const s of SEGS) {
    if (s.act !== 'solar' || s.kind === 'intro' || s.kind === 'overview') continue
    for (let i = 0; i <= 60; i++) {
      evalSeg(s, i / 60, p, t)
      pts.push(p.clone())
    }
  }
  return pts
})()

function Belt({ count, inner, outer, thickness, size, color, seed, clearWormhole }: BeltProps) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => makeRockGeometry(seed, 1), [seed])
  const mat = useMemo(() => guardNaN(new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true })), [color])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const rnd = mulberry32(seed)
    const d = new THREE.Object3D()
    const v = new THREE.Vector3()
    let i = 0
    let guard = 0
    while (i < count && guard++ < count * 20) {
      const a = rnd() * Math.PI * 2
      // denser in the middle of the belt
      const r = inner + (outer - inner) * (0.5 + (rnd() + rnd() + rnd() - 1.5) / 3)
      const y = (rnd() + rnd() - 1) * thickness * (0.5 + rnd())
      v.set(Math.cos(a) * r, y, Math.sin(a) * r)
      const s = size[0] + Math.pow(rnd(), 3.5) * (size[1] - size[0])
      const clear = 6 + s * 3
      let ok = true
      for (let k = 0; k < pathSamples.length; k += 2) {
        if (pathSamples[k].distanceToSquared(v) < clear * clear) {
          ok = false
          break
        }
      }
      if (ok && clearWormhole && v.distanceTo(WORMHOLE_POS) < 260) ok = false
      if (!ok) continue
      d.position.copy(v)
      d.rotation.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)
      d.scale.set(s * (0.7 + rnd() * 0.6), s * (0.55 + rnd() * 0.5), s * (0.65 + rnd() * 0.6))
      d.updateMatrix()
      mesh.setMatrixAt(i++, d.matrix)
    }
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [count, inner, outer, thickness, size, seed, clearWormhole])

  return <instancedMesh ref={ref} args={[geo, mat, count]} />
}

export function Belts() {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (g.current) g.current.visible = rt.solar && rt.tunnel < 0.02
  })
  return (
    <group ref={g}>
      {/* main asteroid belt between Mars and Jupiter */}
      <Belt count={3200} inner={860} outer={1090} thickness={34} size={[0.05, 0.95]} color="#665f57" seed={41} />
      {/* Kuiper belt: sparse, icy, beyond Neptune */}
      <Belt count={1500} inner={3000} outer={4300} thickness={170} size={[0.15, 2.2]} color="#7c8088" seed={97} clearWormhole />
    </group>
  )
}
