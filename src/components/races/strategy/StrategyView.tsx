import { useState, useMemo } from 'react'
import type { ProjectionResult, GpxPoint } from '../../../lib/computeRaceProjection'
import type { RaceConditions, WeatherImpact } from '../../../lib/raceWeather'
import type { NutritionRow } from '../../../lib/nutritionPlan'
import type { RavitoPoint } from '../../../lib/crewPlan'
import ElevationProfile, { type ProfileMarker, type ProfileSection } from './ElevationProfile'
import {
  HEAT_COLORS, HEAT_NAMES, sectionHeat, profilePoints, elapsedSecAtKm, fmtHM, altAtKm,
} from '../../../lib/raceStrategyView'
import { surfaceInfo } from '../../../lib/terrain'
import { fitBounds, toPixel, tileGrid } from '../../../lib/staticMap'
import { hav } from '../../../lib/gpxCore'

interface RaceMeta {
  name: string; date: string; type?: string | null
  goal_time?: string | null; start_time?: string | null
}
interface Props {
  projection: ProjectionResult
  race: RaceMeta
  athleteName: string
  nutritionRows: NutritionRow[]
  ravitos: RavitoPoint[]
  forecast: RaceConditions | null
  weather: WeatherImpact | null
}

// ── petits atomes ─────────────────────────────────────────────────────────────
function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--vl-text-3)', fontWeight: 500, ...style }}>{children}</div>
}
function Ico({ name, c = 'var(--vl-text-2)', s = 14 }: { name: string; c?: string; s?: number }) {
  const cm = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'temp') return <svg {...cm}><path d="M12 3v11" /><circle cx={12} cy={17} r={3.4} /></svg>
  if (name === 'wind') return <svg {...cm}><path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M3 13h15a3 3 0 1 1-3 3" /></svg>
  if (name === 'moon') return <svg {...cm}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
  if (name === 'up') return <svg {...cm}><path d="M4 18 L12 6 L20 18" /></svg>
  if (name === 'down') return <svg {...cm}><path d="M4 6 L12 18 L20 6" /></svg>
  if (name === 'drop') return <svg {...cm}><path d="M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z" /></svg>
  if (name === 'alert') return <svg {...cm}><path d="M12 4 L21 19 H3 Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
  if (name === 'check') return <svg {...cm}><path d="M4 12.5 L10 18 L20 5" /></svg>
  return null
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 999, border: '1px solid var(--vl-line)', background: 'var(--vl-surf)', fontFamily: 'var(--vl-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--vl-text-2)', whiteSpace: 'nowrap' }}>{children}</span>
}
function StatTile({ value, unit, label, accent = 'var(--vl-text)' }: { value: React.ReactNode; unit?: string; label: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, whiteSpace: 'nowrap', lineHeight: 1 }}>
        <span className="display tnum" style={{ fontSize: 38, color: accent, fontWeight: 600, lineHeight: .82 }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)', lineHeight: 1, marginBottom: 4 }}>{unit}</span>}
      </div>
    </div>
  )
}
function Confidence({ level }: { level: number }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ width: 7, height: 16, borderRadius: 3, background: i < level ? 'var(--vl-growth-2)' : 'var(--vl-surf-3)', boxShadow: i < level ? '0 0 10px -2px var(--vl-growth-2)' : 'none' }} />
      ))}
    </div>
  )
}

