import Lenis from 'lenis'
import { rt } from './runtime'
import { useHud } from './store'
import { NAV_STOPS, SEGS, TOTAL, segIndexAt } from './timeline'

/** how much page height one timeline "screen" takes, in viewport heights */
export const SCREEN = 0.9

let lenis: Lenis | null = null
let raf = 0
let last = 0

function limit() {
  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
}
const tToY = (t: number) => (t / TOTAL) * limit()

function sync() {
  const y = lenis ? lenis.scroll : window.scrollY
  rt.tTarget = (y / limit()) * TOTAL
}

/** seconds of autopilot per timeline screen: linger at the stops, hurry between them */
function autoRate(t: number) {
  const seg = SEGS[segIndexAt(t)]
  switch (seg.kind) {
    case 'travel':
      return 0.2
    case 'dwell':
      return seg.body && seg.body.moonCount > 0 ? 0.085 : 0.1
    case 'tunnel':
      return 0.14
    case 'bh':
      return 0.09
    case 'intro':
      return 0.25
    default:
      return 0.14
  }
}

export function startScroll() {
  // always begin at the launch pad, not wherever the browser remembers
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  window.scrollTo(0, 0)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  lenis = new Lenis({ lerp: reduce ? 1 : 0.085, wheelMultiplier: 0.85, touchMultiplier: 1.15, smoothWheel: !reduce })
  lenis.on('scroll', sync)
  // any manual input hands control back to the visitor
  const stopAuto = () => {
    if (useHud.getState().autoplay) useHud.getState().set({ autoplay: false })
  }
  window.addEventListener('wheel', stopAuto, { passive: true })
  window.addEventListener('touchstart', stopAuto, { passive: true })

  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000 || 0, 0.1)
    last = now
    if (useHud.getState().autoplay && lenis) {
      const t = Math.min(rt.tTarget + autoRate(rt.tTarget) * dt, TOTAL)
      lenis.scrollTo(tToY(t), { immediate: true, force: true })
      if (t >= TOTAL - 0.01) useHud.getState().set({ autoplay: false })
    }
    lenis?.raf(now)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault()
      step(-1)
    } else if (e.key === ' ') {
      e.preventDefault()
      useHud.getState().set({ autoplay: !useHud.getState().autoplay })
    }
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', sync)

  // deep link: ?t=12.5 jumps straight to that point of the tour
  const q = new URLSearchParams(location.search).get('t')
  if (q) jumpTo(parseFloat(q))
  else sync()

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', sync)
    window.removeEventListener('wheel', stopAuto)
    window.removeEventListener('touchstart', stopAuto)
    lenis?.destroy()
    lenis = null
  }
}

/** fly to a point on the timeline */
export function goTo(t: number) {
  useHud.getState().set({ autoplay: false })
  const dist = Math.abs(t - rt.tTarget)
  const duration = Math.min(Math.max(dist * 0.55, 1.4), 7)
  lenis?.scrollTo(tToY(t), { duration, easing: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2), force: true })
}

/** jump without animation */
export function jumpTo(t: number) {
  rt.tTarget = Math.min(Math.max(t, 0), TOTAL)
  rt.snap = true
  lenis?.scrollTo(tToY(rt.tTarget), { immediate: true, force: true })
  if (!lenis) window.scrollTo(0, tToY(rt.tTarget))
}

export function step(dir: 1 | -1) {
  const t = rt.tTarget
  const stops = NAV_STOPS.map((s) => s.t)
  if (dir > 0) {
    const next = stops.find((s) => s > t + 0.12)
    goTo(next ?? TOTAL)
  } else {
    const prev = [...stops].reverse().find((s) => s < t - 0.12)
    goTo(prev ?? 0)
  }
}

// handy for testing and for screenshots
;(window as unknown as Record<string, unknown>).__tour = { rt, jumpTo, goTo, TOTAL, SEGS, NAV_STOPS }
