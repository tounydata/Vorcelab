import { useEffect, useRef, useState } from 'react'

const REDUCED = typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Anime une valeur numérique vers `target` (ease-out cubic, rAF).
 * Au montage : 0 → target ; si target change ensuite : ancienne → nouvelle.
 * prefers-reduced-motion : renvoie directement la cible, sans animation.
 */
export function useCountUp(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(REDUCED ? target : 0)
  const fromRef = useRef(REDUCED ? target : 0)

  useEffect(() => {
    if (REDUCED) { fromRef.current = target; setValue(target); return }
    const from = fromRef.current
    if (from === target) { setValue(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / durationMs)
      const eased = 1 - Math.pow(1 - k, 3)
      setValue(from + (target - from) * eased)
      if (k < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); fromRef.current = target }
  }, [target, durationMs])

  return value
}
