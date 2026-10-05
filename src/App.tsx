import { useCallback, useEffect, useState } from 'react'
import { Experience } from './scene/Experience'
import { SCREEN, startScroll } from './tour/scroll'
import { useHud } from './tour/store'
import { TOTAL } from './tour/timeline'
import { Hud } from './ui/Hud'
import { Loader } from './ui/Loader'

/** render-quality ladder; the performance monitor moves up and down it */
const TIERS = [
  { dpr: 0.75, msaa: 0 },
  { dpr: 1, msaa: 0 },
  { dpr: 1.25, msaa: 2 },
  { dpr: 1.5, msaa: 4 },
]

export function App() {
  const maxTier = Math.min(TIERS.length - 1, window.devicePixelRatio > 1.2 ? 3 : 2)
  const [tier, setTier] = useState(() => {
    const q = new URLSearchParams(location.search).get('q')
    return q ? Math.min(Math.max(parseInt(q, 10), 0), TIERS.length - 1) : maxTier
  })
  const onDecline = useCallback(() => setTier((t) => Math.max(0, t - 1)), [])
  const onIncline = useCallback(() => setTier((t) => Math.min(maxTier, t + 1)), [maxTier])

  useEffect(() => startScroll(), [])

  const q = TIERS[tier]
  // the black hole traces ~150 light-path steps per pixel: keep it at 1x resolution at most
  const heavy = useHud((s) => s.heavy)
  const dpr = Math.min(heavy ? Math.min(q.dpr, 1) : q.dpr, window.devicePixelRatio || 1)
  return (
    <>
      <Experience dpr={dpr} multisampling={q.msaa} onDecline={onDecline} onIncline={onIncline} />
      <Hud />
      <Loader />
      {/* the page is only a scroll track; everything visible is fixed on top of it */}
      <div className="scroll-track" style={{ height: `${TOTAL * SCREEN * 100 + 100}vh` }} aria-hidden />
    </>
  )
}
