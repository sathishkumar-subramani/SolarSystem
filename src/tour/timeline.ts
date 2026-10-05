import * as THREE from 'three'
import { BLACKHOLE, PLANETS, SUN, WORMHOLE, type BodyDef } from '../data/bodies'

/**
 * The whole tour is one long camera path, parameterised by scroll.
 * `t` is measured in "screens" of scrolling; every segment owns a Hermite
 * curve (position) and a focus (what the camera frames).
 */

const V3 = THREE.Vector3
const UP = new V3(0, 1, 0)

export type Act = 'solar' | 'tunnel' | 'bh'
export type SegKind = 'intro' | 'overview' | 'travel' | 'dwell' | 'tunnel' | 'bh' | 'outro'

export type Focus = {
  center: THREE.Vector3
  radius: number
  /** +1 = subject on the right of the frame, -1 = left, 0 = centred */
  side: number
}

export type Seg = {
  key: string
  kind: SegKind
  act: Act
  /** which stop the HUD shows while this segment is active */
  stop: string
  len: number
  start: number
  end: number
  p0: THREE.Vector3
  m0: THREE.Vector3
  p1: THREE.Vector3
  m1: THREE.Vector3
  ease: (u: number) => number
  focus?: Focus
  body?: BodyDef
}

export function bodyPosition(b: { orbit: number; theta: number }, out = new V3()) {
  const a = THREE.MathUtils.degToRad(b.theta)
  return out.set(b.orbit * Math.cos(a), 0, -b.orbit * Math.sin(a))
}

/** heading of the fly-by past a body: mostly along its orbit (counter-clockwise), slightly outward */
function orbitHeading(b: { theta: number }) {
  const a = THREE.MathUtils.degToRad(b.theta)
  const out = new V3(Math.cos(a), 0, -Math.sin(a))
  const ccw = new V3(-Math.sin(a), 0, -Math.cos(a))
  return out.multiplyScalar(0.25).addScaledVector(ccw, 0.97).normalize()
}

function flyby(center: THREE.Vector3, R: number, fb: { a: number; b: number; m: number; lift?: number }, d: THREE.Vector3, side: number) {
  const right = new V3(-d.z, 0, d.x).normalize()
  const lift = fb.lift ?? 1.0
  const A = center
    .clone()
    .addScaledVector(d, -fb.a * R)
    .addScaledVector(right, -side * fb.m * R)
    .addScaledVector(UP, lift * R)
  const B = center
    .clone()
    .addScaledVector(d, -fb.b * R)
    .addScaledVector(right, -side * fb.m * R)
    .addScaledVector(UP, lift * 0.4 * R)
  return { A, B }
}

const linear = (u: number) => u
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
const easeOut = (u: number) => 1 - Math.pow(1 - u, 2.2)
const easeIn = (u: number) => Math.pow(u, 1.8)

// ---------------------------------------------------------------- world layout
export const SUN_POS = new V3(0, 0, 0)
export const PLANET_POS: Record<string, THREE.Vector3> = Object.fromEntries(PLANETS.map((p) => [p.id, bodyPosition(p)]))
export const WORMHOLE_POS = bodyPosition(WORMHOLE)
export const BH_POS = new V3(0, 0, 0)

// ---------------------------------------------------------------- build
type Draft = Omit<Seg, 'start' | 'end'>
const drafts: Draft[] = []

function push(d: Partial<Draft> & Pick<Draft, 'key' | 'kind' | 'stop' | 'len' | 'p0' | 'p1'>) {
  const delta = d.p1.clone().sub(d.p0)
  drafts.push({
    act: 'solar',
    ease: linear,
    m0: delta.clone(),
    m1: delta.clone(),
    ...d,
  } as Draft)
}

// --- opening: title shot, then a rise over the whole system
const I0 = new V3(-2500, 420, 5600)
const I1 = new V3(-2050, 760, 5150)
const O1 = new V3(-500, 4700, 3300)
const originFocus: Focus = { center: new V3(0, 0, -150), radius: 3000, side: 0.8 }

// --- the Sun (kept on the left of the frame: we pass it counter-clockwise)
const sunDir = new V3(0.8, 0, -0.6).normalize()
const sunFly = flyby(SUN_POS, SUN.radius, { a: 9.5, b: 1.6, m: 2.5, lift: 0.9 }, sunDir, -1)
const sunHeading = sunFly.B.clone().sub(sunFly.A).normalize()

