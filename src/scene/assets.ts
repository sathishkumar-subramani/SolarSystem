import * as THREE from 'three'
import { useLoader } from '@react-three/fiber'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const BASE = import.meta.env.BASE_URL

export const texUrl = (name: string) => `${BASE}textures/${name}`
export const SHIP_URL = `${BASE}models/spaceship.glb`

function configure(t: THREE.Texture, srgb: boolean) {
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.anisotropy = 8
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

/** colour texture (sRGB) */
export function useColorMap(name: string) {
  const t = useLoader(THREE.TextureLoader, texUrl(name))
  if (t.colorSpace !== THREE.SRGBColorSpace) configure(t, true)
  return t
}
/** data texture (linear): bump, masks */
export function useDataMap(name: string) {
  const t = useLoader(THREE.TextureLoader, texUrl(name))
  if (t.userData.cfg !== 1) {
    configure(t, false)
    t.userData.cfg = 1
  }
  return t
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A lumpy rock: an icosphere pushed around by a few low-frequency bumps. */
export function makeRockGeometry(seed: number, detail = 2) {
  const raw = new THREE.IcosahedronGeometry(1, detail)
  raw.deleteAttribute('uv')
  raw.deleteAttribute('normal')
  const g = mergeVertices(raw, 1e-4)
  const rnd = mulberry32(seed)
  const bumps = Array.from({ length: 7 }, () => ({
    dir: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(),
    amp: (rnd() - 0.35) * 0.42,
    sharp: 1.5 + rnd() * 3,
  }))
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize()
    let r = 1
    for (const b of bumps) r += b.amp * Math.pow(Math.max(v.dot(b.dir), 0), b.sharp)
    v.multiplyScalar(r)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** screen-space labels: scene components write positions here, the DOM layer reads them */
export type LabelSlot = { pos: THREE.Vector3; alpha: number; radius: number }
export const labelSlots: Record<string, LabelSlot> = {}
export function labelSlot(id: string) {
  return (labelSlots[id] ??= { pos: new THREE.Vector3(), alpha: 0, radius: 0 })
}

let starTex: THREE.CanvasTexture | null = null
/**
 * An equirectangular star map painted once on a canvas. It is the sky that the wormhole and
 * black-hole shaders bend — point sprites cannot be gravitationally lensed, a texture can.
 */
export function getStarTexture() {
  if (starTex) return starTex
  const W = 4096
  const H = 2048
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'lighter'
  const rnd = mulberry32(9917)
  const tints = ['#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea', '#ffe3b8', '#ffc98f', '#ffa97a']
  const N = 15000
  for (let i = 0; i < N; i++) {
    const y = rnd() * 2 - 1 // uniform on the sphere
    const lat = Math.asin(y)
    const u = rnd()
    const px = u * W
    const py = (0.5 - lat / Math.PI) * H
    const m = Math.pow(rnd(), 9)
    const r = 0.7 + rnd() * 0.6 + m * 3.0
    const stretch = Math.min(1 / Math.max(Math.cos(lat), 0.12), 8)
    const a = Math.min(1, 0.25 + rnd() * 0.5 + m * 2)
    ctx.globalAlpha = a
    const tint = tints[Math.floor(Math.pow(rnd(), 0.8) * tints.length)]
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.35, tint)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    for (const ox of [0, -W, W]) {
      if (px + ox < -40 || px + ox > W + 40) continue
      ctx.save()
      ctx.translate(px + ox, py)
      ctx.scale(stretch, 1)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  starTex = new THREE.CanvasTexture(c)
  starTex.colorSpace = THREE.SRGBColorSpace
  starTex.wrapS = THREE.RepeatWrapping
  starTex.wrapT = THREE.ClampToEdgeWrapping
  starTex.minFilter = THREE.LinearFilter
  starTex.magFilter = THREE.LinearFilter
  starTex.generateMipmaps = false
  return starTex
}

/**
 * Built-in three.js materials (the ship, the rocks) get the same protection as the custom shaders.
 *
 * Polished metal under a point-like sun produces specular peaks far above 65,504 — the largest value
 * a half-float HDR buffer can hold. Such a pixel is stored as +infinity, and the bloom blur then turns
 * it into NaN (inf − inf) and spreads it over the whole frame: a black screen on real GPUs. So the
 * output is clamped to `max`, and any NaN is replaced with black.
 */
export function guardNaN<T extends THREE.Material>(material: T, max = 64): T {
  const NAN_GUARD = /* glsl */ `
  if (isnan(gl_FragColor.r) || isnan(gl_FragColor.g) || isnan(gl_FragColor.b) || isnan(gl_FragColor.a)) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, ${max.toFixed(1)});
`
  if (material.userData.nanGuard) return material
  material.userData.nanGuard = true
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${NAN_GUARD}`)
  }
  const key = material.customProgramCacheKey?.bind(material)
  material.customProgramCacheKey = () => `${key ? key() : ''}|nan-guard-${max}`
  material.needsUpdate = true
  return material
}

/**
 * Blender's glTF exporter writes a zero-length tangent for vertices whose UV triangle is degenerate.
 * Normalising that on the GPU gives NaN, so any such tangent is replaced by one perpendicular to the normal.
 */
export function repairTangents(geometry: THREE.BufferGeometry) {
  if (geometry.userData.tangentsChecked) return 0
  geometry.userData.tangentsChecked = true
  const t = geometry.getAttribute('tangent') as THREE.BufferAttribute | undefined
  const n = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
  if (!t || !n) return 0
  const nv = new THREE.Vector3()
  const tv = new THREE.Vector3()
  const axis = new THREE.Vector3()
  let fixed = 0
  for (let i = 0; i < t.count; i++) {
    tv.set(t.getX(i), t.getY(i), t.getZ(i))
    const w = t.getW(i)
    const ok = Number.isFinite(tv.x + tv.y + tv.z) && tv.lengthSq() > 1e-10
    if (ok && Math.abs(w) > 0.5) continue
    if (!ok) {
      nv.set(n.getX(i), n.getY(i), n.getZ(i))
      if (!(nv.lengthSq() > 1e-10)) nv.set(0, 1, 0)
      nv.normalize()
      axis.set(Math.abs(nv.x) < 0.9 ? 1 : 0, Math.abs(nv.x) < 0.9 ? 0 : 1, 0)
      tv.crossVectors(axis, nv).normalize()
    }
    t.setXYZW(i, tv.x, tv.y, tv.z, Math.abs(w) > 0.5 ? w : 1)
    fixed++
  }
  if (fixed) t.needsUpdate = true
  return fixed
}
