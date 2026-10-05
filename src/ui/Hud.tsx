import { useEffect, useRef, useState } from 'react'
import { BLACKHOLE, BODIES, MOON_TALLY_DATE, PLANETS, TOTAL_MOONS, WORMHOLE, displayToAU, type BodyDef } from '../data/bodies'
import { toggleSound } from '../audio/sound'
import { labelEls } from '../scene/LabelProjector'
import { rt } from '../tour/runtime'
import { goTo, jumpTo } from '../tour/scroll'
import { useHud } from '../tour/store'
import { BH_POS, NAV_STOPS, TOTAL } from '../tour/timeline'

/** the moons that get a full description; the rest are listed by name */
const FEATURED: Record<string, string[]> = {
  earth: ['moon'],
  mars: ['phobos', 'deimos'],
  jupiter: ['io', 'europa', 'ganymede', 'callisto'],
  saturn: ['titan', 'enceladus', 'mimas', 'iapetus'],
  uranus: ['miranda', 'ariel', 'titania', 'oberon'],
  neptune: ['triton', 'proteus', 'nereid'],
}

const KM_PER_AU = 149.6 // million km

export function Hud() {
  const ready = useHud((s) => s.ready)
  return (
    <div className={`hud ${ready ? 'is-ready' : ''}`}>
      <TopBar />
      <IntroCard />
      <OverviewCard />
      {BODIES.map((b) => (
        <BodyPanel key={b.id} body={b} />
      ))}
      <TravelCaption />
      <WormholePanel />
      <TunnelCaption />
      <ArrivalPanel />
      <BlackHolePanel />
      <AnatomyPanel />
      <Outro />
      <LabelLayer />
      <ProgressRail />
      <DiagPanel />
    </div>
  )
}

// ------------------------------------------------------------------ render diagnostics
const DIAG_TEXT = {
  lost: {
    title: 'Graphics context lost',
    body: 'The browser took the GPU away from this page — usually a driver reset or the GPU running out of memory. The tour resumes by itself if the context comes back; otherwise reload the page.',
  },
  blank: {
    title: 'Nothing is being drawn',
    body: 'WebGL is running, but on this GPU every frame comes out black, even in compatibility mode. Check that hardware acceleration is on (chrome://settings/system), update the graphics driver, or try another browser.',
  },
  compat: {
    title: 'Compatibility mode',
    body: 'The HDR / bloom pipeline produced black frames on this GPU, so it was switched off. Everything still works, without the glow.',
  },
  shader: {
    title: 'A shader failed to compile',
    body: 'Part of the scene may be missing on this GPU.',
  },
} as const

/** Shown only when the render watchdog found a problem; says what it is instead of leaving a black screen. */
function DiagPanel() {
  const diag = useHud((s) => s.diag)
  const set = useHud((s) => s.set)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  if (!diag) return null
  const t = DIAG_TEXT[diag.kind]
  const big = diag.kind === 'lost' || diag.kind === 'blank'
  const copy = () => {
    navigator.clipboard?.writeText(`${t.title}\n${diag.details}`).then(
      () => setCopied(true),
      () => setOpen(true),
    )
  }
  return (
    <aside className={`diag ${big ? 'big' : 'toast'}`} role="alert">
      <p className="eyebrow">Renderer</p>
      <h3>{t.title}</h3>
      <p>{t.body}</p>
      {(big || open) && <pre>{diag.details}</pre>}
      <div className="diag-actions">
        <button className="chip" onClick={copy}>
          {copied ? 'Copied' : 'Copy details'}
        </button>
        {!big && (
          <button className="chip" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : 'Details'}
          </button>
        )}
        {big ? (
          <button className="chip on" onClick={() => location.reload()}>
            Reload
          </button>
        ) : (
          <button className="chip" onClick={() => set({ diag: null })}>
            Dismiss
          </button>
        )}
      </div>
    </aside>
  )
}