push({ key: 'intro', kind: 'intro', stop: 'intro', len: 1.0, p0: I0, p1: I1, focus: originFocus, m0: I1.clone().sub(I0), m1: O1.clone().sub(I0).multiplyScalar(0.5) })
push({
  key: 'overview',
  kind: 'overview',
  stop: 'overview',
  len: 1.3,
  p0: I1,
  p1: O1,
  focus: originFocus,
  m0: O1.clone().sub(I0).multiplyScalar(0.5),
  m1: new V3(900, -1200, -900),
})

type Flown = { body: BodyDef; center: THREE.Vector3; A: THREE.Vector3; B: THREE.Vector3; heading: THREE.Vector3; side: number; dwell: number }
const flown: Flown[] = []
flown.push({ body: SUN, center: SUN_POS, A: sunFly.A, B: sunFly.B, heading: sunHeading, side: -1, dwell: 1.5 })
for (const p of PLANETS) {
  const c = PLANET_POS[p.id]
  const d = orbitHeading(p)
  const f = flyby(c, p.radius, p.flyby, d, 1)
  flown.push({ body: p, center: c, A: f.A, B: f.B, heading: f.B.clone().sub(f.A).normalize(), side: 1, dwell: p.moonCount > 0 ? 1.7 : 1.4 })
}

let prevPoint = O1
let prevTangent = new V3(900, -1200, -900)
flown.forEach((f, i) => {
  const dist = f.A.distanceTo(prevPoint)
  const k = dist * 0.62
  push({
    key: `travel:${f.body.id}`,
    kind: 'travel',
    stop: f.body.id,
    len: i === 0 ? 0.8 : 0.75,
    p0: prevPoint,
    p1: f.A,
    m0: i === 0 ? prevTangent.clone() : prevTangent.clone().multiplyScalar(k),
    m1: f.heading.clone().multiplyScalar(i === 0 ? 900 : k),
    ease: easeInOut,
    body: f.body,
  })
  push({
    key: `dwell:${f.body.id}`,
    kind: 'dwell',
    stop: f.body.id,
    len: f.dwell,
    p0: f.A,
    p1: f.B,
    focus: { center: f.center, radius: f.body.radius, side: f.side },
    body: f.body,
  })
  prevPoint = f.B
  prevTangent = f.heading
})

// --- the wormhole, out in the Kuiper belt
const whHeading = orbitHeading(WORMHOLE)
const whA = WORMHOLE_POS.clone().addScaledVector(whHeading, -15 * WORMHOLE.radius).addScaledVector(UP, 40)
const whB = WORMHOLE_POS.clone().addScaledVector(whHeading, -1.04 * WORMHOLE.radius)
{
  const dist = whA.distanceTo(prevPoint)
  const k = dist * 0.62
  const whDir = whB.clone().sub(whA).normalize()
  push({
    key: 'travel:wormhole',
    kind: 'travel',
    stop: 'wormhole',
    len: 0.95,
    p0: prevPoint,
    p1: whA,
    m0: prevTangent.clone().multiplyScalar(k),
    m1: whDir.clone().multiplyScalar(k),
    ease: easeInOut,
  })
  push({
    key: 'dwell:wormhole',
    kind: 'dwell',
    stop: 'wormhole',
    len: 1.5,
    p0: whA,
    p1: whB,
    ease: easeIn,
    focus: { center: WORMHOLE_POS, radius: WORMHOLE.radius, side: 0.62 },
  })
}

// --- transit
const RS = BLACKHOLE.rs
const bhFar = new V3(-2600, 1500, 7200)
const bhMid = new V3(-1300, 520, 3300)
const bhHeading = new V3(0, 0, -1)
const bhFly = flyby(BH_POS, RS, { a: 46, b: 9, m: 17, lift: 5.2 }, bhHeading, 1)
const bhEnd = bhFly.B.clone().addScaledVector(bhHeading, 4 * RS).addScaledVector(UP, -0.6 * RS)

push({ key: 'tunnel', kind: 'tunnel', act: 'tunnel', stop: 'tunnel', len: 1.15, p0: bhFar, p1: bhFar })

