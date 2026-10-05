import { BLACKHOLE } from '../data/bodies'
import { rt } from '../tour/runtime'
import { useHud } from '../tour/store'
import { BH_POS, SEGS } from '../tour/timeline'

/**
 * The soundtrack. Nothing here is a single music file: the score is a set of seamless loops
 * (public/audio, rendered by tools/render_audio.py) that this module mixes live from the
 * flight itself — which stretch of the tour you are in, how fast the ship is moving, how
 * close the Sun or the black hole is.
 *
 *   warm    inner Solar System           vast    Jupiter and Saturn
 *   cold    Uranus and Neptune           void    the wormhole mouth
 *   tunnel  the transit                  bh      the black hole
 *   engine  hull / drive hum — level and pitch follow the ship's speed
 *   roar    low turbulence — the Sun up close, the tunnel, the accretion disc
 *   arrive  one soft, deep swell as the ship settles at a stop
 *
 * Browsers only allow sound after a click or key press, so the context is created on the
 * first one (unless the visitor has muted the tour before).
 */

const BASE = import.meta.env.BASE_URL
const PAD = 1 // every loop file carries one second of its own continuation at both ends

type Music = 'warm' | 'vast' | 'cold' | 'void' | 'tunnel' | 'bh'
type Loop = Music | 'engine' | 'roar'

/** loop lengths in seconds — fixed by tools/render_audio.py */
const PERIOD: Record<Loop, number> = { warm: 64, vast: 64, cold: 64, void: 64, bh: 64, tunnel: 32, roar: 16, engine: 8 }
const ORDER: Music[] = ['warm', 'vast', 'cold', 'void', 'tunnel', 'bh']
const LEVEL: Record<Music, number> = { warm: 1, vast: 0.92, cold: 1.2, void: 0.9, tunnel: 0.62, bh: 1.05 }
/** the loops are mastered quietly (they are mostly low, slow sound); this brings the mix up to a normal listening level */
const MASTER = 1.7

const ZONE: Record<string, Music> = {
  intro: 'warm',
  overview: 'warm',
  sun: 'warm',
  mercury: 'warm',
  venus: 'warm',
  earth: 'warm',
  mars: 'warm',
  jupiter: 'vast',
  saturn: 'vast',
  uranus: 'cold',
  neptune: 'cold',
  wormhole: 'void',
  tunnel: 'tunnel',
  arrival: 'bh',
  blackhole: 'bh',
  anatomy: 'bh',
  outro: 'bh',
}

type Voice = { gain: GainNode; src: AudioBufferSourceNode | null; target: number; idleSince: number }

let ctx: AudioContext | null = null
let master: GainNode
let analyser: AnalyserNode
let engineTone: BiquadFilterNode
let roarTone: BiquadFilterNode
const voices = new Map<Loop, Voice>()
const buffers = new Map<string, AudioBuffer>()
const pending = new Map<string, Promise<AudioBuffer | null>>()
let timer = 0
let lastStop = ''
let lastArrive = -100
let hiddenPause = false

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const setSound = (sound: 'off' | 'loading' | 'on') => useHud.getState().set({ sound })

function pref(): 'on' | 'off' | null {
  try {
    return localStorage.getItem('sol-sound') as 'on' | 'off' | null
  } catch {
    return null
  }
}
function savePref(v: 'on' | 'off') {
  try {
    localStorage.setItem('sol-sound', v)
  } catch {
    /* private mode: the choice simply lasts for this visit */
  }
}

function load(name: string): Promise<AudioBuffer | null> {
  const have = buffers.get(name)
  if (have) return Promise.resolve(have)
  let p = pending.get(name)
  if (!p) {
    p = fetch(`${BASE}audio/${name}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error(`${name}.mp3: HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then((data) => ctx!.decodeAudioData(data))
      .then((buf) => {
        buffers.set(name, buf)
        return buf
      })
      .catch((err) => {
        console.warn('[sound]', err)
        return null
      })
      .finally(() => pending.delete(name))
    pending.set(name, p)
  }
  return p
}

function build() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  ctx = new AC({ latencyHint: 'playback' })
  master = ctx.createGain()
  master.gain.value = 0
  // a gentle safety net for the moments when several layers peak together
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -10
  comp.knee.value = 12
  comp.ratio.value = 3
  comp.attack.value = 0.03
  comp.release.value = 0.5
  analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  master.connect(comp)
  comp.connect(analyser)
  analyser.connect(ctx.destination)

  // the engine and the turbulence open up (get brighter) as they get louder
  engineTone = ctx.createBiquadFilter()
  engineTone.type = 'lowpass'
  engineTone.frequency.value = 500
  engineTone.Q.value = 0.4
  engineTone.connect(master)
  roarTone = ctx.createBiquadFilter()
  roarTone.type = 'lowpass'
  roarTone.frequency.value = 300
  roarTone.Q.value = 0.5
  roarTone.connect(master)

  for (const name of Object.keys(PERIOD) as Loop[]) {
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(name === 'engine' ? engineTone : name === 'roar' ? roarTone : master)
    voices.set(name, { gain, src: null, target: 0, idleSince: 0 })
  }
}

