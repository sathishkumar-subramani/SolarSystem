import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useHud } from '../tour/store'

/** Covers the stage until every texture and the ship have arrived. */
export function Loader() {
  const { progress, active, total } = useProgress()
  const set = useHud((s) => s.set)
  const warm = useHud((s) => s.warm)
  const [gone, setGone] = useState(false)
  const shown = useRef(0)
  const [pct, setPct] = useState(0)

  // never let the bar run backwards while new files are discovered
  useEffect(() => {
    shown.current = Math.max(shown.current, progress)
    setPct(Math.round(shown.current))
  }, [progress])

  const done = !active && total > 0 && progress >= 100 && warm
  useEffect(() => {
    if (!done) return
    const a = setTimeout(() => set({ ready: true }), 350)
    const b = setTimeout(() => setGone(true), 1900)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [done, set])

  if (gone) return null
  return (
    <div className={`loader ${done ? 'done' : ''}`} role="status" aria-live="polite">
      <div className="loader-inner">
        <p className="eyebrow">Preparing the flight</p>
        <div className="loader-title">SOL</div>
        <div className="loader-bar">
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <p className="loader-pct">{String(pct).padStart(3, '0')} %</p>
      </div>
    </div>
  )
}
