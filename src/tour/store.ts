import { create } from 'zustand'

/** what the render watchdog found, if anything */
export type Diag = { kind: 'lost' | 'blank' | 'compat' | 'shader'; details: string }

export type HudState = {
  ready: boolean
  /** shaders compiled */
  warm: boolean
  started: boolean
  /** current stop id: intro | overview | sun | mercury … | wormhole | tunnel | arrival | blackhole | anatomy | outro */
  stop: string
  /** travel = flying towards `stop`, dwell = at the stop */
  mode: 'travel' | 'dwell'
  /** 0 = overview tab, 1 = moons tab */
  tab: number
  labels: boolean
  /** true while the ray-traced black hole is on screen (render resolution is capped) */
  heavy: boolean
  autoplay: boolean
  /** 0 = full pipeline, 1 = compatibility mode (no HDR post-processing) */
  safe: number
  diag: Diag | null
  /** soundtrack: off, fetching the first loops, or playing */
  sound: 'off' | 'loading' | 'on'
  set: (p: Partial<HudState>) => void
}

export const useHud = create<HudState>((set) => ({
  ready: false,
  warm: false,
  started: false,
  stop: 'intro',
  mode: 'dwell',
  tab: 0,
  labels: true,
  heavy: false,
  autoplay: false,
  safe: 0,
  diag: null,
  sound: 'off',
  set: (p) => set(p),
}))
