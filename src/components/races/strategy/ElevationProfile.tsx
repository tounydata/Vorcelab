import { HEAT_COLORS, HEAT_NAMES, altAtKm, type ProfilePoint, type HeatLevel } from '../../../lib/raceStrategyView'

export interface ProfileSection { startKm: number; endKm: number; heat: HeatLevel }
export interface ProfileMarker {
  kind: 'start' | 'ravito' | 'finish' | 'wall'
  km: number; alt: number; t: string; label: string; sub?: string
}

interface Props {
  heightPx: number
  pts: ProfilePoint[]
  sections: ProfileSection[]
  markers: ProfileMarker[]
  totalKm: number
  passageHM: (km: number) => string
  markerMode?: 'full' | 'mini' | 'none'
  grid?: boolean
  interactive?: boolean
  onHover?: (km: number | null) => void
  cursorKm?: number | null
}

const VBW = 1000, VBH = 1000, Y_TOP = 90, Y_BASE = 1000

export default function ElevationProfile({
  heightPx, pts, sections, markers, totalKm, passageHM,
  markerMode = 'full', grid = true, interactive = false, onHover, cursorKm = null,
}: Props) {
  if (pts.length < 2) {
    return <div style={{ height: heightPx, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--vl-text-3)', fontSize: 12 }}>Profil indisponible</div>
  }
  let yMin = Infinity, yMax = -Infinity
  for (const p of pts) { yMin = Math.min(yMin, p.alt); yMax = Math.max(yMax, p.alt) }
  yMin = Math.floor((yMin - 18) / 50) * 50
  yMax = Math.ceil((yMax + 28) / 50) * 50
  const xv = (km: number) => (km / totalKm) * VBW
  const yv = (alt: number) => Y_TOP + ((yMax - alt) / Math.max(1, yMax - yMin)) * (Y_BASE - Y_TOP)
  const xPct = (km: number) => (km / totalKm) * 100
  const yPct = (alt: number) => (yv(alt) / VBH) * 100

  const secAlt = (km: number) => altAtKm(km, pts)
  function sectionAreaPath(sec: ProfileSection): string {
    const inner = pts.filter((p) => p.km >= sec.startKm - 1e-6 && p.km <= sec.endKm + 1e-6)
    const all = [{ km: sec.startKm, alt: secAlt(sec.startKm) }, ...inner, { km: sec.endKm, alt: secAlt(sec.endKm) }]
    let d = `M ${xv(all[0].km).toFixed(1)} ${Y_BASE}`
    for (const p of all) d += ` L ${xv(p.km).toFixed(1)} ${yv(p.alt).toFixed(1)}`
    d += ` L ${xv(all[all.length - 1].km).toFixed(1)} ${Y_BASE} Z`
    return d
  }
  function sectionLinePath(sec: ProfileSection): string {
    const inner = pts.filter((p) => p.km >= sec.startKm - 1e-6 && p.km <= sec.endKm + 1e-6)
    const all = [{ km: sec.startKm, alt: secAlt(sec.startKm) }, ...inner, { km: sec.endKm, alt: secAlt(sec.endKm) }]
    return all.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xv(p.km).toFixed(1)} ${yv(p.alt).toFixed(1)}`).join(' ')
  }

  const altLines: number[] = []
  for (let a = yMin; a <= yMax; a += 100) altLines.push(a)
  const distTicks = [0, ...[5, 10, 15, 20].filter((t) => t < totalKm - 1), totalKm]
  const wall = markers.find((m) => m.kind === 'wall')

  return (
    <div style={{ position: 'relative', width: '100%', height: heightPx }}>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="vlfade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--vl-bg)" stopOpacity={0} />
            <stop offset="100%" stopColor="var(--vl-bg)" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        {sections.map((sec, i) => <path key={i} d={sectionAreaPath(sec)} fill={HEAT_COLORS[sec.heat]} fillOpacity={0.92} />)}
        <rect x={0} y={0} width={VBW} height={VBH} fill="url(#vlfade)" />
        {sections.map((sec, i) => (
          <path key={'c' + i} d={sectionLinePath(sec)} fill="none" stroke={HEAT_COLORS[sec.heat]} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ filter: 'brightness(1.15)' }} />
        ))}
      </svg>

      {/* overlay net */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {grid && altLines.map((a) => (
          <div key={a} style={{ position: 'absolute', left: 0, right: 0, top: yPct(a) + '%', borderTop: '1px solid var(--vl-line)' }}>
            <span className="mono" style={{ position: 'absolute', left: 0, top: -7, fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>{a}m</span>
          </div>
        ))}
        {grid && distTicks.map((t, i) => (
          <div key={'d' + i} style={{ position: 'absolute', bottom: 4, left: xPct(t) + '%', transform: 'translateX(-50%)' }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>{(Number.isInteger(t) ? t : t.toFixed(1)) + (i === distTicks.length - 1 ? ' KM' : '')}</span>
          </div>
        ))}

        {/* callout pente raide */}
        {wall && (
          <div style={{ position: 'absolute', left: xPct(wall.km) + '%', top: yPct(wall.alt) + '%', transform: 'translate(-50%,-100%)', marginTop: -10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ padding: '3px 8px', borderRadius: 7, background: '#d1583a', color: '#fff', fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', whiteSpace: 'nowrap', boxShadow: '0 6px 18px -6px #d1583a' }}>
              ▲ PENTE RAIDE{wall.sub ? ' · ' + wall.sub.split('·')[0].trim() : ''}
            </div>
            <div style={{ width: 1.5, height: 14, background: '#d1583a' }} />
          </div>
        )}

        {/* fanions */}
        {markerMode === 'full' && markers.filter((m) => m.kind !== 'wall').map((m, i) => (
          <MarkerPill key={i} m={m} xPct={xPct} yPct={yPct} />
        ))}
        {markerMode === 'mini' && markers.filter((m) => m.kind !== 'wall').map((m, i) => {
          const c = m.kind === 'finish' ? 'var(--vl-growth-2)' : m.kind === 'start' ? 'var(--vl-ember)' : 'var(--vl-text-2)'
          return <div key={i} style={{ position: 'absolute', left: xPct(m.km) + '%', top: yPct(m.alt) + '%', transform: 'translate(-50%,-50%)', width: 7, height: 7, borderRadius: 999, background: c, border: '2px solid var(--vl-bg)', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }} />
        })}
      </div>

      {/* capture + curseur synchronisé */}
      {interactive && (
        <div
          style={{ position: 'absolute', inset: 0, cursor: 'crosshair', zIndex: 5 }}
          onMouseMove={(ev) => {
            const r = ev.currentTarget.getBoundingClientRect()
            const x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))
            onHover?.(x * totalKm)
          }}
          onMouseLeave={() => onHover?.(null)}
          onTouchMove={(ev) => {
            const r = ev.currentTarget.getBoundingClientRect()
            const x = Math.max(0, Math.min(1, (ev.touches[0].clientX - r.left) / r.width))
            onHover?.(x * totalKm)
          }}
          onTouchEnd={() => onHover?.(null)}
        />
      )}
      {cursorKm != null && (() => {
        const alt = secAlt(cursorKm)
        const left = xPct(cursorKm), top = yPct(alt)
        const sec = sections.find((s) => cursorKm >= s.startKm && cursorKm <= s.endKm) ?? sections[sections.length - 1]
        const hc = HEAT_COLORS[sec?.heat ?? 1]
        const flip = left > 68
        return (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
            <div style={{ position: 'absolute', left: left + '%', top: 0, bottom: 18, width: 1, background: 'var(--vl-text-2)', opacity: .5 }} />
            <div style={{ position: 'absolute', left: left + '%', top: top + '%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: 999, background: hc, border: '2px solid var(--vl-bg)', boxShadow: `0 0 0 4px color-mix(in srgb, ${hc} 26%, transparent)` }} />
            <div style={{ position: 'absolute', left: left + '%', top: 6, transform: flip ? 'translateX(-100%)' : 'none', marginLeft: flip ? -10 : 10, background: 'var(--vl-surf)', border: '1px solid var(--vl-line-2)', borderRadius: 10, padding: '8px 11px', boxShadow: '0 10px 30px -10px rgba(0,0,0,.6)', whiteSpace: 'nowrap' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="display tnum" style={{ fontSize: 22, color: 'var(--vl-growth-2)', lineHeight: 1 }}>{passageHM(cursorKm)}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--vl-text-3)' }}>PASSAGE</span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--vl-text-2)' }}>KM {cursorKm.toFixed(1)}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--vl-text-2)' }}>{Math.round(alt)} M</span>
                <span className="mono" style={{ fontSize: 10.5, color: hc, fontWeight: 700 }}>{HEAT_NAMES[sec?.heat ?? 1].toUpperCase()}</span>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function MarkerPill({ m, xPct, yPct }: { m: ProfileMarker; xPct: (km: number) => number; yPct: (alt: number) => number }) {
  const isStart = m.kind === 'start', isFinish = m.kind === 'finish'
  const accent = isFinish ? 'var(--vl-growth-2)' : isStart ? 'var(--vl-ember)' : 'var(--vl-text-1, var(--vl-text))'
  const dotBg = isFinish ? 'var(--vl-growth-2)' : isStart ? 'var(--vl-ember)' : 'var(--vl-surf)'
  return (
    <div style={{ position: 'absolute', left: xPct(m.km) + '%', top: 0, bottom: 0, transform: 'translateX(-50%)', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginTop: 6, padding: '5px 9px 5px 7px', borderRadius: 999, transform: isFinish ? 'translateX(-34%)' : isStart ? 'translateX(34%)' : 'none', background: 'var(--vl-surf)', border: '1px solid var(--vl-line-2)', boxShadow: '0 6px 18px -8px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: dotBg, flex: '0 0 auto', boxShadow: (isFinish || isStart) ? `0 0 0 3px color-mix(in srgb, ${isFinish ? 'var(--vl-growth-2)' : 'var(--vl-ember)'} 22%, transparent)` : 'none' }} />
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--vl-text-2)', letterSpacing: '.12em', fontWeight: 600 }}>{isStart ? 'DÉP' : isFinish ? 'ARR' : 'R' + m.km}</span>
        <span className="tnum" style={{ fontFamily: 'var(--vl-mono)', fontSize: 11.5, fontWeight: 700, color: accent }}>{m.t}</span>
      </div>
      <div style={{ position: 'absolute', top: 32, width: 1.5, height: `calc(${yPct(m.alt)}% - 32px)`, background: `linear-gradient(var(--vl-line-2), ${isFinish ? 'var(--vl-growth-2)' : isStart ? 'var(--vl-ember)' : 'var(--vl-text-3)'})` }} />
      <div style={{ position: 'absolute', left: '50%', top: yPct(m.alt) + '%', transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: 999, background: dotBg, border: '2px solid var(--vl-bg)' }} />
    </div>
  )
}