export default function StrategyView({ projection: p, race, athleteName, nutritionRows, ravitos, forecast, weather }: Props) {
  const [hoverKm, setHoverKm] = useState<number | null>(null)
  const totalKm = p.totalDistM / 1000

  const pts = useMemo(() => profilePoints(p), [p])
  // Effort peint au MICRO-TRONÇON (~150 m) : colle au terrain réel au lieu d'une couleur
  // par grosse section. Seuls les bouts vraiment en lacets (≥250 °/km) montent en « Dur ».
  const heatSections: ProfileSection[] = useMemo(() => {
    const segs = p.microSegments?.length
      ? p.microSegments.map((m) => ({
          startKm: m.startKm, endKm: m.endKm,
          heat: (m.type === 'down' && m.turnDegPerKm >= 250 ? Math.max(sectionHeat(m), 3) : sectionHeat(m)) as ProfileSection['heat'],
        }))
      : p.sections.map((s) => ({ startKm: s.startKm, endKm: s.endKm, heat: sectionHeat(s) as ProfileSection['heat'] }))
    // fusionne les tronçons consécutifs de même effort (SVG plus propre)
    const merged: ProfileSection[] = []
    for (const seg of segs) {
      const last = merged[merged.length - 1]
      if (last && last.heat === seg.heat) last.endKm = seg.endKm
      else merged.push({ ...seg })
    }
    return merged
  }, [p])
  const passageHM = (km: number) => fmtHM(elapsedSecAtKm(km, p) / 60)

  // montée la plus raide (pente raide) & descente la plus favorable
  const ups = p.sections.filter((s) => s.type === 'up')
  const downs = p.sections.filter((s) => s.type === 'down')
  const wallSec = ups.length ? ups.reduce((a, b) => (b.grade > a.grade ? b : a)) : null
  const recovSec = downs.length ? downs.reduce((a, b) => (b.dminus > a.dminus ? b : a)) : null

  const markers: ProfileMarker[] = useMemo(() => {
    const m: ProfileMarker[] = [{ kind: 'start', km: 0, alt: altAtKm(0, pts), t: '0h00', label: 'Départ' }]
    ravitos.filter((r) => r.km > 0.5 && r.km < totalKm - 0.5).forEach((r) =>
      m.push({ kind: 'ravito', km: r.km, alt: altAtKm(r.km, pts), t: passageHM(r.km), label: r.label }))
    if (wallSec) {
      const km = (wallSec.startKm + wallSec.endKm) / 2
      m.push({ kind: 'wall', km, alt: altAtKm(km, pts), t: passageHM(km), label: 'Pente raide', sub: `${Math.round(wallSec.grade)}% · km ${wallSec.startKm.toFixed(1)}` })
    }
    m.push({ kind: 'finish', km: totalKm, alt: altAtKm(totalKm, pts), t: fmtHM(p.estTimeS / 60), label: 'Arrivée' })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, ravitos, totalKm, wallSec, p])

  const hasRoute = p.points && p.points.length >= 2
  const confLevel = p.confidence === 'good' ? 5 : p.confidence === 'medium' ? 3 : 2
  const dplus = Math.round(p.dplus), dminus = Math.round(p.dminus)
  const mPerKm = Math.round(dplus / Math.max(1, totalKm))
  const profileLabel = mPerKm > 40 ? 'Montagneux' : mPerKm > 20 ? 'Vallonné' : 'Roulant'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 6px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <Eyebrow>PLAN DE COURSE · {athleteName.toUpperCase()}</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: 6, flexWrap: 'wrap' }}>
              <span className="display tnum" style={{ fontSize: 82, color: 'var(--vl-growth-2)', lineHeight: .82 }}>{fmtHM(p.estTimeS / 60)}</span>
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--vl-text-2)', letterSpacing: '.18em' }}>TEMPS CIBLE</div>
                <div style={{ marginTop: 9 }}><Confidence level={confLevel} /></div>
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--vl-text-3)', marginTop: 7 }}>CONFIANCE {p.confidence === 'good' ? 'BONNE' : p.confidence === 'medium' ? 'MOYENNE' : 'À CONFIRMER'}</div>
              </div>
            </div>
          </div>
          <div style={{ width: 320, flex: '1 1 280px', maxWidth: 360 }}><ScenarioBand p={p} weather={weather} /></div>
        </div>

        <div className="strat-hero-grid" style={{ padding: '6px 18px 12px', display: 'flex', gap: 16, alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ElevationProfile heightPx={300} pts={pts} sections={heatSections} markers={markers} totalKm={totalKm} passageHM={passageHM} interactive onHover={setHoverKm} cursorKm={hoverKm} />
          </div>
          {hasRoute && <div className="strat-hero-map" style={{ flex: '0 0 290px' }}><RouteMap points={p.points} markers={markers} cursorKm={hoverKm} totalKm={totalKm} heightPx={300} /></div>}
        </div>

        <div style={{ padding: '0 24px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--vl-text-3)', letterSpacing: '.16em' }}>EFFORT</span>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 6, borderRadius: 2, background: HEAT_COLORS[i] }} />
              <span className="mono" style={{ fontSize: 10, color: 'var(--vl-text-2)' }}>{HEAT_NAMES[i].toUpperCase()}</span>
            </span>
          ))}
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 10, color: 'var(--vl-text-3)' }}>FANIONS = HEURE DE PASSAGE</span>
        </div>
      </div>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <div className="strat-stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
        <StatTile value={totalKm.toFixed(1)} unit="KM" label="DISTANCE" />
        <StatTile value={'+' + dplus} label="DÉNIVELÉ +" accent="var(--vl-growth)" />
        <StatTile value={'−' + dminus} label="DÉNIVELÉ −" accent="var(--vl-text-2)" />
        <StatTile value={Math.round(p.altMax)} unit="M" label="ALT. MAX" />
        <StatTile value={mPerKm} unit="M/KM" label={'RAIDEUR · ' + profileLabel.toUpperCase()} accent="var(--vl-ember)" />
      </div>

      {/* ── KEY CARDS ────────────────────────────────────────────────────── */}
      <div className="strat-keycards" style={{ display: 'flex', gap: 16 }}>
        {wallSec && <KeyCard variant="risk" sec={wallSec} passageHM={passageHM} />}
        {recovSec && <KeyCard variant={recovSec.technical ? 'technical' : 'recovery'} sec={recovSec} passageHM={passageHM} />}
      </div>

      {/* ── CONDITIONS ───────────────────────────────────────────────────── */}
      {forecast?.available && (
        <ConditionsBlock p={p} race={race} forecast={forecast} weather={weather} />
      )}

      {/* ── SECTIONS CLÉS ────────────────────────────────────────────────── */}
      <KeySections p={p} ravitos={ravitos} />

      {/* ── ACCORDÉONS ───────────────────────────────────────────────────── */}
      <Accordion label="PLAN DE COURSE — TOUTES LES SECTIONS" meta={`${p.sections.length} SECTIONS`}>
        <AllSectionsTable p={p} passageHM={passageHM} />
      </Accordion>
      <Accordion label="PLAN NUTRITION" meta={`${nutritionRows.length} PRISES`}>
        <NutritionTable rows={nutritionRows} />
      </Accordion>
    </div>
  )
}

