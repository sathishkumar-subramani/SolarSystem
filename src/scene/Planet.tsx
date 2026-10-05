import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { moonDisplayRadius, orbitDisplay, visualPeriod, type BodyDef, type MoonDef } from '../data/bodies'
import { PLANET_POS, SEG_BY_KEY } from '../tour/timeline'
import { rt } from '../tour/runtime'
import { labelSlot, makeRockGeometry, mulberry32, useColorMap, useDataMap } from './assets'
import { ATMO_EXTENT, makeAtmosphereMaterial, makeBodyMaterial, makeProceduralRingTexture, makeRingMaterial } from './materials'

const UP = new THREE.Vector3(0, 1, 0)
const sphereHi = new THREE.SphereGeometry(1, 128, 96)
const sphereMid = new THREE.SphereGeometry(1, 48, 32)
/** where each moon starts, as an angle around the planet measured from the camera's side (150° ≈ just left of the far limb) */
const AZIMUTHS = [150, 126, 163, 138, 116, 157, 131, 145, 121, 166, 141]
const MOON_INC: Record<string, number> = { moon: 5, triton: 23, iapetus: 15, phoebe: 8, nereid: 7, hyperion: 1 }

/** direction of the north pole: tilted towards the Sun and a little towards the camera's approach */
function poleAxis(body: BodyDef, center: THREE.Vector3) {
  const toSun = center.clone().multiplyScalar(-1).setY(0).normalize()
  const dwell = SEG_BY_KEY[`dwell:${body.id}`]
  const toCam = dwell.p1.clone().sub(center).setY(0).normalize()
  const h = toSun.multiplyScalar(0.55).addScaledVector(toCam, 0.45).normalize()
  const tilt = THREE.MathUtils.degToRad(body.tiltDeg)
  return new THREE.Vector3().addScaledVector(UP, Math.cos(tilt)).addScaledVector(h, Math.sin(tilt)).normalize()
}

type MoonRuntime = { def: MoonDef; a: number; r: number; omega: number; phase: number; inc: number; node: number }
type Rock = { a: number; omega: number; phase: number; size: number; sx: number; sy: number; sz: number; u: THREE.Vector3; w: THREE.Vector3; spin: number }

