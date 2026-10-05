import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { BLACKHOLE, BODY_BY_ID } from '../data/bodies'
import { rt } from '../tour/runtime'
import { useHud } from '../tour/store'
import { BH_POS, SEGS, TOTAL, evalSeg, segIndexAt, type Focus, type Seg } from '../tour/timeline'
import { shared } from './materials'

const UP = new THREE.Vector3(0, 1, 0)
const smooth = THREE.MathUtils.smoothstep

/**
 * Reads the timeline position, moves the camera along the flight path and publishes everything
 * the rest of the scene needs (which act is visible, how fast we are going, where the light is).
 * Runs before every other useFrame.
 */
export function Director() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const sunLight = useRef<THREE.PointLight>(null)
  const actLight = useRef<THREE.DirectionalLight>(null)
  const fillLight = useRef<THREE.DirectionalLight>(null)
  const v = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      tan: new THREE.Vector3(),
      look: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      right: new THREE.Vector3(),
      prevPos: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      m: new THREE.Matrix4(),
      lastAct: 'solar',
      fov: 40,
      first: true,
    }),
    [],
  )

  useEffect(() => {
    camera.near = 0.05
    camera.far = 40000
    camera.updateProjectionMatrix()
  }, [camera])

  /** direction that frames a subject: centred, or pushed to one side to leave room for text */
  const focusLook = (f: Focus, pos: THREE.Vector3, out: THREE.Vector3, tanH: number, tanV: number, wide: number, sideMul = 1) => {
    out.copy(f.center).sub(pos).normalize()
    const yaw = Math.atan(f.side * sideMul * 0.36 * wide * tanH)
    out.applyAxisAngle(UP, yaw)
    v.right.crossVectors(out, UP).normalize()
    // subject slightly above the middle on wide screens, well above it on phones
    const fy = THREE.MathUtils.lerp(0.34, f.side === 0 ? 0.0 : 0.05, wide)
    out.applyAxisAngle(v.right, -Math.atan(fy * tanV))
    return out
  }

  const lookFor = (i: number, seg: Seg, u: number, pos: THREE.Vector3, tan: THREE.Vector3, out: THREE.Vector3, tanH: number, tanV: number, wide: number) => {
    if (seg.kind === 'travel') {
      const prev = SEGS[i - 1]
      const next = SEGS[i + 1]
      const wPrev = 1 - smooth(u, 0, 0.4)
      const wNext = smooth(u, 0.45, 1)
      out.copy(tan).multiplyScalar(Math.max(1 - wPrev - wNext, 0))
      if (prev?.focus && wPrev > 0) out.addScaledVector(focusLook(prev.focus, pos, v.a, tanH, tanV, wide), wPrev)
      if (next?.focus && wNext > 0) out.addScaledVector(focusLook(next.focus, pos, v.b, tanH, tanV, wide), wNext)
      return out.normalize()
    }
    // the wormhole starts off to the right and is centred by the time we fly into it
    if (seg.focus) return focusLook(seg.focus, pos, out, tanH, tanV, wide, seg.key === 'dwell:wormhole' ? 1 - smooth(u, 0.4, 0.9) : 1)
    // tunnel: keep looking where the next act begins
    const next = SEGS[i + 1]
    if (next?.focus) return focusLook(next.focus, pos, out, tanH, tanV, wide)
    return out.copy(tan)
  }

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    rt.time += dt
    shared.uTime.value = rt.time

    // --- timeline position
    const snap = rt.snap || v.first
    rt.snapNow = snap
    rt.snap = false
    if (snap) rt.t = rt.tTarget
    else rt.t += (rt.tTarget - rt.t) * (1 - Math.exp(-dt * 4.2))
    rt.t = THREE.MathUtils.clamp(rt.t, 0, TOTAL - 1e-4)
    const i = segIndexAt(rt.t)
    const seg = SEGS[i]
    const u = (rt.t - seg.start) / seg.len
    rt.seg = seg
    rt.segIndex = i
    rt.u = u

    // --- camera pose
    const aspect = state.size.width / Math.max(state.size.height, 1)
    const wide = smooth(aspect, 0.85, 1.35)
    const baseFov = THREE.MathUtils.lerp(58, 40, wide)
    const tanV = Math.tan(THREE.MathUtils.degToRad(baseFov) / 2)
    const tanH = tanV * aspect
    evalSeg(seg, u, v.pos, v.tan)
    lookFor(i, seg, u, v.pos, v.tan, v.look, tanH, tanV, wide)

    const teleport = seg.act !== v.lastAct
    v.lastAct = seg.act
    camera.position.copy(v.pos)
    v.m.lookAt(v.pos, v.a.copy(v.pos).add(v.look), UP)
    v.q.setFromRotationMatrix(v.m)
    if (snap || teleport) camera.quaternion.copy(v.q)
    else camera.quaternion.slerp(v.q, 1 - Math.exp(-dt * 7))

    // --- speed
    const moved = snap || teleport ? 0 : v.pos.distanceTo(v.prevPos) / Math.max(dt, 1e-3)
    v.prevPos.copy(v.pos)
    rt.speed += (moved - rt.speed) * (1 - Math.exp(-dt * 5))
    const scale = seg.act === 'bh' ? 2.2 : 1
    const warpTarget = seg.kind === 'tunnel' ? 0.8 : smooth(rt.speed, 70 * scale, 750 * scale)
    rt.warp += (warpTarget - rt.warp) * (1 - Math.exp(-dt * 3))
    if (snap) {
      rt.speed = 0
      rt.warp = seg.kind === 'tunnel' ? 0.8 : 0
    }
    const fov = baseFov + rt.warp * 13
    if (Math.abs(fov - v.fov) > 0.01) {
      v.fov = fov
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    rt.camPos.copy(v.pos)
    rt.tangent.copy(v.tan)
    rt.lookDir.copy(v.look)
    rt.sunDistance = v.pos.length()

    // --- which parts of the world exist right now
    rt.solar = seg.act === 'solar'
    rt.bh = seg.act === 'bh'
    rt.tags = seg.kind === 'overview' ? smooth(u, 0.0, 0.2) : seg.key === 'travel:sun' ? 1 - smooth(u, 0.05, 0.4) : 0
    if (seg.kind === 'intro' || seg.kind === 'overview') rt.overview = 1
    else if (seg.key === 'travel:sun') rt.overview = 1 - smooth(u, 0.05, 0.55)
    else rt.overview = 0

    if (seg.key === 'dwell:wormhole') {
      rt.tunnel = smooth(u, 0.9, 1.0)
      rt.tunnelU = rt.tunnel * 0.06
    } else if (seg.kind === 'tunnel') {
      rt.tunnel = 1
      rt.tunnelU = 0.06 + u * 0.86
    } else if (seg.key === 'bh:arrive') {
      rt.tunnel = 1 - smooth(u, 0.0, 0.3)
      rt.tunnelU = 0.92 + 0.08 * smooth(u, 0.0, 0.3)
    } else {
      rt.tunnel = 0
    }

    // --- moon labels
    if (seg.body && seg.kind === 'dwell') {
      rt.activeBody = seg.body.id
      rt.activeWeight = smooth(u, 0.0, 0.06) * (1 - smooth(u, 0.9, 1))
    } else if (seg.body && seg.kind === 'travel') {
      rt.activeBody = seg.body.id
      rt.activeWeight = 0
    } else rt.activeWeight = 0

    // --- lighting. Lights are never switched off, only dimmed to zero: changing the number of
    // active lights would force every standard material to recompile mid-flight.
    if (sunLight.current) sunLight.current.intensity = rt.solar ? 4.2 : 0
    const al = actLight.current
    if (al) {
      if (seg.act === 'tunnel') {
        al.color.setRGB(0.72, 0.84, 1.0)
        al.intensity = 0.95 + Math.sin(rt.time * 9) * 0.12 + Math.sin(rt.time * 23) * 0.08
        al.position.copy(v.pos).addScaledVector(v.look, 10).addScaledVector(UP, 4)
      } else if (seg.act === 'bh') {
        const d = v.pos.distanceTo(BH_POS) / BLACKHOLE.rs
        al.color.setRGB(1.0, 0.72, 0.46)
        al.intensity = THREE.MathUtils.clamp(60 / (d + 10), 0.5, 2.2)
        al.position.copy(BH_POS).addScaledVector(UP, 20)
      } else al.intensity = 0
      al.target.position.copy(v.pos).addScaledVector(v.look, 2)
      al.target.updateMatrixWorld()
    }
    const fl = fillLight.current
    if (fl) {
      // planet-shine: light bounced off the body we are passing
      const body = seg.body && rt.solar ? BODY_BY_ID[seg.body.id] : null
      if (body && body.kind === 'planet' && seg.focus) {
        const d = v.pos.distanceTo(seg.focus.center) / body.radius
        fl.color.set(body.accent)
        fl.intensity = THREE.MathUtils.clamp(7 / (d * d), 0, 0.9) * (seg.kind === 'dwell' ? 1 : smooth(u, 0.7, 1))
        fl.position.copy(seg.focus.center)
        fl.target.position.copy(v.pos)
        fl.target.updateMatrixWorld()
      } else fl.intensity = 0
    }

    // --- HUD (only touches React when something actually changes)
    const hud = useHud.getState()
    const mode = seg.kind === 'travel' ? 'travel' : 'dwell'
    const tab = seg.kind === 'dwell' && u > 0.52 ? 1 : 0
    const heavy = seg.act === 'bh'
    if (hud.stop !== seg.stop || hud.mode !== mode || hud.tab !== tab || hud.heavy !== heavy) hud.set({ stop: seg.stop, mode, tab, heavy })

    v.first = false
  }, -10)

  return (
    <>
      <ambientLight intensity={0.012} />
      {/* sunlight for everything that uses standard materials (ship, rocks, small moons) */}
      <pointLight ref={sunLight} color="#fff4e6" intensity={4.2} decay={0} position={[0, 0, 0]} />
      <directionalLight ref={actLight} intensity={0} />
      <directionalLight ref={fillLight} intensity={0} />
    </>
  )
}