// ── ScenarioBand ──────────────────────────────────────────────────────────────
function ScenarioBand({ p, weather }: { p: ProjectionResult; weather: WeatherImpact | null }) {
  const lo = p.timeMin, hi = p.timeMax
  const span = Math.max(1, hi - lo)
  const pos = (s: number) => Math.max(0, Math.min(100, ((s - lo) / span) * 100))
  const pTarget = pos(p.estTimeS)
  const weatherS = weather ? p.estTimeS * weather.factor : null
  const pW = weatherS != null ? pos(weatherS) : null
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div><div className="display tnum" style={{ fontSize: 18, color: 'var(--vl-growth-2)' }}>{fmtHM(lo / 60)}</div><div className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)', marginTop: 2 }}>OPTIMISTE</div></div>
        <div style={{ textAlign: 'right' }}><div className="display tnum" style={{ fontSize: 18, color: 'var(--vl-status-over, #d1583a)' }}>{fmtHM(hi / 60)}</div><div className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)', marginTop: 2 }}>PRUDENT</div></div>
      </div>
      <div style={{ position: 'relative', height: 10, borderRadius: 999, background: 'linear-gradient(90deg, var(--vl-growth-2), var(--vl-amber) 55%, var(--vl-status-over, #d1583a))', opacity: .9 }}>
        <div style={{ position: 'absolute', left: pTarget + '%', top: '50%', transform: 'translate(-50%,-50%)', width: 18, height: 18, borderRadius: 999, background: 'var(--vl-bg)', border: '3px solid var(--vl-growth-2)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--vl-growth-2) 18%, transparent)' }} />
        {pW != null && <div style={{ position: 'absolute', left: pW + '%', top: '50%', transform: 'translate(-50%,-50%)', width: 11, height: 11, borderRadius: 999, background: 'var(--vl-ember)', border: '2px solid var(--vl-bg)' }} />}
      </div>
      <div style={{ position: 'relative', height: 30, marginTop: 6 }}>
        <div style={{ position: 'absolute', left: pTarget + '%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          <div className="display tnum" style={{ fontSize: 15, color: 'var(--vl-growth-2)', lineHeight: 1 }}>{fmtHM(p.estTimeS / 60)}</div>
          <div className="mono" style={{ fontSize: 8.5, color: 'var(--vl-text-3)', marginTop: 2 }}>CIBLE</div>
        </div>
        {pW != null && weatherS != null && (
          <div style={{ position: 'absolute', left: pW + '%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div className="display tnum" style={{ fontSize: 15, color: 'var(--vl-ember)', lineHeight: 1 }}>{fmtHM(weatherS / 60)}</div>
            <div className="mono" style={{ fontSize: 8.5, color: 'var(--vl-text-3)', marginTop: 2 }}>MÉTÉO +{weather!.totalPct}%</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── RouteMap (SVG stylisé depuis vraies coords GPX) ───────────────────────────
// Carte : tracé GPS sur fond de relief ombré (tuiles raster assemblées), aligné au pixel
// via une projection Web Mercator partagée (même centre/zoom pour les tuiles et le SVG). Le
// curseur reste synchronisé avec le profil. Sans clé de carte (env), fond sombre uni (repli).
const MAP_W = 300, MAP_H = 240
function RouteMap({ points, markers, cursorKm, totalKm, heightPx }: {
  points: GpxPoint[]; markers: ProfileMarker[]; cursorKm: number | null; totalKm: number; heightPx: number
}) {
  const geo = useMemo(() => {
    if (!points || points.length < 2) return null
    const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon)
    const center = fitBounds(Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats), MAP_W, MAP_H)
    const px = points.map((p) => toPixel(p.lon, p.lat, center, MAP_W, MAP_H))
    const d = px.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ')
    const cum = [0]
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + hav(points[i - 1], points[i]) / 1000)
    return { center, px, d, cum, grid: tileGrid(center, MAP_W, MAP_H) }
  }, [points])
  if (!geo) return null

  const pixelAtKm = (km: number) => {
    const target = Math.max(0, Math.min(totalKm, km))
    const { cum, px } = geo
    let i = 1; while (i < cum.length && cum[i] < target) i++
    if (i >= px.length) return px[px.length - 1]
    const a = px[i - 1], b = px[i]
    const t = (target - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }
  const cur = cursorKm != null ? pixelAtKm(cursorKm) : null
  const mk = markers.filter((m) => m.kind !== 'wall')
  const pctX = (x: number) => (x / MAP_W) * 100, pctY = (y: number) => (y / MAP_H) * 100

  return (
    <div style={{ background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: heightPx }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
        <Eyebrow>TRACÉ GPS</Eyebrow>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--vl-text-3)' }}>{totalKm.toFixed(1)} KM</span>
      </div>
      {/* aspect-ratio fixe = alignement image ↔ tracé garanti */}
      <div style={{ position: 'relative', width: 'calc(100% - 24px)', margin: '0 12px 12px', aspectRatio: `${MAP_W} / ${MAP_H}`, borderRadius: 'var(--vl-r-sm)', overflow: 'hidden', background: 'color-mix(in srgb, var(--vl-surf-2) 70%, var(--vl-bg))' }}>
        {geo.grid && (
          <>
            <div style={{ position: 'absolute', inset: 0, filter: 'brightness(0.62) saturate(0.78) contrast(1.06)' }}>
              {geo.grid.tiles.map((t, i) => (
                <img
                  key={i}
                  src={t.url}
                  alt=""
                  loading="lazy"
                  style={{ position: 'absolute', left: pctX(t.left) + '%', top: pctY(t.top) + '%', width: (t.size / MAP_W) * 100 + '%', height: (t.size / MAP_H) * 100 + '%', objectFit: 'cover' }}
                />
              ))}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--vl-bg) 25%, transparent), color-mix(in srgb, var(--vl-bg) 60%, transparent))' }} />
          </>
        )}
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path d={geo.d} fill="none" stroke="var(--vl-bg)" strokeOpacity={0.55} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={geo.d} fill="none" stroke="var(--vl-ember)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {mk.map((m, i) => {
            const pt = pixelAtKm(m.km)
            const ring = m.kind === 'start' || m.kind === 'finish'
            const c = m.kind === 'finish' ? 'var(--vl-growth-2)' : m.kind === 'start' ? 'var(--vl-ember)' : 'var(--vl-text)'
            return (
              <div key={i} style={{ position: 'absolute', left: pctX(pt.x) + '%', top: pctY(pt.y) + '%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: ring ? 10 : 8, height: ring ? 10 : 8, borderRadius: 999, background: c, border: '2px solid var(--vl-bg)', boxShadow: ring ? `0 0 0 3px color-mix(in srgb, ${c} 30%, transparent)` : '0 1px 3px rgba(0,0,0,.6)' }} />
                <span className="mono" style={{ fontSize: 8.5, fontWeight: 700, color: c, textShadow: '0 1px 3px var(--vl-bg), 0 0 2px var(--vl-bg)', letterSpacing: '.04em' }}>{m.kind === 'start' ? 'DÉP' : m.kind === 'finish' ? 'ARR' : 'R' + m.km}</span>
              </div>
            )
          })}
          {cur && <div style={{ position: 'absolute', left: pctX(cur.x) + '%', top: pctY(cur.y) + '%', transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: 999, background: 'var(--vl-growth-2)', border: '2px solid var(--vl-bg)', boxShadow: '0 0 0 5px color-mix(in srgb, var(--vl-growth-2) 30%, transparent)' }} />}
        </div>
        <div style={{ position: 'absolute', top: 8, right: 9, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span className="mono" style={{ fontSize: 8, color: 'var(--vl-text-1, var(--vl-text))', fontWeight: 700, textShadow: '0 1px 2px var(--vl-bg)' }}>N</span>
          <svg width={9} height={11} viewBox="0 0 10 12" fill="none"><path d="M5 0 L9 11 L5 8 L1 11 Z" fill="var(--vl-ember)" /></svg>
        </div>
        {geo.grid?.attribution && (
          <span style={{ position: 'absolute', left: 6, bottom: 4, fontSize: 7.5, color: 'var(--vl-text-3)', textShadow: '0 1px 2px var(--vl-bg)', pointerEvents: 'none' }}>{geo.grid.attribution}</span>
        )}
      </div>
    </div>
  )
}

// ── KeyCard ───────────────────────────────────────────────────────────────────
function KeyCard({ variant, sec, passageHM }: { variant: 'risk' | 'recovery' | 'technical'; sec: { startKm: number; endKm: number; dplus: number; dminus: number; grade: number; technicalKm?: number }; passageHM: (km: number) => string }) {
  const isRisk = variant === 'risk'
  const isTech = variant === 'technical'
  const accent = isRisk ? 'var(--vl-status-over, #d1583a)' : isTech ? 'var(--vl-amber)' : 'var(--vl-growth)'
  const dist = (sec.endKm - sec.startKm).toFixed(1)
  const lacetsKm = sec.technicalKm != null ? sec.technicalKm.toFixed(1) : dist
  const title = isRisk
    ? `Montée la plus raide — ${Math.round(sec.grade)}% sur ${dist} km`
    : isTech
      ? `Descente — ${lacetsKm} km en lacets sur ${dist} km`
      : `Descente principale — ${dist} km favorables`
  const advice = isRisk
    ? 'Marche active recommandée. Ne brûle pas tes réserves ici.'
    : isTech
      ? 'Lacets serrés : freinage constant, pas d\'accélération franche. Anticipe les trajectoires, économise les quadriceps.'
      : 'Relâche les épaules, récupère le souffle. Gère l\'impact quadriceps.'
  const eyebrow = isRisk ? 'RISQUE · PENTE RAIDE' : isTech ? 'DESCENTE TECHNIQUE · LACETS' : 'RÉCUP · DESCENTE CLÉ'
  return (
    <div style={{ background: 'var(--vl-surf)', borderRadius: 'var(--vl-r-sm)', border: '1px solid var(--vl-line)', borderTop: '2px solid ' + accent, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Ico name={isRisk || isTech ? 'alert' : 'check'} c={accent} s={15} />
        <span className="mono" style={{ fontSize: 10.5, color: accent, fontWeight: 700, letterSpacing: '.14em' }}>{eyebrow}</span>
      </div>
      <div className="display" style={{ fontSize: 21, color: 'var(--vl-text)', lineHeight: 1.08 }}>{title}</div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-2)', letterSpacing: '.04em' }}>
        KM {sec.startKm.toFixed(1)} → {sec.endKm.toFixed(1)}  ·  {isRisk ? '+' + Math.round(sec.dplus) + ' D+' : '−' + Math.round(sec.dminus) + ' D−'}  ·  passage {passageHM((sec.startKm + sec.endKm) / 2)}
      </div>
      <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.5 }}>{advice}</div>
    </div>
  )
}

// ── ConditionsBlock ───────────────────────────────────────────────────────────
function ConditionsBlock({ p, race, forecast, weather }: { p: ProjectionResult; race: RaceMeta; forecast: RaceConditions; weather: WeatherImpact | null }) {
  const adj = weather ? p.estTimeS * weather.factor : p.estTimeS
  const pct = weather?.totalPct ?? 0
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>CONDITIONS LE JOUR J · J−{forecast.daysToRace}</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="display tnum" style={{ fontSize: 38, color: 'var(--vl-ember)' }}>{fmtHM(adj / 60)}</span>
            <span style={{ fontSize: 13, color: 'var(--vl-text-2)' }}>cible ajustée météo</span>
            {pct > 0 && <span className="mono" style={{ fontSize: 12, color: 'var(--vl-ember)', fontWeight: 600 }}>+{pct}%</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {forecast.tempC != null && <Chip><Ico name="temp" c="var(--vl-ember)" s={13} /><span>{Math.round(forecast.tempC)}°C</span></Chip>}
          {forecast.windKmh != null && <Chip><Ico name="wind" c="var(--vl-text-2)" s={13} /><span>VENT {Math.round(forecast.windKmh)} KM/H</span></Chip>}
          {forecast.isNight && <Chip><Ico name="moon" c="#8aa0c8" s={13} /><span>NUIT</span></Chip>}
          {forecast.precipMm != null && <Chip><span style={{ width: 7, height: 7, borderRadius: 999, background: forecast.precipMm > 0.5 ? '#8aa0c8' : 'var(--vl-growth)' }} /><span>{forecast.precipMm > 0.5 ? 'PLUIE' : 'SEC'}</span></Chip>}
        </div>
      </div>
      {race.goal_time && p.goalLabel && (
        <>
          <div style={{ height: 1, background: 'var(--vl-line)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--vl-text-2)', letterSpacing: '.08em' }}>OBJECTIF {race.goal_time.toUpperCase()}</span>
            <span style={{ padding: '3px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--vl-growth-2) 16%, transparent)', color: 'var(--vl-growth-2)', fontFamily: 'var(--vl-mono)', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em' }}>{p.goalLabel.toUpperCase()}</span>
            {p.goalCompareStr && <span style={{ fontSize: 13.5, color: 'var(--vl-text)' }}>{p.goalCompareStr}</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ── KeySections (top 3 par temps) ─────────────────────────────────────────────
function KeySections({ p, ravitos }: { p: ProjectionResult; ravitos: RavitoPoint[] }) {
  const top = p.sections
    .map((s, i) => ({ s, t: p.sectionTimes[i] ?? 0 }))
    .sort((a, b) => b.t - a.t).slice(0, 3)
    .sort((a, b) => a.s.startKm - b.s.startKm)
  return (
    <div className="card">
      <Eyebrow style={{ marginBottom: 6 }}>SECTIONS CLÉS</Eyebrow>
      {top.map(({ s, t }, i) => {
        const up = s.type === 'up'
        const heat = (s.technical ? Math.max(sectionHeat(s), 3) : sectionHeat(s))
        const nearRavito = ravitos.find((r) => Math.abs(r.km - s.startKm) < 2)
        const advice = up
          ? 'Effort maîtrisé — FC max 85%, cadence courte, bras actifs.'
          : s.technical
            ? 'Descente technique en lacets — freinage constant, anticipe les virages, économise les quadris.'
            : 'Descente roulante — récupération possible, relâche le haut du corps.'
        return (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: i < top.length - 1 ? '1px solid var(--vl-line)' : 'none' }}>
            <div style={{ flex: '0 0 56px', textAlign: 'center' }}>
              <div className="display tnum" style={{ fontSize: 26, color: HEAT_COLORS[heat], lineHeight: 1 }}>{(up ? '+' : '−') + Math.round(up ? s.dplus : s.dminus)}</div>
              <div className="mono" style={{ fontSize: 8.5, color: 'var(--vl-text-3)', marginTop: 3 }}>{up ? 'D+' : 'D−'}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                <Ico name={up ? 'up' : 'down'} c={HEAT_COLORS[heat]} s={14} />
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--vl-text)', fontWeight: 700, letterSpacing: '.08em' }}>{up ? 'MONTÉE' : s.technical ? 'DESCENTE TECHNIQUE' : 'DESCENTE'}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--vl-text-3)' }}>KM {s.startKm.toFixed(1)}→{s.endKm.toFixed(1)} · {(s.endKm - s.startKm).toFixed(1)} KM · {Math.round(t / 60)} MIN</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.5 }}>{advice}</div>
              {(s.surface || s.slip) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
                  {s.surface && <span className="mono" style={{ fontSize: 10, color: surfaceInfo(s.surface).col }}>{surfaceInfo(s.surface).fr}</span>}
                  {s.slip && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--vl-status-over, #d1583a)' }}><Ico name="alert" c="var(--vl-status-over, #d1583a)" s={12} />{s.slip}</span>}
                </div>
              )}
            </div>
            {nearRavito && (
              <div style={{ flex: '0 0 auto', alignSelf: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--vl-line)', fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-ember)' }}>
                  <Ico name="drop" c="var(--vl-ember)" s={12} />RAVITO ~{nearRavito.km} KM
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Accordion ─────────────────────────────────────────────────────────────────
function Accordion({ label, meta, children }: { label: string; meta?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', overflow: 'hidden' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--vl-surf-2)', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--vl-text)', letterSpacing: '.12em', fontWeight: 600 }}>{label}</span>
          {meta && <span className="mono" style={{ fontSize: 10.5, color: 'var(--vl-text-3)' }}>{meta}</span>}
        </div>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--vl-text-3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {open && <div style={{ padding: '8px 20px 18px' }}>{children}</div>}
    </div>
  )
}

function AllSectionsTable({ p, passageHM }: { p: ProjectionResult; passageHM: (km: number) => string }) {
  const GRID = '30px 1.5fr 1fr 0.8fr 0.8fr 1fr'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '6px 4px 10px', borderBottom: '1px solid var(--vl-line)', minWidth: 460 }}>
        {['#', 'SECTION', 'KM', 'D±', 'DURÉE', 'PASSAGE'].map((h, i) => <span key={i} className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.1em', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>)}
      </div>
      {p.sections.map((s, i) => {
        const up = s.type === 'up'; const heat = sectionHeat(s)
        const dur = Math.max(1, Math.round((p.sectionTimes[i] ?? 0) / 60))
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '10px 4px', borderBottom: i < p.sections.length - 1 ? '1px solid var(--vl-line)' : 'none', alignItems: 'center', minWidth: 460 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--vl-text-3)' }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: HEAT_COLORS[heat], flex: '0 0 auto' }} />
              <span style={{ fontSize: 13, color: 'var(--vl-text)' }}>{up ? 'Montée' : s.type === 'down' ? 'Descente' : 'Plat'}</span>
              <span className="mono" style={{ fontSize: 9.5, color: HEAT_COLORS[heat] }}>{HEAT_NAMES[heat].toUpperCase()}</span>
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--vl-text-3)' }}>{Math.round(s.grade)}%</span>
              {s.surface && <span className="mono" style={{ fontSize: 9.5, color: surfaceInfo(s.surface).col }}>{surfaceInfo(s.surface).fr.toUpperCase()}</span>}
            </span>
            <span className="mono tnum" style={{ fontSize: 11, color: 'var(--vl-text-2)', textAlign: 'right' }}>{s.startKm.toFixed(1)}–{s.endKm.toFixed(1)}</span>
            <span className="mono tnum" style={{ fontSize: 11.5, color: up ? 'var(--vl-growth)' : 'var(--vl-text-2)', textAlign: 'right', fontWeight: 600 }}>{up ? '+' + Math.round(s.dplus) : '−' + Math.round(s.dminus)}</span>
            <span className="mono tnum" style={{ fontSize: 11, color: 'var(--vl-text-2)', textAlign: 'right' }}>{dur} min</span>
            <span className="display tnum" style={{ fontSize: 16, color: 'var(--vl-text)', textAlign: 'right' }}>{passageHM(s.endKm)}</span>
          </div>
        )
      })}
    </div>
  )
}

function NutritionTable({ rows }: { rows: NutritionRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((n, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '13px 4px', borderBottom: i < rows.length - 1 ? '1px solid var(--vl-line)' : 'none', alignItems: 'center' }}>
          <div style={{ flex: '0 0 70px' }}>
            <div className="display tnum" style={{ fontSize: 18, color: 'var(--vl-ember)', lineHeight: 1 }}>{n.moment}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: 'var(--vl-text)' }}>{n.action}</div>
            <div style={{ fontSize: 12, color: 'var(--vl-text-2)', marginTop: 2 }}>{n.note}</div>
          </div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--vl-text)', fontWeight: 600, flex: '0 0 auto' }}>{n.glucides}</span>
        </div>
      ))}
    </div>
  )
}
