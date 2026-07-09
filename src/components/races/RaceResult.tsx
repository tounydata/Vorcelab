import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ProjectionResult } from '../../lib/computeRaceProjection'
import { findRaceActivity, toActivityLite, type ActivityLite } from '../../lib/raceComparison'
import { computeRaceDebrief, INCIDENTS, VAM_BAND_LABEL, type RaceDebrief, type DebriefPoint, type RaceAnnotation, type IncidentLabel } from '../../lib/raceDebrief'
import { fetchStreams } from '../../lib/streams'
import { fetchRaceHeat } from '../../lib/weather'
import { assessRacePreparation } from '../../lib/racePreparation'
import type { ActivityForLoad } from '../../lib/trainingLoad'
import { fmtHM } from '../../lib/raceStrategyView'

interface Props {
  projection: ProjectionResult
  activities: Record<string, unknown>[]
  resultActivityId: string | null
  raceDateISO: string
  fcMax?: number | null
  annotations?: RaceAnnotation[]
  onChangeAnnotations?: (next: RaceAnnotation[]) => void
  ravitos?: { km: number; label?: string }[]
  onLink: (activityId: string) => void
  onUnlink: () => void
}

function fmtClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}'${String(sec).padStart(2, '0')}`
}
function fmtPace(sPerKm: number): string {
  const s = Math.max(0, Math.round(sPerKm))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function fmtDelta(deltaS: number): string {
  const sign = deltaS >= 0 ? '+' : '−'
  const t = Math.round(Math.abs(deltaS))
  const m = Math.floor(t / 60), s = t % 60
  return m > 0 ? `${sign}${m} min ${String(s).padStart(2, '0')}` : `${sign}${s} s`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const SLOWER = 'var(--vl-status-over, #d1583a)'
const FASTER = 'var(--vl-growth, #4a9d5b)'

export default function RaceResult({ projection, activities, resultActivityId, raceDateISO, fcMax, annotations = [], onChangeAnnotations, ravitos = [], onLink, onUnlink }: Props) {
  const [picking, setPicking] = useState(false)

  const runChoices = useMemo<ActivityLite[]>(() => {
    const raceDay = new Date(raceDateISO).getTime()
    return activities.map(toActivityLite)
      .filter((a) => {
        if (!a.start_date) return false
        const kind = a.sport_type || a.type || ''
        if (!['Run', 'TrailRun', 'VirtualRun'].includes(kind)) return false
        return Math.abs(new Date(a.start_date).getTime() - raceDay) / 86_400_000 <= 7
      })
      .sort((a, b) => new Date(b.start_date!).getTime() - new Date(a.start_date!).getTime())
  }, [activities, raceDateISO])

  const linked = useMemo<ActivityLite | null>(() => {
    if (!resultActivityId) return null
    const row = activities.find((a) => String((a as { id?: unknown }).id) === resultActivityId)
    return row ? toActivityLite(row) : null
  }, [activities, resultActivityId])

  const suggestion = useMemo(
    () => (resultActivityId ? null : findRaceActivity(activities, raceDateISO, projection.totalDistM)),
    [activities, raceDateISO, projection.totalDistM, resultActivityId],
  )

  // ── État non lié : suggestion auto + confirmation, ou choix manuel ──────────
  if (!linked) {
    return (
      <div className="card" style={{ padding: '20px 22px' }}>
        <div className="clabel" style={{ marginBottom: 10 }}>DÉBRIEF DE COURSE</div>
        {suggestion && !picking ? (
          <>
            <div className="mlabel" style={{ marginBottom: 12 }}>
              On dirait que tu as couru cette course. C'est bien elle ?
            </div>
            <ActivityRow a={suggestion} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="hbtn" onClick={() => onLink(suggestion.id)}
                style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none' }}>
                Oui — analyser ma course
              </button>
              <button className="hbtn" onClick={() => setPicking(true)} style={{ fontSize: '.85rem' }}>
                Choisir une autre
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mlabel" style={{ marginBottom: 12 }}>
              {runChoices.length
                ? 'Associe l\'activité Strava de ta course pour le débrief complet.'
                : 'Aucune sortie course à pied trouvée autour de la date de la course.'}
            </div>
            {runChoices.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {runChoices.map((a) => (
                  <button key={a.id} onClick={() => onLink(a.id)}
                    style={{ textAlign: 'left', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '10px 12px', cursor: 'pointer', color: 'var(--vl-text)' }}>
                    <ActivityRow a={a} compact />
                  </button>
                ))}
              </div>
            )}
            {suggestion && (
              <button className="hbtn" onClick={() => setPicking(false)} style={{ fontSize: '.8rem', marginTop: 12 }}>
                ← Revenir à la suggestion
              </button>
            )}
          </>
        )}
      </div>
    )
  }

  return <Debrief projection={projection} activity={linked} activities={activities} raceDateISO={raceDateISO} fcMax={fcMax} annotations={annotations} onChangeAnnotations={onChangeAnnotations} ravitos={ravitos} onUnlink={onUnlink} />
}

function ActivityRow({ a, compact }: { a: ActivityLite; compact?: boolean }) {
  const km = a.distance != null ? (a.distance / 1000).toFixed(1) : '—'
  const time = a.moving_time != null ? fmtClock(a.moving_time) : (a.elapsed_time != null ? fmtClock(a.elapsed_time) : '—')
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: compact ? '.9rem' : '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name || 'Sortie'}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)' }}>
          {a.start_date ? fmtDate(a.start_date) : '—'} · {km} km{a.total_elevation_gain != null ? ` · ↑${Math.round(a.total_elevation_gain)} m` : ''}
        </div>
      </div>
      <div className="mono" style={{ fontSize: compact ? '.95rem' : '1.05rem', fontWeight: 700, color: 'var(--vl-text)', whiteSpace: 'nowrap' }}>{time}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// DÉBRIEF — 3 blocs : (1) verdict + courbe, (2) analyse, (3) intelligence