export function Planet({ body }: { body: BodyDef }) {
  const center = PLANET_POS[body.id]
  const R = body.radius
  const axis = useMemo(() => poleAxis(body, center), [body, center])
  const tiltQuat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, axis), [axis])

  const map = useColorMap(body.texture)
  const bump = useDataMap(body.bump ?? 'moon_bump.jpg')
  const night = useColorMap('earth_night.jpg')
  const brc = useDataMap('earth_brc.jpg')
  const saturnRing = useColorMap('saturn_ring.png')

  const ringTex = useMemo(() => {
    if (!body.ring) return null
    if (body.ring.kind === 'saturn') {
      saturnRing.wrapS = THREE.ClampToEdgeWrapping
      saturnRing.needsUpdate = true
      return saturnRing
    }
    return makeProceduralRingTexture(body.ring.kind, body.ring.inner, body.ring.outer)
  }, [body, saturnRing])

  const material = useMemo(() => {
    const atmo = body.atmosphere
    return makeBodyMaterial({
      map,
      bump: body.bump ? bump : undefined,
      bumpScale: (body.bumpScale ?? 0.03) * R,
      earth: body.id === 'earth' ? { night, brc } : undefined,
      terminator: atmo?.terminator ?? 0,
      limb: body.limb ?? 0,
      lunar: atmo ? 0 : 0.45,
      atmoColor: atmo?.color,
      atmoRim: atmo ? atmo.strength * 0.5 : 0,
      sunset: atmo?.sunset ?? 0,
      ringShadow:
        body.ring && ringTex
          ? { tex: ringTex, center, axis, inner: body.ring.inner * R, outer: body.ring.outer * R, opacity: body.ring.kind === 'saturn' ? 1 : body.ring.opacity }
          : undefined,
    })
  }, [body, map, bump, night, brc, ringTex, center, axis, R])

  const atmoMat = useMemo(
    () =>
      body.atmosphere
        ? makeAtmosphereMaterial({ center, radius: R, height: body.atmosphere.height, color: body.atmosphere.color, strength: body.atmosphere.strength, sunset: body.atmosphere.sunset })
        : null,
    [body, center, R],
  )
  const ringMat = useMemo(
    () =>
      body.ring && ringTex
        ? makeRingMaterial({ tex: ringTex, center, axis, planetRadius: R, inner: body.ring.inner * R, outer: body.ring.outer * R, opacity: body.ring.opacity })
        : null,
    [body, ringTex, center, axis, R],
  )

  // ------------------------------------------------------------ moons
  const majors = useMemo<MoonRuntime[]>(() => {
    // Stage the moons for the moment the ship arrives: the big outer ones on the far side of the
    // planet (so they sit inside the frame), the inner ones spread to both sides.
    const dwell = SEG_BY_KEY[`dwell:${body.id}`]
    const mid = dwell.p0.clone().lerp(dwell.p1, 0.45)
    const e = mid.sub(center).setY(0).normalize() // planet -> camera
    const left = new THREE.Vector3().crossVectors(e, UP).normalize() // towards screen-left
    const inv = tiltQuat.clone().invert()
    const dir = new THREE.Vector3()
    return [...body.majorMoons]
      .sort((p, q) => p.aKm - q.aKm)
      .map((def, i) => {
        const aR = orbitDisplay(def.aKm, body.radiusKm)
        // all on the screen-left of the planet, fanned out behind it
        const az = AZIMUTHS[i % AZIMUTHS.length]
        const side = 1
        const a = THREE.MathUtils.degToRad(az)
        dir.copy(e).multiplyScalar(Math.cos(a)).addScaledVector(left, Math.sin(a) * side).applyQuaternion(inv)
        return {
          def,
          a: aR * R,
          r: moonDisplayRadius(def.radiusKm, body.radiusKm) * R,
          omega: ((Math.PI * 2) / visualPeriod(def.periodDays)) * (def.retrograde ? -1 : 1),
          phase: Math.atan2(-dir.z, dir.x),
          inc: THREE.MathUtils.degToRad(MOON_INC[def.id] ?? 0.4 + (i % 3) * 0.4),
          node: i * 1.9,
        }
      })
  }, [body, R, center, tiltQuat])

  const { regular, irregular } = useMemo(() => {
    const rnd = mulberry32(body.name.length * 977 + 13)
    const regular: Rock[] = []
    const irregular: Rock[] = []
    for (const g of body.minorGroups) {
      const list = g.items ?? Array.from({ length: g.count ?? 0 }, () => ({ name: '', aKm: g.aKm![0] + rnd() * (g.aKm![1] - g.aKm![0]) }))
      for (const it of list) {
        const a = orbitDisplay(it.aKm, body.radiusKm) * R * (g.regular ? 1 : 0.94 + rnd() * 0.12)
        const inc = THREE.MathUtils.degToRad(g.inc[0] + rnd() * (g.inc[1] - g.inc[0]))
        const node = rnd() * Math.PI * 2
        // orbit plane basis
        const n = new THREE.Vector3(Math.sin(inc) * Math.cos(node), Math.cos(inc), Math.sin(inc) * Math.sin(node))
        const u = new THREE.Vector3(-Math.sin(node), 0, Math.cos(node))
        const w = new THREE.Vector3().crossVectors(n, u).normalize()
        const periodDays = 0.45 * Math.pow(it.aKm / (body.radiusKm * 2.6), 1.5) + 0.3
        const size = R * (g.regular ? 0.012 + rnd() * 0.012 : 0.009 + Math.pow(rnd(), 2.2) * 0.016)
        const rock: Rock = {
          a,
          // inclinations above 90° already make the orbit retrograde
          omega: (Math.PI * 2) / visualPeriod(periodDays),
          phase: rnd() * Math.PI * 2,
          size,
          sx: 0.8 + rnd() * 0.5,
          sy: 0.65 + rnd() * 0.4,
          sz: 0.7 + rnd() * 0.45,
          u,
          w,
          spin: (rnd() - 0.5) * 0.6,
        }
        ;(g.regular ? regular : irregular).push(rock)
      }
    }
    return { regular, irregular }
  }, [body, R])

  const rockGeo = useMemo(() => makeRockGeometry(body.name.length * 31 + 7), [body])
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d8782', roughness: 1, metalness: 0 }), [])

  const spinRef = useRef<THREE.Mesh>(null)
  const tiltRef = useRef<THREE.Group>(null)
  const moonRefs = useRef<(THREE.Group | null)[]>([])
  const regRef = useRef<THREE.InstancedMesh>(null)
  const irrRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const planetSlot = useMemo(() => labelSlot(body.id), [body])
  const moonSlots = useMemo(() => majors.map((m) => labelSlot(`moon:${m.def.id}`)), [majors])
  const clock = useRef(0)

  const placeRocks = (mesh: THREE.InstancedMesh | null, rocks: Rock[], t: number) => {
    if (!mesh) return
    for (let i = 0; i < rocks.length; i++) {
      const k = rocks[i]
      const ang = k.phase + k.omega * t
      const c = Math.cos(ang) * k.a
      const s = Math.sin(ang) * k.a
      dummy.position.set(k.u.x * c + k.w.x * s, k.u.y * c + k.w.y * s, k.u.z * c + k.w.z * s)
      dummy.rotation.set(k.spin * t, k.phase + k.spin * t * 0.7, 0)
      dummy.scale.set(k.size * k.sx, k.size * k.sy, k.size * k.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  useFrame((state, dt) => {
    if (!rt.solar) return
    if (spinRef.current) spinRef.current.rotation.y += body.spin * Math.min(dt, 0.1)
    planetSlot.pos.copy(center)
    planetSlot.alpha = rt.tags
    planetSlot.radius = R
    const dist = state.camera.position.distanceTo(center)
    const near = dist < R * 60
    // each system keeps its own clock, restarted while nobody is near, so the moons are always
    // in their staged positions when the ship arrives
    if (rt.activeBody === body.id || dist < R * 40) clock.current += Math.min(dt, 0.1)
    else clock.current = 0
    const active = rt.activeBody === body.id ? rt.activeWeight : 0
    if (!near) {
      for (const s of moonSlots) s.alpha = 0
      return
    }
    const t = clock.current
    for (let i = 0; i < majors.length; i++) {
      const m = majors[i]
      const g = moonRefs.current[i]
      if (!g) continue
      const ang = m.phase + m.omega * t
      const x = Math.cos(ang) * m.a
      const z = -Math.sin(ang) * m.a
      // small inclination about the line of nodes
      const y = Math.sin(ang - m.node) * Math.sin(m.inc) * m.a
      g.position.set(x, y, z)
      g.rotation.y = ang + Math.PI // tidally locked: the same face looks at the planet
      g.getWorldPosition(tmp)
      moonSlots[i].pos.copy(tmp)
      moonSlots[i].alpha = active
      moonSlots[i].radius = m.r
    }
    placeRocks(regRef.current, regular, t)
    placeRocks(irrRef.current, irregular, t)
  })

  return (
    <group position={center}>
      <group ref={tiltRef} quaternion={tiltQuat}>
        <mesh ref={spinRef} geometry={sphereHi} material={material} scale={R} />
        {ringMat && body.ring && (
          <mesh rotation-x={-Math.PI / 2} material={ringMat} renderOrder={3}>
            <ringGeometry args={[body.ring.inner * R, body.ring.outer * R, 220, 1]} />
          </mesh>
        )}
        {majors.map((m, i) => (
          <group key={m.def.id} ref={(el) => void (moonRefs.current[i] = el)}>
            <MoonMesh moon={m.def} radius={m.r} planetCenter={center} planetRadius={R} />
          </group>
        ))}
        {regular.length > 0 && <instancedMesh ref={regRef} args={[rockGeo, rockMat, regular.length]} frustumCulled={false} />}
      </group>
      {irregular.length > 0 && <instancedMesh ref={irrRef} args={[rockGeo, rockMat, irregular.length]} frustumCulled={false} />}
      {atmoMat && body.atmosphere && (
        <mesh geometry={sphereMid} material={atmoMat} scale={R * (1 + ATMO_EXTENT * body.atmosphere.height)} renderOrder={2} />
      )}
    </group>
  )
}

function MoonMesh({ moon, radius, planetCenter, planetRadius }: { moon: MoonDef; radius: number; planetCenter: THREE.Vector3; planetRadius: number }) {
  const map = useColorMap(moon.texture ?? 'moon.jpg')
  const bump = useDataMap(moon.bump ?? 'moon_bump.jpg')
  const material = useMemo(
    () =>
      makeBodyMaterial({
        map,
        bump: moon.bump ? bump : undefined,
        bumpScale: 0.016 * radius,
        lunar: moon.haze ? 0 : 0.5,
        terminator: moon.haze ? 0.3 : 0,
        atmoColor: moon.haze,
        atmoRim: moon.haze ? 0.6 : 0,
        occluder: { pos: planetCenter, radius: planetRadius },
        shine: 0.006,
      }),
    [map, bump, moon, radius, planetCenter, planetRadius],
  )
  const hazeRef = useRef<THREE.Mesh>(null)
  const hazeCenter = useMemo(() => new THREE.Vector3(), [])
  const hazeMat = useMemo(
    () => (moon.haze ? makeAtmosphereMaterial({ center: hazeCenter, radius, height: 0.035, color: moon.haze, strength: 0.9 }) : null),
    [moon, radius, hazeCenter],
  )
  useFrame(() => {
    if (hazeRef.current) hazeRef.current.getWorldPosition(hazeCenter)
  })
  const s = moon.shape ?? [1, 1, 1]
  return (
    <>
      <mesh geometry={sphereMid} material={material} scale={[radius * s[0], radius * s[1], radius * s[2]]} />
      {hazeMat && <mesh ref={hazeRef} geometry={sphereMid} material={hazeMat} scale={radius * (1 + ATMO_EXTENT * 0.035)} renderOrder={2} />}
    </>
  )
}
