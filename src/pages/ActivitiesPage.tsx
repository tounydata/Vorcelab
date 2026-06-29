import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router'
import { supabase } from '../lib/supabase'
import BrandedLoader from '../components/BrandedLoader'
import LoadError from '../components/LoadError'

interface Activity {
  id: string
  name: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  start_date: string
  type: string
  sport_type: string | null
  average_heartrate?: number | null
  average_speed?: number | null
  suffer_score?: number | null
}

function activityVerdict(a: Activity): string | null {
  const km = a.distance / 1000
  const isTrail = a.sport_type === 'TrailRun' || a.sport_type === 'Trail Run'
  const dplus = a.total_elevation_gain ?? 0
  const secPerKm = a.moving_time / km
  const pace = secPerKm

  const parts: string[] = []

  // Type d'effort
  if (km >= 20) parts.push('Sortie longue')
  else if (km >= 12) parts.push('Sortie medium')
  else if (pace < 270 && km >= 5) parts.push('Séance rapide') // < 4:30/km
  else if (km < 6) parts.push('Sortie courte')
  else parts.push('Footing')

  // Relief
  if (isTrail && dplus > 800) parts.push(`${Math.round(dplus)} m D+ — sérieux`)
  else if (isTrail && dplus > 400) parts.push(`${Math.round(dplus)} m D+`)
  else if (!isTrail && dplus > 200) parts.push('vallonné')

  // Cardio
  if (a.average_heartrate) {
    if (a.average_heartrate < 145) parts.push('FC facile')
    else if (a.average_heartrate > 175) parts.push('FC élevée')
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

// Seules les sorties course/trail sont analysables (allure, FC, D+, profil coureur).
const RUN_TYPES = ['Run', 'TrailRun', 'Trail Run', 'Running', 'VirtualRun']
function isRunOrTrail(a: Activity) {
  return RUN_TYPES.includes(a.type) || RUN_TYPES.includes(a.sport_type ?? '')
}
function runBadge(a: Activity) {
  return a.sport_type === 'TrailRun' || a.sport_type === 'Trail Run' ? 'Trail' : 'Course'
}

function formatKm(meters: number) {
  return (meters / 1000).toFixed(1)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}

// ── Agrégats par période (volume, D+, temps, sorties) + delta vs période N-1 ──

interface PeriodStats {
  label: string
  count: number
  km: number
  dplus: number
  timeS: number
  deltaKmPct: number | null
}

function aggregate(acts: Activity[], from: Date, to: Date): { count: number; km: number; dplus: number; timeS: number } {
  const inRange = acts.filter((a) => {
    const d = new Date(a.start_date)
    return d >= from && d < to
  })
  return {
    count: inRange.length,
    km: inRange.reduce((s, a) => s + a.distance, 0) / 1000,
    dplus: inRange.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0),
    timeS: inRange.reduce((s, a) => s + a.moving_time, 0),
  }
}

function computePeriods(acts: Activity[]): PeriodStats[] {
  const now = new Date()
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); weekStart.setHours(0, 0, 0, 0)
  const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const prevYearStart = new Date(now.getFullYear() - 1, 0, 1)
  // Année : comparaison à date équivalente (même jour de l'année N-1), pas l'année entière.
  const prevYearSameDay = new Date(now); prevYearSameDay.setFullYear(now.getFullYear() - 1)
  const future = new Date(now.getTime() + 86_400_000)

  const defs: { label: string; from: Date; to: Date; prevFrom: Date; prevTo: Date }[] = [
    { label: 'CETTE SEMAINE', from: weekStart, to: future, prevFrom: prevWeekStart, prevTo: weekStart },
    { label: 'CE MOIS', from: monthStart, to: future, prevFrom: prevMonthStart, prevTo: monthStart },
    { label: 'CETTE ANNÉE', from: yearStart, to: future, prevFrom: prevYearStart, prevTo: prevYearSameDay },
  ]
  return defs.map(({ label, from, to, prevFrom, prevTo }) => {
    const cur = aggregate(acts, from, to)
    const prev = aggregate(acts, prevFrom, prevTo)
    return {
      label, ...cur,
      deltaKmPct: prev.km > 0.1 ? Math.round(((cur.km - prev.km) / prev.km) * 100) : null,
    }
  })
}

