import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { rt } from '../tour/runtime'
import { useHud } from '../tour/store'
import { labelSlots } from './assets'

/** DOM nodes registered by the HUD's label layer, keyed like `labelSlots` */
export const labelEls: Record<string, HTMLElement | null> = {}

/** Projects label anchors to the screen and moves the matching DOM nodes — no React renders. */
export function LabelProjector() {
  const v = useMemo(() => new THREE.Vector3(), [])
  const r = useMemo(() => new THREE.Vector3(), [])
  const placed = useMemo(() => [] as { x: number; y: number }[], [])
  const boxes = useMemo(() => ({ n: 0, list: [] as { l: number; t: number; r: number; b: number }[] }), [])
  useFrame((state) => {
    // tags that would land on top of the open text panel are hidden
    if (boxes.n++ % 8 === 0) {
      boxes.list.length = 0
      const panel = document.querySelector('.panel.on')
      if (panel) {
        const parts = panel.querySelectorAll('.title, .tab-pane.on, .tagline')
        const els = parts.length ? Array.from(parts) : [panel]
        for (const el of els) {
          const q = el.getBoundingClientRect()
          boxes.list.push({ l: q.left - 14, t: q.top - 10, r: q.right + 14, b: q.bottom + 10 })
        }
      }
    }
    const cam = state.camera
    const { width, height } = state.size
    const show = useHud.getState().labels
    r.set(1, 0, 0).applyQuaternion(cam.quaternion)
    placed.length = 0
    for (const id in labelSlots) {
      const el = labelEls[id]
      if (!el) continue
      const slot = labelSlots[id]
      const alpha = show && rt.solar ? slot.alpha : 0
      if (alpha < 0.01) {
        if (el.style.opacity !== '0') el.style.opacity = '0'
        continue
      }
      v.copy(slot.pos).project(cam)
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
        el.style.opacity = '0'
        continue
      }
      const x = (v.x * 0.5 + 0.5) * width
      const y = (-v.y * 0.5 + 0.5) * height
      // projected radius, so the tag sits just outside the body
      v.copy(slot.pos).addScaledVector(r, slot.radius).project(cam)
      const pr = Math.abs((v.x * 0.5 + 0.5) * width - x)
      const lx = x + pr * 0.75 + 8
      let ly = y - pr * 0.75 - 8
      // nudge tags apart when two moons line up
      for (let k = 0; k < 3; k++) {
        let hit = false
        for (const q of placed) if (Math.abs(q.x - lx) < 96 && Math.abs(q.y - ly) < 13) hit = true
        if (!hit) break
        ly += 14
      }
      placed.push({ x: lx, y: ly })
      let covered = false
      for (const q of boxes.list) if (lx + 110 > q.l && lx < q.r && ly + 10 > q.t && ly - 6 < q.b) covered = true
      if (covered) {
        el.style.opacity = '0'
        continue
      }
      el.style.opacity = String(alpha)
      el.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`
    }
  })
  return null
}