/** move a loop towards a level; starts the loop when it is first needed and frees it once silent */
function drive(name: Loop, level: number, tc: number, rate = 1) {
  const c = ctx!
  const v = voices.get(name)!
  const now = c.currentTime
  if (level < 0.01) level = 0
  if (level > 0 && !v.src) {
    const buf = buffers.get(name)
    if (!buf) {
      void load(name)
      return
    }
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.loopStart = PAD
    src.loopEnd = PAD + PERIOD[name]
    src.connect(v.gain)
    // not always from the top: revisiting a place should not replay the same first bar
    src.start(now, PAD + ((now * 7.3) % PERIOD[name]))
    v.src = src
    v.gain.gain.cancelScheduledValues(now)
    v.gain.gain.setValueAtTime(0, now)
    v.target = 0
    v.idleSince = now
  }
  if (!v.src) return
  if (Math.abs(level - v.target) > 0.004 || (level === 0 && v.target !== 0)) {
    v.gain.gain.setTargetAtTime(level, now, tc)
    if (level === 0) v.idleSince = now
    v.target = level
  }
  if (rate !== 1) v.src.playbackRate.setTargetAtTime(rate, now, 0.25)
  if (v.target === 0 && now - v.idleSince > tc * 6 + 1) {
    v.src.stop()
    v.src.disconnect()
    v.src = null
  }
}

/** which piece of the score belongs to this point of the flight */
function zoneNow(): Music {
  const seg = rt.seg
  const here = ZONE[seg.stop] ?? 'warm'
  if (seg.kind !== 'travel' || rt.segIndex === 0) return here
  // on a leg between two worlds the music changes hands a little before the half-way point
  const from = ZONE[SEGS[rt.segIndex - 1].stop] ?? here
  return rt.u < 0.42 ? from : here
}

function tick() {
  const c = ctx
  if (!c || c.state !== 'running') return
  const now = c.currentTime
  const seg = rt.seg
  const zone = zoneNow()
  const inTunnel = zone === 'tunnel' || rt.tunnel > 0.05

  // --- score
  for (const name of ORDER) {
    let level = name === zone ? LEVEL[name] : 0
    // the transit piece follows the tunnel's own fade so picture and sound arrive together
    if (name === 'tunnel') level = Math.max(level, rt.tunnel * LEVEL.tunnel)
    drive(name, level, inTunnel ? 0.7 : 1.5)
  }
  // keep the current piece and the next one in memory, let go of the rest (≈ 25 MB each, decoded)
  const zi = ORDER.indexOf(zone)
  const keep = new Set<string>([zone, ORDER[Math.min(zi + 1, ORDER.length - 1)], ORDER[Math.max(zi - 1, 0)]])
  if (!buffers.has(zone)) void load(zone)
  else void load(ORDER[Math.min(zi + 1, ORDER.length - 1)])
  for (const name of ORDER) if (!keep.has(name) && !voices.get(name)!.src) buffers.delete(name)

  // --- the ship
  const flying = seg.kind !== 'intro' && seg.kind !== 'overview' ? 1 : 0
  const warp = clamp01(rt.warp)
  drive('engine', flying * (0.2 + 0.55 * warp), 0.6, 0.94 + 0.3 * warp)
  engineTone.frequency.setTargetAtTime(380 + 2400 * warp * warp, now, 0.4)

  // --- turbulence: the Sun's surface, the tunnel walls, the inner accretion disc
  let near = 0
  if (seg.stop === 'sun') near = 0.42 * (seg.kind === 'dwell' ? 1 : smooth(0.4, 1, rt.u))
  else if (seg.key === 'travel:mercury') near = 0.42 * (1 - smooth(0, 0.7, rt.u))
  else if (seg.act === 'bh') near = 0.5 * (1 - smooth(22, 75, rt.camPos.distanceTo(BH_POS) / BLACKHOLE.rs))
  const roar = Math.max(near, rt.tunnel * 0.55, warp * warp * 0.3 * flying)
  drive('roar', roar, 0.5)
  roarTone.frequency.setTargetAtTime(220 + 2600 * roar * roar, now, 0.4)

  // --- arriving somewhere
  const stop = seg.kind === 'dwell' || (seg.kind === 'bh' && seg.stop !== 'arrival') ? seg.stop : ''
  if (stop && stop !== lastStop && lastStop !== '~' && now - lastArrive > 6) {
    const buf = buffers.get('arrive')
    if (buf) {
      lastArrive = now
      const src = c.createBufferSource()
      const g = c.createGain()
      g.gain.value = 0.42
      src.buffer = buf
      src.connect(g)
      g.connect(master)
      src.start()
      src.onended = () => g.disconnect()
    }
  }
  if (stop || lastStop === '~') lastStop = stop
}