// ════════════════════════════════════════════════════════════════════════════
function Debrief({ projection, activity, activities, raceDateISO, fcMax, annotations = [], onChangeAnnotations, ravitos = [], onUnlink }: { projection: ProjectionResult; activity: ActivityLite; activities: Record<string, unknown>[]; raceDateISO: string; fcMax?: number | null; annotations?: RaceAnnotation[]; onChangeAnnotations?: (next: RaceAnnotation[]) => void; ravitos?: { km: number; label?: string }[]; onUnlink: () => void }) {
  const streamId = activity.stravaActivityId
  const { data: stream, isLoading } = useQuery({
    queryKey: ['race-result-streams', streamId],
    enabled: !!streamId,
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchStreams(streamId!),
  })
  const ravitoKms = useMemo(() => ravitos.map((r) => r.km), [ravitos])

  // Préparation : charge d'entraînement AVANT la course (sous-préparé vs vraie faiblesse).
  const preparation = useMemo(
    () => assessRacePreparation(activities as unknown as ActivityForLoad[], activity.start_date ?? raceDateISO, fcMax),
    [activities, activity.start_date, raceDateISO, fcMax],
  )

  // Chaleur ressentie en course (Open-Meteo historique le long du GPX, garde-fou Strava).
  const latlng = stream?.latlng?.data
  const startLat = latlng?.[0]?.[0] ?? null
  const startLon = latlng?.[0]?.[1] ?? null
  const durationS = activity.elapsed_time ?? activity.moving_time ?? null
  const { data: heat } = useQuery({
    queryKey: ['race-result-heat', streamId, startLat, startLon],
    enabled: startLat != null && startLon != null && !!activity.start_date,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () => fetchRaceHeat(startLat!, startLon!, activity.start_date!, durationS ?? 3600, activity.tempC ?? null),
  })

  const d = useMemo(
    () => (stream ? computeRaceDebrief(projection, stream, fcMax, { movingTimeS: activity.moving_time, elapsedTimeS: activity.elapsed_time, ravitoKms, annotations, tempC: activity.tempC, heat: heat ?? null, preparation }) : null),
    [projection, stream, fcMax, activity.moving_time, activity.elapsed_time, activity.tempC, ravitoKms, annotations, heat, preparation],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div className="clabel">DÉBRIEF DE COURSE</div>
        <button onClick={onUnlink} className="hbtn no-print" style={{ fontSize: '.72rem', padding: '5px 10px', color: 'var(--vl-text-2)' }}>Délier</button>
      </div>

      {isLoading && <div className="card mlabel" style={{ padding: '20px 22px' }}>Analyse de ta course…</div>}
      {!isLoading && !d && (
        <div className="card mlabel" style={{ padding: '20px 22px' }}>
          Impossible de lire le détail de l'activité (streams indisponibles). Réessaie plus tard.
        </div>
      )}

      {d && (
        <>
          <VerdictBlock d={d} />
          <PaceProfileCard d={d} annotations={annotations} />
          {(d.stoppedS >= 30 || annotations.length > 0) && (
            <IncidentsBlock d={d} annotations={annotations} ravitos={ravitos} onChange={onChangeAnnotations} />
          )}
          <PacingBlock d={d} />
          {d.hasHR && <CardiacBlock d={d} />}
          {d.terrain.length > 0 && <TerrainBlock d={d} />}
          <BenchBlock d={d} />
          <TakeawaysBlock d={d} />
          <ProfileLoopBlock d={d} />
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--vl-text-3)', textAlign: 'center' }}>
            D'après {activity.name || 'ton activité'} · {activity.distance != null ? (activity.distance / 1000).toFixed(1) : '—'} km
          </div>
        </>
      )}
    </div>
  )
}