const bhFocusFar: Focus = { center: BH_POS, radius: RS * 6, side: 0 }
const bhFocusMid: Focus = { center: BH_POS, radius: RS * 6, side: 0.55 }
const bhFocus: Focus = { center: BH_POS, radius: RS * 6, side: 1 }
push({
  key: 'bh:arrive',
  kind: 'bh',
  act: 'bh',
  stop: 'arrival',
  len: 0.9,
  p0: bhFar,
  p1: bhMid,
  focus: bhFocusFar,
  m0: bhMid.clone().sub(bhFar).multiplyScalar(0.6),
  m1: bhFly.A.clone().sub(bhFar).multiplyScalar(0.45),
  ease: easeOut,
})
push({
  key: 'bh:approach',
  kind: 'bh',
  act: 'bh',
  stop: 'blackhole',
  len: 1.3,
  p0: bhMid,
  p1: bhFly.A,
  focus: bhFocusMid,
  m0: bhFly.A.clone().sub(bhFar).multiplyScalar(0.45),
  m1: bhFly.B.clone().sub(bhFly.A).multiplyScalar(0.8),
})
push({
  key: 'bh:orbit',
  kind: 'bh',
  act: 'bh',
  stop: 'anatomy',
  len: 1.6,
  p0: bhFly.A,
  p1: bhFly.B,
  focus: bhFocus,
  m0: bhFly.B.clone().sub(bhFly.A).multiplyScalar(0.8),
  m1: bhFly.B.clone().sub(bhFly.A).multiplyScalar(0.5),
})
push({ key: 'outro', kind: 'outro', act: 'bh', stop: 'outro', len: 0.8, p0: bhFly.B, p1: bhEnd, focus: bhFocus, m0: bhFly.B.clone().sub(bhFly.A).multiplyScalar(0.25), m1: bhEnd.clone().sub(bhFly.B) })

let cursor = 0
export const SEGS: Seg[] = drafts.map((d) => {
  const s = { ...d, start: cursor, end: cursor + d.len }
  cursor += d.len
  return s
})
export const TOTAL = cursor

export const SEG_BY_KEY: Record<string, Seg> = Object.fromEntries(SEGS.map((s) => [s.key, s]))

export function segIndexAt(t: number) {
  const tt = THREE.MathUtils.clamp(t, 0, TOTAL - 1e-6)
  for (let i = 0; i < SEGS.length; i++) if (tt < SEGS[i].end) return i
  return SEGS.length - 1
}

/** Hermite position + tangent of a segment at local progress u (0..1) */
export function evalSeg(seg: Seg, u: number, pos: THREE.Vector3, tan: THREE.Vector3) {
  const s = seg.ease(THREE.MathUtils.clamp(u, 0, 1))
  const s2 = s * s
  const s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1
  const h10 = s3 - 2 * s2 + s
  const h01 = -2 * s3 + 3 * s2
  const h11 = s3 - s2
  pos.set(0, 0, 0).addScaledVector(seg.p0, h00).addScaledVector(seg.m0, h10).addScaledVector(seg.p1, h01).addScaledVector(seg.m1, h11)
  const d00 = 6 * s2 - 6 * s
  const d10 = 3 * s2 - 4 * s + 1
  const d01 = -6 * s2 + 6 * s
  const d11 = 3 * s2 - 2 * s
  tan.set(0, 0, 0).addScaledVector(seg.p0, d00).addScaledVector(seg.m0, d10).addScaledVector(seg.p1, d01).addScaledVector(seg.m1, d11)
  if (tan.lengthSq() < 1e-8) tan.copy(seg.p1).sub(seg.p0)
  if (tan.lengthSq() < 1e-8) tan.set(0, 0, -1)
  tan.normalize()
}

// ---------------------------------------------------------------- navigation stops
export type NavStop = { id: string; label: string; index: string; t: number; accent: string }

function dwellT(key: string, f = 0.18) {
  const s = SEG_BY_KEY[key]
  return s.start + s.len * f
}

export const NAV_STOPS: NavStop[] = [
  { id: 'overview', label: 'Solar System', index: '—', t: SEG_BY_KEY['overview'].start + 0.75, accent: '#ffffff' },
  { id: 'sun', label: 'Sun', index: SUN.index, t: dwellT('dwell:sun'), accent: SUN.accent },
  ...PLANETS.map((p) => ({ id: p.id, label: p.name, index: p.index, t: dwellT(`dwell:${p.id}`), accent: p.accent })),
  { id: 'wormhole', label: 'Wormhole', index: WORMHOLE.index, t: dwellT('dwell:wormhole', 0.3), accent: WORMHOLE.accent },
  { id: 'blackhole', label: 'Black Hole', index: BLACKHOLE.index, t: dwellT('bh:approach', 0.55), accent: BLACKHOLE.accent },
]
