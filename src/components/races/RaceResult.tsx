import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ProjectionResult } from '../../lib/computeRaceProjection'
import {
  findRaceActivity, toActivityLite, compareProjectionToActual,
  type ActivityLite, type SectionCompare,
} from '../../lib/raceComparison'
import { fetchStreams } from '../../lib/streams'
import { fmtHM } from '../../lib/raceStrategyView'

interface Props {
  projection: ProjectionResult
  activities: Record<string, unknown>[]
  resultActivityId: string | null
  raceDateISO: string
  onLink: (activityId: string) => void
  onUnlink: () => void
}

function fmtClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}'${String(sec).padStart(2, '0')}`
}
function fmtDelta(deltaS: number): string {
  const sign = deltaS >= 0 ? '+' : '−'
  const abs = Math.abs(deltaS)
  const m = Math.floor(abs / 60), s = Math.round(abs % 60)
  return m > 0 ? `${sign}${m} min ${String(s).padStart(2, '0')}` : `${sign}${s} s`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const SLOWER = 'var(--vl-status-over, #d1583a)'   // plus lent que prévu
const FASTER = 'var(--vl-growth, #4a9d5b)'        // plus rapide que prévu
const TYPE_FR: Record<SectionCompare['type'], string> = { up: 'Montée', down: 'Descente', flat: 'Plat' }

export default function RaceResult({ projection, activities, resultActivityId, raceDateISO, onLink, onUnlink }: Props) {
  const [picking, setPicking] = useState(false)

  // Activités course à pied autour de la date (±7 j) pour le choix manuel.
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
        <div className="clabel" style={{ marginBottom: 10 }}>RÉSULTAT DE COURSE</div>

        {suggestion && !picking ? (
          <>
            <div className="mlabel" style={{ marginBottom: 12 }}>
              On dirait que tu as couru cette course. C'est bien elle ?
            </div>
            <ActivityRow a={suggestion} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="hbtn" onClick={() => onLink(suggestion.id)}
                style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none' }}>
                Oui, c'est ça — comparer
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
                ? 'Associe l\'activité Strava de ta course pour comparer le réel à la projection.'
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

  return <LinkedResult projection={projection} activity={linked} onUnlink={onUnlink} />
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

// ── État lié : charge les streams, calcule et affiche la comparaison ──────────
function LinkedResult({ projection, activity, onUnlink }: { projection: ProjectionResult; activity: ActivityLite; onUnlink: () => void }) {
  const streamId = activity.stravaActivityId
  const { data: stream, isLoading } = useQuery({
    queryKey: ['race-result-streams', streamId],
    enabled: !!streamId,
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchStreams(streamId!),
  })

  const cmp = useMemo(() => (stream ? compareProjectionToActual(projection, stream) : null), [projection, stream])

  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div className="clabel">PROJECTION VS RÉEL</div>
        <button onClick={onUnlink} className="hbtn no-print" style={{ fontSize: '.72rem', padding: '5px 10px', color: 'var(--vl-text-2)' }}>
          Délier
        </button>
      </div>

      {isLoading && <div className="mlabel">Chargement de l'activité…</div>}
      {!isLoading && !cmp && (
        <div className="mlabel">Impossible de lire le détail de l'activité (streams indisponibles). Réessaie plus tard.</div>
      )}

      {cmp && (
        <>
          {/* Hero : projeté vs réel + écart */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
            <Big label="PROJETÉ" value={fmtHM(cmp.projTotalS / 60)} />
            <Big label="RÉEL" value={fmtHM(cmp.actualTotalS / 60)} accent />
            <div>
              <div className="mlabel" style={{ marginBottom: 2 }}>ÉCART</div>
              <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, color: cmp.deltaS > 0 ? SLOWER : FASTER }}>
                {fmtDelta(cmp.deltaS)}
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)' }}>
                {cmp.deltaS > 0 ? '+' : ''}{cmp.deltaPct.toFixed(1)}% {cmp.deltaS > 0 ? 'plus lent' : 'plus rapide'} que prévu
              </div>
            </div>
          </div>

          {/* Là où ça s'est joué */}
          {cmp.worstSection && cmp.bestSection && cmp.worstSection !== cmp.bestSection && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <Highlight color={SLOWER} title="Le plus de temps perdu"
                sec={cmp.worstSection} />
              <Highlight color={FASTER} title="Le plus de temps gagné"
                sec={cmp.bestSection} />
            </div>
          )}

          {/* Barres par tronçon : projeté vs réel */}
          <div className="mlabel" style={{ marginBottom: 8 }}>PAR TRONÇON</div>
          <SectionBars sections={cmp.sections} />

          <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginTop: 12 }}>
            Activité liée : {activity.name || 'Sortie'} ({activity.distance != null ? (activity.distance / 1000).toFixed(1) : '—'} km).
          </div>
        </>
      )}
    </div>
  )
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="mlabel" style={{ marginBottom: 2 }}>{label}</div>
      <div className="display tnum" style={{ fontSize: '2.4rem', lineHeight: .9, color: accent ? 'var(--vl-growth-2, var(--vl-growth))' : 'var(--vl-text)' }}>{value}</div>
    </div>
  )
}

function Highlight({ color, title, sec }: { color: string; title: string; sec: SectionCompare }) {
  return (
    <div style={{ flex: '1 1 200px', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderLeft: `3px solid ${color}`, borderRadius: 'var(--vl-r-sm)', padding: '10px 12px' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--vl-text-3)', letterSpacing: '.04em' }}>{title}</div>
      <div style={{ fontWeight: 600, fontSize: '.92rem', marginTop: 2 }}>
        {TYPE_FR[sec.type]} · km {sec.startKm.toFixed(1)}–{sec.endKm.toFixed(1)}
      </div>
      <div className="mono" style={{ fontSize: 12, color, fontWeight: 700, marginTop: 2 }}>{fmtDelta(sec.deltaS)}</div>
    </div>
  )
}

function SectionBars({ sections }: { sections: SectionCompare[] }) {
  const maxS = Math.max(1, ...sections.map((s) => Math.max(s.projS, s.actualS)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {sections.map((s, i) => {
        const slower = s.deltaS > 0
        const color = slower ? SLOWER : FASTER
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 96px', alignItems: 'center', gap: 8 }}>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--vl-text-3)', whiteSpace: 'nowrap' }}>
              {TYPE_FR[s.type].slice(0, 3)} · {s.startKm.toFixed(0)}–{s.endKm.toFixed(0)}
            </div>
            <div style={{ position: 'relative', height: 16 }}>
              {/* projeté (fond) */}
              <div style={{ position: 'absolute', inset: 0, top: 3, height: 10, width: `${(s.projS / maxS) * 100}%`, background: 'var(--vl-line-2, var(--vl-line))', borderRadius: 3 }} />
              {/* réel (devant) */}
              <div style={{ position: 'absolute', top: 0, height: 16, width: `${(s.actualS / maxS) * 100}%`, background: color, opacity: .85, borderRadius: 3 }} />
            </div>
            <div className="mono" style={{ fontSize: 11, color, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {fmtDelta(s.deltaS)}
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 10, color: 'var(--vl-text-3)' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 8, background: 'var(--vl-line-2, var(--vl-line))', borderRadius: 2, marginRight: 4 }} />projeté</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 8, background: SLOWER, borderRadius: 2, marginRight: 4 }} />réel (plus lent)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 8, background: FASTER, borderRadius: 2, marginRight: 4 }} />réel (plus rapide)</span>
      </div>
    </div>
  )
}