// ── BLOC 1 — Verdict + deux notes ─────────────────────────────────────────────
function VerdictBlock({ d }: { d: RaceDebrief }) {
  const scoreColor = d.executionScore >= 85 ? FASTER : d.executionScore >= 70 ? 'var(--vl-growth)' : d.executionScore >= 55 ? 'var(--vl-amber)' : SLOWER
  const deltaColor = d.deltaS <= 0 ? FASTER : SLOWER
  return (
    <div className="card" style={{ padding: '20px 22px', borderTop: `3px solid ${scoreColor}` }}>
      <div style={{ fontSize: 15, color: 'var(--vl-text)', lineHeight: 1.5, fontWeight: 600, marginBottom: 18 }}>{d.verdict}</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {/* Résultat */}
        <div style={{ flex: '1 1 150px', background: 'var(--vl-surf-2)', borderRadius: 'var(--vl-r-sm)', padding: '14px 16px' }}>
          <div className="mlabel" style={{ marginBottom: 6 }}>RÉSULTAT</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="display tnum" style={{ fontSize: '2rem', lineHeight: .9, color: 'var(--vl-text)' }}>{fmtHM(d.actualTotalS / 60)}</span>
            <span className="mono tnum" style={{ fontSize: 13, fontWeight: 700, color: deltaColor }} title={d.distanceMismatch ? 'Écart calculé à distance égale (en mouvement)' : undefined}>{fmtDelta(d.deltaS)}{d.distanceMismatch ? '*' : ''}</span>
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--vl-text-3)', marginTop: 4 }}>projeté {fmtHM(d.projTotalS / 60)}</div>
          {d.distanceMismatch && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>
              *activité {d.actualDistKm.toFixed(1)} km · tracé {d.projDistKm.toFixed(1)} km — écart comparé sur {Math.min(d.actualDistKm, d.projDistKm).toFixed(1)} km
            </div>
          )}
        </div>
        {/* Exécution */}
        <div style={{ flex: '1 1 150px', background: 'var(--vl-surf-2)', borderRadius: 'var(--vl-r-sm)', padding: '14px 16px' }}>
          <div className="mlabel" style={{ marginBottom: 6 }}>EXÉCUTION</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="display tnum" style={{ fontSize: '2rem', lineHeight: .9, color: scoreColor }}>{d.executionScore}</span>
            <span className="mono" style={{ fontSize: 13, color: 'var(--vl-text-2)' }}>/100 · {d.executionLabel}</span>
          </div>
          <div style={{ position: 'relative', height: 5, borderRadius: 999, background: 'var(--vl-line)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${d.executionScore}%`, background: scoreColor, borderRadius: 999 }} />
          </div>
        </div>
        {/* En mouvement — dès qu'il y a un temps d'arrêt notable (ravito, hydrat., crampes…) */}
        {d.stoppedS >= 30 && (
          <div style={{ flex: '1 1 150px', background: 'var(--vl-surf-2)', borderRadius: 'var(--vl-r-sm)', padding: '14px 16px' }}>
            <div className="mlabel" style={{ marginBottom: 6 }}>EN MOUVEMENT</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="display tnum" style={{ fontSize: '2rem', lineHeight: .9, color: 'var(--vl-text)' }}>{fmtHM(d.movingS / 60)}</span>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--vl-amber)', marginTop: 4 }}>{d.stopCount > 0 ? `${d.stopCount} arrêt${d.stopCount > 1 ? 's' : ''}` : 'Arrêts'} · {fmtClock(d.stoppedS)} à l'arrêt</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── BLOC 1 — Courbe allure réelle vs projetée, posée sur le profil ────────────
function PaceProfileCard({ d, annotations = [] }: { d: RaceDebrief; annotations?: RaceAnnotation[] }) {
  const totalKm = d.points.length ? d.points[d.points.length - 1].km : 1
  const W = 1000, PH = 150, EH = 64
  const x = (km: number) => (km / totalKm) * W
  const yPace = (p: number) => 10 + ((Math.min(Math.max(p, d.paceLoS), d.paceHiS) - d.paceLoS) / Math.max(1, d.paceHiS - d.paceLoS)) * (PH - 20)
  const yAlt = (a: number) => (EH - 6) - ((a - d.altMin) / Math.max(1, d.altMax - d.altMin)) * (EH - 12)

  const pts = d.points.filter((p): p is DebriefPoint & { actualPaceS: number; projPaceS: number } => p.actualPaceS != null && p.projPaceS != null)

  // Polygones de remplissage entre réel et projeté (vert = devant, rouge = derrière)
  const fills = pts.slice(1).map((p, i) => {
    const a0 = pts[i], a1 = p
    const ahead = (a0.actualPaceS + a1.actualPaceS) / 2 <= (a0.projPaceS + a1.projPaceS) / 2
    const poly = `${x(a0.km)},${yPace(a0.projPaceS)} ${x(a1.km)},${yPace(a1.projPaceS)} ${x(a1.km)},${yPace(a1.actualPaceS)} ${x(a0.km)},${yPace(a0.actualPaceS)}`
    return { poly, color: ahead ? FASTER : SLOWER }
  })
  const actualLine = pts.map((p) => `${x(p.km)},${yPace(p.actualPaceS)}`).join(' ')
  const projLine = pts.map((p) => `${x(p.km)},${yPace(p.projPaceS)}`).join(' ')

  const altPts = d.points.filter((p): p is DebriefPoint & { alt: number } => p.alt != null)
  const altLine = altPts.map((p) => `${x(p.km)},${yAlt(p.alt)}`).join(' ')
  const altArea = altPts.length ? `M${altPts.map((p) => `${x(p.km)},${yAlt(p.alt)}`).join(' L')} L${x(altPts[altPts.length - 1].km)},${EH} L${x(altPts[0].km)},${EH} Z` : ''

  const thirds = [totalKm / 3, (2 * totalKm) / 3]

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div className="clabel" style={{ margin: 0 }}>ALLURE · PRÉVU vs RÉEL</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Legend c={FASTER} label="devant le plan" />
          <Legend c={SLOWER} label="derrière" />
          {d.stops.length > 0 && <Legend c="var(--vl-amber)" label="arrêt" />}
        </div>
      </div>

      {/* Panneau ALLURE */}
      <svg viewBox={`0 0 ${W} ${PH}`} preserveAspectRatio="none" width="100%" height={150} style={{ display: 'block', overflow: 'visible' }}>
        {thirds.map((k, i) => <line key={i} x1={x(k)} y1={0} x2={x(k)} y2={PH} stroke="var(--vl-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {fills.map((f, i) => <polygon key={i} points={f.poly} fill={f.color} opacity={0.22} />)}
        <polyline points={projLine} fill="none" stroke="var(--vl-text-3)" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        <polyline points={actualLine} fill="none" stroke="var(--vl-text)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {/* arrêts détectés non étiquetés : ravito connu = vert plein, sinon ambre pointillé */}
        {d.stops.map((s, i) => s.startKm <= totalKm && !annotations.some((a) => Math.abs(a.km - s.startKm) < 0.3) && (
          <line key={`stop${i}`} x1={x(s.startKm)} y1={0} x2={x(s.startKm)} y2={PH} stroke={s.isRavito ? INCIDENTS.ravito.color : 'var(--vl-amber)'} strokeWidth={1.3} strokeDasharray={s.isRavito ? undefined : '2 3'} vectorEffect="non-scaling-stroke" opacity={0.85} />
        ))}
        {/* incidents étiquetés : trait plein à la couleur du motif */}
        {annotations.map((a, i) => a.km <= totalKm && (
          <line key={`an${i}`} x1={x(a.km)} y1={0} x2={x(a.km)} y2={PH} stroke={INCIDENTS[a.label].color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" opacity={0.9} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)' }}>rapide ↑ {fmtPace(d.paceLoS)}/km</span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)' }}>réel ⎯ · projeté ┄</span>
      </div>

      {/* Panneau PROFIL */}
      <svg viewBox={`0 0 ${W} ${EH}`} preserveAspectRatio="none" width="100%" height={64} style={{ display: 'block', marginTop: 6 }}>
        <defs>
          <linearGradient id="dbg-alt" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--vl-ember)" stopOpacity={0.28} />
            <stop offset="1" stopColor="var(--vl-ember)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {altArea && <path d={altArea} fill="url(#dbg-alt)" />}
        {altLine && <polyline points={altLine} fill="none" stroke="var(--vl-ember)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" opacity={0.7} />}
        {thirds.map((k, i) => <line key={i} x1={x(k)} y1={0} x2={x(k)} y2={EH} stroke="var(--vl-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)' }}>km 0</span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)' }}>profil · {Math.round(d.altMax - d.altMin)} m d'amplitude</span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--vl-text-3)' }}>km {totalKm.toFixed(0)}</span>
      </div>
    </div>
  )
}

// ── BLOC 2 — Étiquetage des arrêts (chute, crampe, ravito… avec ou sans pause) ──
const INCIDENT_KEYS: IncidentLabel[] = ['chute', 'crampe', 'ravito', 'hydratation', 'douleur', 'autre']

function IncidentsBlock({ d, annotations, ravitos = [], onChange }: { d: RaceDebrief; annotations: RaceAnnotation[]; ravitos?: { km: number; label?: string }[]; onChange?: (next: RaceAnnotation[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [addKm, setAddKm] = useState('')
  const [addLabel, setAddLabel] = useState<IncidentLabel>('chute')

  const annNear = (km: number) => annotations.find((a) => Math.abs(a.km - km) < 0.3)
  const ravitoName = (km: number) => ravitos.find((r) => Math.abs(r.km - km) < 0.3)?.label
  function tagStop(km: number, label: IncidentLabel | '') {
    if (!onChange) return
    const rest = annotations.filter((a) => Math.abs(a.km - km) >= 0.3)
    onChange(label ? [...rest, { km: +km.toFixed(1), label }] : rest)
  }
  function removeAnn(km: number) { onChange?.(annotations.filter((a) => a.km !== km)) }
  function addManual() {
    const km = parseFloat(addKm.replace(',', '.'))
    if (!onChange || !Number.isFinite(km)) return
    onChange([...annotations, { km: +km.toFixed(1), label: addLabel }])
    setAddKm(''); setAdding(false)
  }

  // Annotations posées hors d'un arrêt détecté (ex. chute pendant une pause montre).
  const manualOnly = annotations.filter((a) => !d.stops.some((s) => Math.abs(s.startKm - a.km) < 0.3))

  const selStyle: React.CSSProperties = {
    background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 6,
    color: 'var(--vl-text)', fontFamily: 'var(--vl-mono)', fontSize: 11, padding: '5px 8px', cursor: 'pointer',
  }

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="clabel" style={{ marginBottom: 4 }}>ÉTIQUETER LES ARRÊTS</div>
      <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.45, marginBottom: 14 }}>
        Pose un motif sur chaque arrêt — avec ou sans pause de la montre. Ton débrief raconte alors ta vraie course.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {d.stops.map((s, i) => {
          const cur = annNear(s.startKm)
          const autoRavito = !cur && s.isRavito
          const eff: IncidentLabel | '' = cur?.label ?? (s.isRavito ? 'ravito' : '')
          const dotColor = cur ? INCIDENTS[cur.label].color : s.isRavito ? INCIDENTS.ravito.color : 'var(--vl-amber)'
          return (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: dotColor, flex: '0 0 auto' }} />
                  <span className="mono" style={{ fontSize: 12, color: 'var(--vl-text)' }}>km {s.startKm.toFixed(1)}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)' }}>· {fmtClock(s.durationS)}</span>
                </div>
                <select value={eff} onChange={(e) => tagStop(s.startKm, e.target.value as IncidentLabel | '')} style={selStyle} disabled={!onChange}>
                  <option value="">Étiqueter…</option>
                  {INCIDENT_KEYS.map((k) => <option key={k} value={k}>{INCIDENTS[k].fr}</option>)}
                </select>
              </div>
              {autoRavito && (
                <div className="mono" style={{ fontSize: 10, color: INCIDENTS.ravito.color, marginTop: 3, marginLeft: 17 }}>
                  Ravito connu{ravitoName(s.startKm) ? ` : ${ravitoName(s.startKm)}` : ''} · reconnu automatiquement
                </div>
              )}
            </div>
          )
        })}

        {manualOnly.map((a, i) => (
          <div key={`m${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: INCIDENTS[a.label].color, flex: '0 0 auto' }} />
              <span className="mono" style={{ fontSize: 12, color: 'var(--vl-text)' }}>km {a.km.toFixed(1)}</span>
              <span className="mono" style={{ fontSize: 11, color: INCIDENTS[a.label].color }}>· {INCIDENTS[a.label].fr}</span>
            </div>
            {onChange && (
              <button onClick={() => removeAnn(a.km)} className="hbtn" style={{ fontSize: '.72rem', padding: '4px 9px', color: 'var(--vl-text-3)' }}>Retirer</button>
            )}
          </div>
        ))}
      </div>

      {/* Ajout manuel : chute / pause non détectée par la montre */}
      {onChange && (adding ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input value={addKm} onChange={(e) => setAddKm(e.target.value)} inputMode="decimal" placeholder="km"
            style={{ width: 64, background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 6, color: 'var(--vl-text)', fontFamily: 'var(--vl-mono)', fontSize: 12, padding: '6px 8px' }} />
          <select value={addLabel} onChange={(e) => setAddLabel(e.target.value as IncidentLabel)} style={selStyle}>
            {INCIDENT_KEYS.map((k) => <option key={k} value={k}>{INCIDENTS[k].fr}</option>)}
          </select>
          <button onClick={addManual} className="hbtn" style={{ fontSize: '.78rem', padding: '6px 12px', background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none' }}>Ajouter</button>
          <button onClick={() => { setAdding(false); setAddKm('') }} className="hbtn" style={{ fontSize: '.78rem', padding: '6px 10px' }}>Annuler</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="hbtn" style={{ fontSize: '.78rem', padding: '6px 12px', marginTop: 12 }}>
          + Ajouter un incident (chute, pause non détectée…)
        </button>
      ))}
    </div>
  )
}

// ── BLOC 2 — Pacing en 3 actes ────────────────────────────────────────────────
function PacingBlock({ d }: { d: RaceDebrief }) {
  const maxPace = Math.max(...d.thirds.map((t) => t.actualPaceS), 1)
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="clabel" style={{ marginBottom: 4 }}>PACING</div>
      <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.45, marginBottom: 14 }}>{d.splitVerdict}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {d.thirds.map((t, i) => {
          const slower = t.deltaS > 1
          const c = slower ? SLOWER : FASTER
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 92px', alignItems: 'center', gap: 10 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--vl-text-2)', fontWeight: 600 }}>{t.label}</span>
              <div style={{ position: 'relative', height: 16, background: 'var(--vl-surf-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${(t.actualPaceS / maxPace) * 100}%`, background: c, opacity: .8, borderRadius: 4 }} />
                <span className="mono" style={{ position: 'absolute', left: 8, top: 1, fontSize: 10.5, color: 'var(--vl-text)', fontWeight: 700 }}>{fmtPace(t.actualPaceS)}/km</span>
              </div>
              <span className="mono tnum" style={{ fontSize: 11, color: c, fontWeight: 700, textAlign: 'right' }}>{fmtDelta(t.deltaS)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── BLOC 2 — Effort cardiaque ─────────────────────────────────────────────────
function CardiacBlock({ d }: { d: RaceDebrief }) {
  const ZONE_COLORS = ['#5da084', '#7bb37a', '#d4a843', '#d6803e', '#d1583a']
  const drift = d.decouplingPct
  // Le mot/couleur reflètent la dérive NETTE (hors chaleur / départ rapide) : c'est elle
  // qui juge l'endurance. La valeur affichée reste la dérive MESURÉE.
  const netDrift = d.adjustedDecouplingPct ?? drift
  const driftColor = netDrift == null ? 'var(--vl-text-2)' : netDrift < 5 ? FASTER : netDrift < 10 ? 'var(--vl-amber)' : SLOWER
  const driftWord = netDrift == null ? '—' : netDrift < 5 ? 'maîtrisé' : netDrift < 10 ? 'modéré' : 'élevé'
  const confBits = d.driftConfounders.map((c) => c === 'heat' ? `chaleur ${d.tempC != null ? `${d.tempC.toFixed(0)} °C` : ''}`.trim() : 'départ rapide')
  const fade = d.durabilityFadePct
  const fadeColor = d.durabilityBand === 'solid' ? FASTER : d.durabilityBand === 'moderate' ? 'var(--vl-amber)' : SLOWER
  const fadeWord = d.durabilityBand === 'solid' ? 'solide' : d.durabilityBand === 'moderate' ? 'modérée' : 'à renforcer'
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="clabel" style={{ marginBottom: 12 }}>EFFORT CARDIAQUE</div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: d.zones ? 14 : 0 }}>
        <Stat label="FC MOY." value={d.avgHR != null ? `${d.avgHR}` : '—'} unit="bpm" />
        <Stat label="FC MAX" value={d.maxHR != null ? `${d.maxHR}` : '—'} unit="bpm" />
        <Stat label={d.decouplingGapAdjusted ? 'DÉRIVE GAP:FC' : 'DÉRIVE H1→H2'} value={drift != null ? `${drift >= 0 ? '+' : ''}${drift.toFixed(0)}%` : '—'} unit={driftWord} color={driftColor} />
        {fade != null && (
          <Stat label="DURABILITÉ" value={`${fade > 0 ? '−' : '+'}${Math.abs(fade).toFixed(0)}%`} unit={fadeWord} color={fadeColor} />
        )}
        {d.tempC != null && (
          <Stat
            label="TEMPÉRATURE"
            value={`${d.tempC.toFixed(0)}°`}
            unit={d.feelsLikeC != null && Math.abs(d.feelsLikeC - d.tempC) >= 2
              ? `ressenti ${d.feelsLikeC.toFixed(0)}°`
              : d.tempC >= 28 ? 'forte chaleur' : d.tempC >= 22 ? 'chaud' : d.tempC < 5 ? 'froid' : 'tempéré'}
            color={Math.max(d.tempC, d.feelsLikeC ?? d.tempC) >= 22 ? 'var(--vl-ember)' : 'var(--vl-text-2)'}
          />
        )}
      </div>
      {drift != null && (
        <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.45, marginBottom: d.zones ? 14 : 0 }}>
          {/* Interprétation basée sur la dérive NETTE (hors chaleur / départ rapide). */}
          {netDrift! < 5
            ? 'Allure et fréquence cardiaque restées couplées : endurance solide sur la durée.'
            : netDrift! < 10
              ? 'Légère dérive en 2ᵉ moitié — l\'effort a coûté un peu plus cher sur la fin.'
              : 'Forte dérive : à allure égale, ta FC a grimpé — signe de fatigue ou de nutrition à revoir.'}
          {confBits.length > 0 && (
            <> {' '}<span style={{ color: 'var(--vl-text-1)' }}>
              Dérive mesurée +{drift.toFixed(0)} %, dont une part attribuée à {confBits.join(' et ')} — sans ça, ~+{(netDrift ?? 0).toFixed(0)} % : ton endurance n'est pas en cause.
            </span></>
          )}
          {d.decouplingGapAdjusted ? ' Dérive ajustée à la pente (GAP:FC), donc interprétable malgré le dénivelé.' : ''}
          {d.hrDriftPredicted ? ' La projection l\'avait anticipé.' : ''}
        </div>
      )}
      {d.zones && (
        <div>
          <div style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden' }}>
            {d.zones.map((z) => z.pct > 0 && (
              <div key={z.z} style={{ width: `${z.pct}%`, background: ZONE_COLORS[z.z - 1] }} title={`Z${z.z} · ${z.pct}%`} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            {d.zones.map((z) => z.pct >= 8 && (
              <span key={z.z} className="mono" style={{ fontSize: 10, color: 'var(--vl-text-3)' }}>
                <span style={{ color: ZONE_COLORS[z.z - 1] }}>■</span> Z{z.z} {z.pct}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── BLOC 2 — Bilan terrain (vs stratégie) ─────────────────────────────────────
function TerrainBlock({ d }: { d: RaceDebrief }) {
  const oColor = (o: string) => o === 'better' ? FASTER : o === 'worse' ? SLOWER : 'var(--vl-text-2)'
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="clabel" style={{ marginBottom: 12 }}>BILAN TERRAIN</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.terrain.map((t, i) => (
          <div key={i} style={{ borderLeft: `3px solid ${oColor(t.outcome)}`, paddingLeft: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vl-text)' }}>{t.label}</span>
              <span className="mono tnum" style={{ fontSize: 12, fontWeight: 700, color: oColor(t.outcome) }}>{fmtDelta(t.deltaS)}</span>
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)', marginTop: 3 }}>
              {t.note}
              {t.actualVamMH != null && t.projVamMH != null ? ` · VAM ${t.actualVamMH} vs ${t.projVamMH} m/h prévue` : ''}
              {t.vamBand ? ` (${VAM_BAND_LABEL[t.vamBand]})` : ''}
            </div>
          </div>
        ))}
        {d.descentFade === 'marked' && (
          <div style={{ borderLeft: `3px solid ${SLOWER}`, paddingLeft: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vl-text)' }}>Fatigue de descente</span>
            <div className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)', marginTop: 3 }}>
              Tes descentes ont nettement ralenti en fin de course{d.eccLoadEq ? ` · charge excentrique ~${d.eccLoadEq} m éq.` : ''} — renfo excentrique + habituation descente avant la prochaine.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── BLOC 3 — Banc d'essai de la projection ────────────────────────────────────
function BenchBlock({ d }: { d: RaceDebrief }) {
  const accColor = d.accuracyPct >= 97 ? FASTER : d.accuracyPct >= 92 ? 'var(--vl-amber)' : 'var(--vl-text-2)'
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="clabel" style={{ marginBottom: 12 }}>LA PROJECTION AU BANC D'ESSAI</div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <span className="display tnum" style={{ fontSize: '2.4rem', lineHeight: .9, color: accColor }}>{d.accuracyPct.toFixed(1)}%</span>
          <div className="mlabel" style={{ marginTop: 4 }}>DE PRÉCISION{d.stoppedS >= 30 ? ' · HORS ARRÊTS' : ''}</div>
        </div>
        <div className="mono" style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.6 }}>
          <div>Projeté <span style={{ color: 'var(--vl-text)', fontWeight: 700 }}>{fmtHM(d.projTotalS / 60)}</span></div>
          {d.stoppedS >= 30 ? (
            <>
              <div>En mouvement <span style={{ color: 'var(--vl-text)', fontWeight: 700 }}>{fmtHM(d.movingS / 60)}</span> <span style={{ color: d.movingS - d.projTotalS <= 0 ? FASTER : SLOWER }}>({fmtDelta(d.movingS - d.projTotalS)})</span></div>
              <div style={{ fontSize: 11, color: 'var(--vl-text-3)' }}>Temps total {fmtHM(d.actualTotalS / 60)} · {fmtClock(d.stoppedS)} d'arrêts</div>
            </>
          ) : (
            <div>Réel <span style={{ color: 'var(--vl-text)', fontWeight: 700 }}>{fmtHM(d.actualTotalS / 60)}</span> <span style={{ color: d.deltaS <= 0 ? FASTER : SLOWER }}>({fmtDelta(d.deltaS)})</span></div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── BLOC 3 — Enseignements ────────────────────────────────────────────────────
function TakeawaysBlock({ d }: { d: RaceDebrief }) {
  const tone = (t: string) => t === 'good' ? FASTER : t === 'work' ? 'var(--vl-amber)' : 'var(--vl-text-2)'
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="clabel" style={{ marginBottom: 12 }}>CE QU'IL FAUT EN RETENIR</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {d.takeaways.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: 999, background: `color-mix(in oklab, ${tone(t.tone)} 22%, transparent)`, color: tone(t.tone), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--vl-mono)', fontSize: 11, fontWeight: 700, marginTop: 1 }}>{i + 1}</span>
            <span style={{ fontSize: 13, color: 'var(--vl-text)', lineHeight: 1.45 }}>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── BLOC 3 — Ce que la course apprend au profil ───────────────────────────────
function ProfileLoopBlock({ d }: { d: RaceDebrief }) {
  return (
    <div className="card" style={{ padding: '16px 18px', borderTop: '2px solid var(--vl-growth)' }}>
      <div className="clabel" style={{ marginBottom: 6 }}>CE QUE TA COURSE APPREND AU COACH</div>
      <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.45, marginBottom: 12 }}>
        Ces mesures réelles affinent ton profil — ta prochaine projection sera plus juste.
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {d.raceVamMH != null && <Stat label="VAM DE COURSE" value={`${d.raceVamMH}`} unit="m/h" />}
        {d.decouplingPct != null && <Stat label="ENDURANCE" value={(d.adjustedDecouplingPct ?? d.decouplingPct) < 8 ? 'Solide' : 'À renforcer'} unit={`dérive nette ${(d.adjustedDecouplingPct ?? d.decouplingPct) >= 0 ? '+' : ''}${(d.adjustedDecouplingPct ?? d.decouplingPct).toFixed(0)}%`} />}
        {d.preparation && d.preparation.status !== 'unknown' && <Stat label="PRÉPARATION" value={d.preparation.status === 'undertrained' ? 'Légère' : d.preparation.status === 'high' ? 'Chargée' : 'Correcte'} unit={d.preparation.loadRatioPct != null ? `charge ${d.preparation.loadRatioPct}%` : ''} color={d.preparation.status === 'undertrained' ? 'var(--vl-amber)' : 'var(--vl-text-2)'} />}
        <Stat label="PACING" value={d.splitPct <= 2 ? 'Régulier' : 'Positif'} unit={`split ${d.splitPct >= 0 ? '+' : ''}${d.splitPct.toFixed(0)}%`} />
      </div>
    </div>
  )
}

// ── Petits composants ─────────────────────────────────────────────────────────
function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div>
      <div className="mlabel" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span className="display tnum" style={{ fontSize: '1.5rem', lineHeight: .9, color: color ?? 'var(--vl-text)' }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />
      <span className="mono" style={{ fontSize: 10, color: 'var(--vl-text-2)' }}>{label}</span>
    </span>
  )
}