function silenceAll() {
  for (const v of voices.values()) {
    if (v.src) {
      v.src.stop()
      v.src.disconnect()
      v.src = null
    }
    v.target = 0
    v.gain.gain.cancelScheduledValues(0)
    v.gain.gain.value = 0
  }
}

export async function soundOn() {
  const state = useHud.getState().sound
  if (state !== 'off') return
  setSound('loading')
  try {
    if (!ctx) build()
    const c = ctx!
    await c.resume()
    await Promise.all([load(zoneNow()), load('engine'), load('roar'), load('arrive')])
    if (useHud.getState().sound !== 'loading') return // muted again while the files were arriving
    lastStop = '~' // do not greet the stop we are already standing at
    master.gain.cancelScheduledValues(c.currentTime)
    master.gain.setValueAtTime(0, c.currentTime)
    master.gain.setTargetAtTime(MASTER, c.currentTime, 0.9)
    window.clearInterval(timer)
    timer = window.setInterval(tick, 70)
    tick()
    savePref('on')
    setSound('on')
  } catch (err) {
    console.warn('[sound]', err)
    setSound('off')
  }
}

export function soundOff() {
  if (useHud.getState().sound === 'off') return
  savePref('off')
  setSound('off')
  window.clearInterval(timer)
  const c = ctx
  if (!c) return
  master.gain.cancelScheduledValues(c.currentTime)
  master.gain.setTargetAtTime(0, c.currentTime, 0.12)
  window.setTimeout(() => {
    if (useHud.getState().sound !== 'off') return
    silenceAll()
    void c.suspend()
  }, 700)
}

export function toggleSound() {
  if (useHud.getState().sound === 'off') void soundOn()
  else soundOff()
}

/**
 * Call once at start-up. Sound comes on with the visitor's first click or key press —
 * the earliest moment a browser allows it — unless they switched it off on an earlier visit.
 */
export function armSound() {
  const first = (e: Event) => {
    // the Sound button and the M key make their own decision
    if (e.target instanceof Element && e.target.closest('[data-sound]')) return
    if (e instanceof KeyboardEvent && (e.key === 'm' || e.key === 'M' || e.metaKey || e.ctrlKey || e.altKey)) return
    disarm()
    if (pref() !== 'off') void soundOn()
  }
  const disarm = () => {
    window.removeEventListener('click', first, true)
    window.removeEventListener('keydown', first, true)
    window.removeEventListener('touchend', first, true)
  }
  window.addEventListener('click', first, true)
  window.addEventListener('keydown', first, true)
  window.addEventListener('touchend', first, true)

  const onKey = (e: KeyboardEvent) => {
    if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) toggleSound()
  }
  window.addEventListener('keydown', onKey)

  // a tab in the background should be quiet
  const onVis = () => {
    const c = ctx
    if (!c || useHud.getState().sound !== 'on') return
    if (document.hidden) {
      hiddenPause = true
      void c.suspend()
    } else if (hiddenPause) {
      hiddenPause = false
      master.gain.setValueAtTime(0, c.currentTime)
      master.gain.setTargetAtTime(MASTER, c.currentTime, 0.5)
      void c.resume()
    }
  }
  document.addEventListener('visibilitychange', onVis)

  // for tests and curious visitors: window.__tour.sound
  const hook = (window as unknown as { __tour?: Record<string, unknown> }).__tour
  if (hook)
    hook.sound = {
      get ctx() {
        return ctx
      },
      get analyser() {
        return analyser
      },
      levels: () => Object.fromEntries([...voices].map(([k, v]) => [k, +v.gain.gain.value.toFixed(3)])),
      loaded: () => [...buffers.keys()],
      on: soundOn,
      off: soundOff,
    }

  return () => {
    disarm()
    window.removeEventListener('keydown', onKey)
    document.removeEventListener('visibilitychange', onVis)
  }
}