// ------------------------------------------------------------------ top bar
function TopBar() {
  const labels = useHud((s) => s.labels)
  const autoplay = useHud((s) => s.autoplay)
  const sound = useHud((s) => s.sound)
  const set = useHud((s) => s.set)
  const a = useRef<HTMLSpanElement>(null)
  const b = useRef<HTMLSpanElement>(null)
  const la = useRef<HTMLSpanElement>(null)
  const lb = useRef<HTMLSpanElement>(null)

  // telemetry is written straight to the DOM a few times a second
  useEffect(() => {
    let raf = 0
    let n = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (n++ % 6) return
      if (!a.current || !b.current || !la.current || !lb.current) return
      if (rt.seg.act === 'solar') {
        const au = displayToAU(rt.sunDistance)
        const lightMin = au * 8.317
        la.current.textContent = 'Distance from Sun'
        a.current.textContent = `${au < 10 ? au.toFixed(2) : au.toFixed(1)} AU`
        lb.current.textContent = 'Sunlight takes'
        b.current.textContent = lightMin < 90 ? `${lightMin.toFixed(1)} min` : `${(lightMin / 60).toFixed(2)} h`
      } else if (rt.seg.act === 'bh') {
        const r = rt.camPos.distanceTo(BH_POS) / BLACKHOLE.rs
        la.current.textContent = 'Distance from horizon'
        a.current.textContent = `${Math.max(r - 1, 0).toFixed(1)} rₛ`
        lb.current.textContent = 'Time runs slower by'
        b.current.textContent = `${((1 / Math.sqrt(Math.max(1 - 1 / r, 1e-3)) - 1) * 100).toFixed(2)} %`
      } else {
        la.current.textContent = 'Position'
        a.current.textContent = 'In transit'
        lb.current.textContent = 'Throat'
        b.current.textContent = `${Math.round(rt.tunnelU * 100)} %`
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <header className="top">
      <button className="brand" onClick={() => goTo(0)} aria-label="Back to the start">
        <span className="brand-mark" />
        SOL <em>A tour of the Solar System</em>
      </button>
      <div className="telemetry" aria-hidden>
        <div>
          <span ref={la} className="k">Distance from Sun</span>
          <span ref={a} className="v">—</span>
        </div>
        <div>
          <span ref={lb} className="k">Sunlight takes</span>
          <span ref={b} className="v">—</span>
        </div>
      </div>
      <div className="controls">
        <button
          data-sound
          className={`chip sound ${sound !== 'off' ? 'on' : ''} ${sound === 'loading' ? 'busy' : ''}`}
          onClick={toggleSound}
          aria-pressed={sound !== 'off'}
          title="Sound on / off (M)"
        >
          <i aria-hidden>
            <b />
            <b />
            <b />
          </i>
          Sound
        </button>
        <button className={`chip ${labels ? 'on' : ''}`} onClick={() => set({ labels: !labels })} aria-pressed={labels}>
          Labels
        </button>
        <button className={`chip ${autoplay ? 'on' : ''}`} onClick={() => set({ autoplay: !autoplay })} aria-pressed={autoplay}>
          {autoplay ? 'Pause' : 'Auto tour'}
        </button>
      </div>
    </header>
  )
}

// ------------------------------------------------------------------ opening
function IntroCard() {
  const on = useHud((s) => s.stop === 'intro')
  const sound = useHud((s) => s.sound)
  return (
    <section className={`intro ${on ? 'on' : ''}`} aria-hidden={!on}>
      <p className="eyebrow">A scroll-driven flight · real-time 3D</p>
      <h1>
        Solar
        <br />
        System
      </h1>
      <p className="lede">
        One star, eight planets and {TOTAL_MOONS} moons — then through a wormhole to a black hole. Fly the whole way in a single take.
      </p>
      <div className="scroll-hint">
        <span />
        Scroll to launch
      </div>
      <button data-sound className={`sound-cta ${sound !== 'off' ? 'on' : ''}`} onClick={toggleSound} tabIndex={on ? 0 : -1}>
        <i aria-hidden>
          <b />
          <b />
          <b />
        </i>
        {sound === 'off' ? 'Turn the sound on' : sound === 'loading' ? 'Loading the score…' : 'Sound is on · press M to mute'}
        <em>Best with headphones</em>
      </button>
    </section>
  )
}

function OverviewCard() {
  const on = useHud((s) => s.stop === 'overview')
  return (
    <section className={`panel overview ${on ? 'on' : ''}`} aria-hidden={!on}>
      <p className="eyebrow">The neighbourhood</p>
      <h2 className="title small">Eight worlds, one star</h2>
      <p className="body">
        Everything here orbits the Sun, bound by its gravity. Four small rocky planets circle close in; beyond the asteroid belt lie two gas giants
        and two ice giants. Light needs just over four hours to cross from the Sun to Neptune.
      </p>
      <p className="body dim">
        Sizes and distances in this tour are compressed so the journey fits on a screen — at true scale, Earth would be a speck of dust 100 metres
        from a grapefruit-sized Sun.
      </p>
      <ul className="lineup">
        {PLANETS.map((p) => (
          <li key={p.id}>
            <button onClick={() => goTo(NAV_STOPS.find((s) => s.id === p.id)!.t)}>
              <i style={{ background: p.accent }} />
              <b>{p.name}</b>
              <span>{p.au.toFixed(2)} AU</span>
              <span>{p.moonCount} {p.moonCount === 1 ? 'moon' : 'moons'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ------------------------------------------------------------------ Sun + planets
function BodyPanel({ body }: { body: BodyDef }) {
  const on = useHud((s) => s.stop === body.id && s.mode === 'dwell')
  const tab = useHud((s) => (s.stop === body.id ? s.tab : 0))
  const side = body.kind === 'star' ? 'right' : 'left'
  const featured = (FEATURED[body.id] ?? []).map((id) => body.majorMoons.find((m) => m.id === id)!).filter(Boolean)
  const others = body.majorMoons.filter((m) => !featured.includes(m))
  const stop = NAV_STOPS.find((s) => s.id === body.id)!
  const dwellLen = body.moonCount > 0 ? 1.7 : body.kind === 'star' ? 1.5 : 1.4
  const start = stop.t - dwellLen * 0.18

  return (
    <section className={`panel body-panel ${side} ${on ? 'on' : ''}`} style={{ ['--accent' as string]: body.accent }} aria-hidden={!on}>
      <p className="eyebrow">
        <span className="idx">{body.index}</span>
        {body.type}
      </p>
      <h2 className="title">{body.name}</h2>
      <p className="tagline">{body.tagline}</p>

      <div className="tabs" role="tablist">
        <button className={tab === 0 ? 'on' : ''} onClick={() => goTo(start + dwellLen * 0.22)} role="tab" aria-selected={tab === 0}>
          <span>01</span> Overview
        </button>
        <button className={tab === 1 ? 'on' : ''} onClick={() => goTo(start + dwellLen * 0.72)} role="tab" aria-selected={tab === 1}>
          <span>02</span> {body.kind === 'star' ? 'Family' : 'Moons'} <em>{body.kind === 'star' ? '' : body.moonCount}</em>
        </button>
      </div>

      <div className="tab-stack">
        <div className={`tab-pane ${tab === 0 ? 'on' : ''}`}>
          {body.description.map((d, i) => (
            <p className="body" key={i}>
              {d}
            </p>
          ))}
          <dl className="facts">
            {body.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={`tab-pane ${tab === 1 ? 'on' : ''}`}>
          <p className="body">{body.moonsIntro}</p>
          {featured.length > 0 && (
            <ul className="moons">
              {featured.map((m) => (
                <li key={m.id}>
                  <h3>
                    {m.name}
                    <span>{Math.round(m.radiusKm * 2).toLocaleString('en-US')} km</span>
                  </h3>
                  <p>{m.blurb}</p>
                </li>
              ))}
            </ul>
          )}
          {(others.length > 0 || body.minorGroups.length > 0) && (
            <div className="more-moons">
              {others.length > 0 && (
                <p>
                  <b>Also in 3D:</b> {others.map((m) => m.name).join(' · ')}
                </p>
              )}
              {body.minorGroups.length > 0 && (
                <p className="groups">
                  {body.minorGroups.map((g) => (
                    <span key={g.name} title={g.note}>
                      {g.name} <i>{g.items ? g.items.length : g.count}</i>
                    </span>
                  ))}
                </p>
              )}
              {body.provisional ? (
                <p className="dim">
                  {body.moonCount - body.provisional} moons are named; {body.provisional} still carry provisional designations. Count as of {MOON_TALLY_DATE}.
                </p>
              ) : null}
            </div>
          )}
          {body.kind === 'star' && (
            <dl className="facts">
              <div><dt>Planets</dt><dd>8</dd></div>
              <div><dt>Known moons</dt><dd>{TOTAL_MOONS}</dd></div>
              <div><dt>Dwarf planets</dt><dd>5 recognised</dd></div>
              <div><dt>Share of all mass</dt><dd>99.86 %</dd></div>
            </dl>
          )}
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ between stops
const LEG_NOTES: Record<string, string> = {
  sun: 'Diving towards the centre of the system',
  mercury: 'Skimming the solar corona',
  jupiter: 'Crossing the asteroid belt — millions of rocky leftovers that never became a planet',
  saturn: 'Out among the giants, sunlight is 30 times weaker than at Earth',
  uranus: 'The gap between planets is now wider than the whole inner Solar System',
  neptune: 'From here the Sun is only the brightest star in the sky',
  wormhole: 'Into the Kuiper belt, the icy outskirts where Pluto lives',
}

function TravelCaption() {
  const stop = useHud((s) => s.stop)
  const on = useHud((s) => s.mode === 'travel')
  const list = [...BODIES.map((b) => ({ id: b.id, name: b.name, au: b.au })), { id: 'wormhole', name: 'the wormhole', au: WORMHOLE.au }]
  const i = list.findIndex((b) => b.id === stop)
  const target = list[i]
  const prev = list[i - 1]
  const gap = target && prev ? Math.abs(target.au - prev.au) * KM_PER_AU : 0
  return (
    <div className={`travel ${on && target ? 'on' : ''}`} aria-hidden={!on}>
      {target && (
        <>
          <p className="eyebrow">En route</p>
          <p className="dest">
            {prev ? <span>{prev.name}</span> : <span>Overview</span>}
            <i />
            <b>{target.name}</b>
          </p>
          {gap > 0 && (
            <p className="gap">
              {gap >= 1000 ? `${(gap / 1000).toFixed(2)} billion km` : `${Math.round(gap)} million km`} between their orbits · {(gap / 17.987).toFixed(0)} light-minutes
            </p>
          )}
          {LEG_NOTES[stop] && <p className="note">{LEG_NOTES[stop]}</p>}
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ wormhole + black hole
function WormholePanel() {
  const on = useHud((s) => s.stop === 'wormhole' && s.mode === 'dwell')
  const tab = useHud((s) => s.tab)
  return (
    <section className={`panel wormhole-panel ${on ? 'on' : ''}`} style={{ ['--accent' as string]: WORMHOLE.accent }} aria-hidden={!on}>
      <p className="eyebrow">
        <span className="idx">{WORMHOLE.index}</span>
        Einstein–Rosen bridge · hypothetical
      </p>
      <h2 className="title">Wormhole</h2>
      <p className="tagline">A shortcut through spacetime that the equations allow</p>
      <div className="tab-stack">
        <div className={`tab-pane ${tab === 0 ? 'on' : ''}`}>
          <p className="body">
            General relativity permits a tunnel joining two distant regions of space. From outside, its mouth would not look like a funnel but like a
            sphere — a crystal ball holding a warped image of the sky on the far side, ringed by our own stars bent around it.
          </p>
          <dl className="facts">
            <div><dt>First described</dt><dd>Einstein &amp; Rosen, 1935</dd></div>
            <div><dt>Traversable model</dt><dd>Morris &amp; Thorne, 1988</dd></div>
            <div><dt>Needs</dt><dd>Negative-energy matter</dd></div>
            <div><dt>Observed</dt><dd>Never — so far</dd></div>
          </dl>
        </div>
        <div className={`tab-pane ${tab === 1 ? 'on' : ''}`}>
          <p className="body">
            The disc in front of us is the whole sky of another galaxy, squeezed tighter towards the rim. To hold such a throat open would take
            “exotic” matter with negative energy density — nothing we know how to make.
          </p>
          <p className="body dim">Everything up to this point was real. From here on the tour follows the physics into the unknown.</p>
        </div>
      </div>
    </section>
  )
}

function TunnelCaption() {
  const on = useHud((s) => s.stop === 'tunnel')
  return (
    <div className={`travel tunnel-cap ${on ? 'on' : ''}`} aria-hidden={!on}>
      <p className="eyebrow">Transit</p>
      <p className="dest">
        <span>Solar System</span>
        <i />
        <b>another galaxy</b>
      </p>
      <p className="note">Inside the throat, the light of both skies is dragged into streaks along the walls</p>
    </div>
  )
}

function ArrivalPanel() {
  const on = useHud((s) => s.stop === 'arrival')
  return (
    <section className={`panel arrival ${on ? 'on' : ''}`} style={{ ['--accent' as string]: BLACKHOLE.accent }} aria-hidden={!on}>
      <p className="eyebrow">Arrival</p>
      <h2 className="title small">The heart of another galaxy</h2>
      <p className="body">
        We have come out near a galactic core, where stars are packed thousands of times more densely than around the Sun. Almost every large
        galaxy keeps the same thing at its centre — and the glowing ring ahead is this one’s.
      </p>
    </section>
  )
}

function BlackHolePanel() {
  const on = useHud((s) => s.stop === 'blackhole')
  return (
    <section className={`panel body-panel left ${on ? 'on' : ''}`} style={{ ['--accent' as string]: BLACKHOLE.accent }} aria-hidden={!on}>
      <p className="eyebrow">
        <span className="idx">{BLACKHOLE.index}</span>
        Supermassive black hole
      </p>
      <h2 className="title">Black Hole</h2>
      <p className="tagline">Where gravity closes the door on light</p>
      <p className="body">
        A black hole is a region where so much mass is packed so tightly that nothing — not even light — can climb back out. Its edge, the event
        horizon, is not a surface but a point of no return.
      </p>
      <p className="body">
        The hole itself is invisible. What shines is the accretion disc: gas spiralling inward at a large fraction of the speed of light, heated by
        friction to millions of degrees.
      </p>
      <dl className="facts">
        <div><dt>Horizon radius</dt><dd>rₛ = 2GM / c²</dd></div>
        <div><dt>Photon sphere</dt><dd>1.5 rₛ</dd></div>
        <div><dt>Shadow</dt><dd>≈ 2.6 rₛ</dd></div>
        <div><dt>Last stable orbit</dt><dd>3 rₛ</dd></div>
        <div><dt>Milky Way’s own</dt><dd>Sagittarius A*</dd></div>
        <div><dt>Its mass</dt><dd>4.3 million Suns</dd></div>
        <div><dt>First image</dt><dd>M87*, 2019</dd></div>
        <div><dt>Model shown</dt><dd>Non-rotating</dd></div>
      </dl>
    </section>
  )
}

function AnatomyPanel() {
  const on = useHud((s) => s.stop === 'anatomy')
  return (
    <section className={`panel body-panel left anatomy ${on ? 'on' : ''}`} style={{ ['--accent' as string]: BLACKHOLE.accent }} aria-hidden={!on}>
      <p className="eyebrow">
        <span className="idx">{BLACKHOLE.index}</span>
        What you are seeing
      </p>
      <h2 className="title small">Light, bent</h2>
      <ul className="moons">
        <li>
          <h3>The shadow</h3>
          <p>Any light aimed inside 2.6 horizon radii is captured. The dark disc is that capture zone, not the horizon itself.</p>
        </li>
        <li>
          <h3>The arch over the top</h3>
          <p>That is the far side of the disc. Its light is bent up and over the hole, so we see behind it — above and below at once.</p>
        </li>
        <li>
          <h3>The thin inner ring</h3>
          <p>Photons that circled the hole once or more before escaping, stacked into a razor-thin ring at the shadow’s edge.</p>
        </li>
        <li>
          <h3>One side brighter</h3>
          <p>Gas rushing towards us at up to 40 % of light-speed is beamed and blue-shifted; the receding side is dimmed and reddened.</p>
        </li>
        <li>
          <h3>Slow time</h3>
          <p>Clocks run slower the deeper you sit in gravity. The read-out above shows how much, for a ship hovering at our distance.</p>
        </li>
      </ul>
    </section>
  )
}

function Outro() {
  const on = useHud((s) => s.stop === 'outro')
  return (
    <section className={`panel outro ${on ? 'on' : ''}`} aria-hidden={!on}>
      <p className="eyebrow">End of the line</p>
      <h2 className="title small">Journey complete</h2>
      <p className="body">
        From the Sun to Neptune is 4.5 billion km — and everything on this tour except the last leap is really out there, tonight, overhead.
      </p>
      <div className="outro-actions">
        <button className="cta" onClick={() => jumpTo(0)}>
          Fly it again
        </button>
        <button className="chip" onClick={() => goTo(NAV_STOPS.find((s) => s.id === 'earth')!.t)}>
          Take me home
        </button>
      </div>
      <p className="credits">
        Imagery: NASA / JPL-Caltech / USGS / ESO maps via Solar System Scope, Planet Pixel Emporium, Stellarium and three.js. Moon counts: IAU Minor
        Planet Center, {MOON_TALLY_DATE}.
      </p>
    </section>
  )
}

// ------------------------------------------------------------------ labels pinned to bodies
function LabelLayer() {
  const items: { id: string; text: string; kind: string }[] = [
    { id: 'sun', text: 'Sun', kind: 'planet' },
    ...PLANETS.map((p) => ({ id: p.id, text: p.name, kind: 'planet' })),
    ...PLANETS.flatMap((p) => p.majorMoons.map((m) => ({ id: `moon:${m.id}`, text: m.name, kind: 'moon' }))),
  ]
  useEffect(
    () => () => {
      for (const k in labelEls) delete labelEls[k]
    },
    [],
  )
  return (
    <div className="labels" aria-hidden>
      {items.map((it) => (
        <div key={it.id} className={`label ${it.kind}`} ref={(el) => void (labelEls[it.id] = el)}>
          <i />
          {it.text}
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ progress rail
function ProgressRail() {
  const stop = useHud((s) => s.stop)
  const fill = useRef<HTMLDivElement>(null)
  const n = NAV_STOPS.length
  const activeId = stop === 'intro' ? '' : stop === 'tunnel' ? 'wormhole' : ['arrival', 'anatomy', 'outro'].includes(stop) ? 'blackhole' : stop

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!fill.current) return
      // piecewise-linear: the rail is evenly spaced, the timeline is not
      const t = rt.t
      let x = 0
      if (t <= NAV_STOPS[0].t) x = 0
      else if (t >= NAV_STOPS[n - 1].t) x = 1
      else
        for (let i = 1; i < n; i++) {
          if (t <= NAV_STOPS[i].t) {
            x = (i - 1 + (t - NAV_STOPS[i - 1].t) / (NAV_STOPS[i].t - NAV_STOPS[i - 1].t)) / (n - 1)
            break
          }
        }
      fill.current.style.transform = `scaleX(${x.toFixed(4)})`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [n])

  return (
    <nav className="rail" aria-label="Tour stops">
      <div className="rail-line">
        <div className="rail-fill" ref={fill} />
      </div>
      <ol>
        {NAV_STOPS.map((s, i) => (
          <li key={s.id} className={s.id === activeId ? 'on' : ''} style={{ left: `${(i / (n - 1)) * 100}%`, ['--accent' as string]: s.accent }}>
            <button onClick={() => goTo(s.t)} aria-current={s.id === activeId}>
              <i />
              <span>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="rail-end" aria-hidden>
        {Math.round(TOTAL)} screens · ← → to step · space for auto tour
      </div>
    </nav>
  )
}