type TypeFilter = 'tout' | 'trail' | 'route'

export default function ActivitiesPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tout')

  const { data: activities = [], isLoading, isError, refetch } = useQuery<Activity[]>({
    queryKey: ['activities-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,name,distance,total_elevation_gain,moving_time,start_date,type,sport_type,average_heartrate,average_speed,suffer_score')
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as Activity[]
    },
  })

  const runs = activities.filter(isRunOrTrail)
  const typeFiltered = runs.filter((a) =>
    typeFilter === 'tout' ? true : typeFilter === 'trail' ? runBadge(a) === 'Trail' : runBadge(a) === 'Course'
  )
  const filtered = typeFiltered.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
  const periods = computePeriods(typeFiltered)

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        ACTIVITÉS
      </div>

      {/* ── Volumes par période (suit le filtre Trail / Route) ── */}
      {!isLoading && runs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {periods.map((p) => (
            <div key={p.label} className="card" style={{ padding: '12px 14px', marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span className="mlabel" style={{ margin: 0, letterSpacing: '.12em' }}>{p.label}</span>
                {p.deltaKmPct != null && (
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: p.deltaKmPct >= 0 ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>
                    {p.deltaKmPct >= 0 ? '+' : ''}{p.deltaKmPct}% · vs préc.
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 1 }}>
                  {p.km.toFixed(p.km >= 100 ? 0 : 1)}<span style={{ fontSize: '.8rem', color: 'var(--vl-text-3)' }}> km</span>
                </span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-growth)' }}>↑{Math.round(p.dplus)} m</span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)' }}>{formatTime(p.timeS)} · {p.count} sortie{p.count > 1 ? 's' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Recherche + filtre type ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <input
          className="fi"
          type="search"
          placeholder="Rechercher une sortie…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <div style={{ display: 'flex', gap: 1, background: 'var(--vl-line)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', overflow: 'hidden' }}>
          {(['tout', 'trail', 'route'] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                border: 'none', cursor: typeFilter === t ? 'default' : 'pointer', padding: '7px 13px',
                background: typeFilter === t ? 'var(--vl-ember)' : 'var(--vl-surf-2)',
                color: typeFilter === t ? 'var(--vl-ink)' : 'var(--vl-text-2)',
                fontFamily: 'var(--vl-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <BrandedLoader />
      ) : isError ? (
        <LoadError onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <div className="mlabel">
          {search ? 'Aucun résultat' : 'Aucune sortie'}
        </div>
      ) : (
        <>
          <div className="mlabel" style={{ marginBottom: '0.75rem' }}>
            {filtered.length} sortie{filtered.length > 1 ? 's' : ''}
          </div>
          <div className="acts-grid">
            {filtered.map((a) => (
              <NavLink key={a.id} to={`/activities/${a.id}`} className="act-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="act-name">{a.name}</div>
                  {(() => {
                    const v = activityVerdict(a)
                    return v ? (
                      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10.5, color: 'var(--vl-growth)', marginBottom: 3, letterSpacing: '.04em' }}>
                        {v}
                      </div>
                    ) : null
                  })()}
                  <div className="act-meta">
                    {formatDate(a.start_date)} · {formatKm(a.distance)} km · {formatTime(a.moving_time)} · ↑{Math.round(a.total_elevation_gain ?? 0)} m{a.average_heartrate ? ` · ${Math.round(a.average_heartrate)} bpm` : ''}
                  </div>
                </div>
                <div>
                  <span className="act-badge">{runBadge(a)}</span>
                </div>
              </NavLink>
            ))}
          </div>
        </>
      )}
    </>
  )
}
