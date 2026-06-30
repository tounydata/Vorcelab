import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Kpis {
  total_users: number
  new_users_7d: number
  new_users_30d: number
  active_users_7d: number
  active_users_30d: number
  pro_users: number
  sessions_today: number
  sessions_7d: number
  sessions_30d: number
}

interface DailyPoint {
  day: string
  signups?: number
  sessions?: number
  unique_users?: number
}

interface EventRow {
  event: string
  total_count: number
  unique_users: number
}

interface FunnelStep {
  step: string
  users: number
}

interface RetentionRow {
  cohort_week: string
  users_that_week: number
  returned_next_week: number
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'color-mix(in oklab, var(--vl-ember) 8%, var(--vl-surf-2))' : 'var(--vl-surf-2)',
      border: `1px solid ${accent ? 'color-mix(in oklab, var(--vl-ember) 35%, transparent)' : 'var(--vl-line)'}`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.1em', color: accent ? 'var(--vl-ember)' : 'var(--vl-text-3)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', fontWeight: 800, color: accent ? 'var(--vl-ember)' : 'var(--vl-text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

function BarChart({ data, valueKey, color, height = 56 }: {
  data: DailyPoint[]
  valueKey: 'signups' | 'sessions' | 'unique_users'
  color: string
  height?: number
}) {
  const max = Math.max(...data.map(d => (d[valueKey] as number) ?? 0), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {data.map((d, i) => {
        const val = (d[valueKey] as number) ?? 0
        const isRecent = data.length - i <= 7
        return (
          <div
            key={d.day}
            title={`${d.day.slice(5)}: ${val}`}
            style={{
              flex: 1,
              height: `${Math.max((val / max) * 100, val > 0 ? 3 : 0)}%`,
              background: isRecent ? color : `color-mix(in oklab, ${color} 45%, transparent)`,
              borderRadius: '2px 2px 0 0',
              minHeight: val > 0 ? 2 : 0,
              cursor: 'default',
            }}
          />
        )
      })}
    </div>
  )
}

const EVENT_ICONS: Record<string, string> = {
  session_start:     '🟢',
  coach_viewed:      '🗓',
  race_created:      '🏁',
  strategy_viewed:   '🗺',
  activities_viewed: '📊',
  strava_connected:  '🔗',
  gpx_uploaded:      '📍',
  plan_upgraded:     '✦',
}

const EVENT_LABELS: Record<string, string> = {
  session_start:     'Ouvertures app',
  coach_viewed:      'Coach consulté',
  race_created:      'Course créée',
  strategy_viewed:   'Stratégie vue',
  activities_viewed: 'Activités vues',
  strava_connected:  'Strava connecté',
  gpx_uploaded:      'GPX uploadé',
  plan_upgraded:     'Passé PRO',
}

function retentionColor(pct: number): string {
  if (pct >= 50) return 'var(--vl-growth)'
  if (pct >= 25) return 'var(--vl-amber, #f59e0b)'
  return 'var(--vl-ember)'
}

function fmtWeek(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function StatsTab() {
  const { data: kpis, isLoading: kLoading } = useQuery<Kpis>({
    queryKey: ['admin-kpis'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_kpis')
      if (error) throw error
      return (data as Kpis[])[0]
    },
  })

  const { data: signups = [] } = useQuery<DailyPoint[]>({
    queryKey: ['admin-signups-daily'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_signups_daily', { days_back: 30 })
      if (error) return []
      return data as DailyPoint[]
    },
  })

  const { data: sessions = [] } = useQuery<DailyPoint[]>({
    queryKey: ['admin-sessions-daily'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_sessions_daily', { days_back: 30 })
      if (error) return []
      return data as DailyPoint[]
    },
  })

  const { data: events = [] } = useQuery<EventRow[]>({
    queryKey: ['admin-event-breakdown'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_event_breakdown', { days_back: 30 })
      if (error) return []
      return data as EventRow[]
    },
  })

  const { data: funnel = [] } = useQuery<FunnelStep[]>({
    queryKey: ['admin-funnel'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_funnel')
      if (error) return []
      return data as FunnelStep[]
    },
  })

  const { data: retention = [] } = useQuery<RetentionRow[]>({
    queryKey: ['admin-retention'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_weekly_retention')
      if (error) return []
      return data as RetentionRow[]
    },
  })

  if (kLoading) return <div className="loading"><div className="spinner" /></div>

  const convRate = kpis && kpis.total_users > 0
    ? Math.round((kpis.pro_users / kpis.total_users) * 100)
    : 0

  const maxEvent = Math.max(...events.map(e => e.total_count), 1)
  const funnelMax = funnel[0]?.users ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div>
        <div className="clabel" style={{ marginBottom: 10 }}>VUE D'ENSEMBLE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          <KpiCard label="Total users" value={kpis?.total_users ?? 0} sub={`+${kpis?.new_users_30d ?? 0} ce mois`} />
          <KpiCard label="Actifs 7j" value={kpis?.active_users_7d ?? 0} sub={`${kpis?.total_users ? Math.round(((kpis.active_users_7d ?? 0) / kpis.total_users) * 100) : 0}% de la base`} />
          <KpiCard label="Actifs 30j" value={kpis?.active_users_30d ?? 0} sub={`${kpis?.total_users ? Math.round(((kpis.active_users_30d ?? 0) / kpis.total_users) * 100) : 0}% de la base`} />
          <KpiCard label="PRO actifs" value={kpis?.pro_users ?? 0} accent sub={`taux conv. ${convRate}%`} />
          <KpiCard label="Sessions/jour" value={kpis?.sessions_today ?? 0} sub={`${kpis?.sessions_7d ?? 0} cette semaine`} />
          <KpiCard label="Sessions 30j" value={kpis?.sessions_30d ?? 0} />
        </div>
      </div>

      {/* ── Graphiques ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Inscriptions */}
        <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="clabel">INSCRIPTIONS</div>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>30 jours</span>
          </div>
          <BarChart data={signups} valueKey="signups" color="var(--vl-growth)" />
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>{signups[0]?.day?.slice(5)}</span>
            <span style={{ color: 'var(--vl-growth)', fontWeight: 700 }}>+{kpis?.new_users_7d ?? 0} cette sem.</span>
            <span>Aujourd'hui</span>
          </div>
        </div>

        {/* Sessions / DAU */}
        <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="clabel">UTILISATEURS ACTIFS / JOUR</div>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>30 jours</span>
          </div>
          <BarChart data={sessions} valueKey="unique_users" color="var(--vl-ember)" />
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>{sessions[0]?.day?.slice(5)}</span>
            <span style={{ color: 'var(--vl-ember)', fontWeight: 700 }}>{kpis?.active_users_7d ?? 0} uniques/sem.</span>
            <span>Aujourd'hui</span>
          </div>
        </div>
      </div>

      {/* ── Funnel ─────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
        <div className="clabel" style={{ marginBottom: 14 }}>FUNNEL DE CONVERSION</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {funnel.map((s, i) => {
            const pct = Math.round((s.users / funnelMax) * 100)
            const hue = 20 - i * 2
            return (
              <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)', width: 130, flexShrink: 0 }}>{s.step}</span>
                <div style={{ flex: 1, height: 22, background: 'var(--vl-surf-2)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: `hsl(${hue}, 85%, 55%)`,
                    borderRadius: 4,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <span style={{ fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 800, color: 'var(--vl-text)', width: 36, textAlign: 'right', flexShrink: 0 }}>{s.users}</span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', width: 38, flexShrink: 0 }}>{pct}%</span>
                {i > 0 && (
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', width: 52, flexShrink: 0 }}>
                    ↓ {Math.round((s.users / (funnel[i - 1]?.users || 1)) * 100)}% étape
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 14, padding: '10px', background: 'var(--vl-surf-2)', borderRadius: 8, lineHeight: 1.7 }}>
          💡 <strong>Objectif :</strong> améliorer chaque étape du funnel. Focus sur le taux Strava → Course créée et Course créée → Coach.
        </div>
      </div>

      {/* ── Usage features ─────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div className="clabel">USAGE DES FEATURES</div>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>30 derniers jours</span>
        </div>
        {events.length === 0 ? (
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>Aucun événement enregistré</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {events.map((ev) => (
              <div key={ev.event} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, width: 18, flexShrink: 0 }}>{EVENT_ICONS[ev.event] ?? '•'}</span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)', width: 140, flexShrink: 0 }}>
                  {EVENT_LABELS[ev.event] ?? ev.event}
                </span>
                <div style={{ flex: 1, height: 14, background: 'var(--vl-surf-2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(ev.total_count / maxEvent) * 100}%`,
                    height: '100%', background: 'var(--vl-ember)',
                    borderRadius: 3, opacity: 0.7,
                  }} />
                </div>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, color: 'var(--vl-text)', width: 32, textAlign: 'right', flexShrink: 0 }}>{ev.total_count}</span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', width: 70, flexShrink: 0 }}>{ev.unique_users} user{ev.unique_users > 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Rétention ──────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
        <div className="clabel" style={{ marginBottom: 14 }}>RÉTENTION HEBDOMADAIRE</div>
        {retention.length === 0 ? (
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>Pas encore assez de données</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--vl-mono)', fontSize: 10 }}>
              <thead>
                <tr>
                  {(['Semaine', 'Actifs', 'Revenus sem. suiv.', 'Rétention'] as const).map(h => (
                    <th key={h} style={{ textAlign: 'left', color: 'var(--vl-text-3)', letterSpacing: '.08em', padding: '0 8px 8px 0', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retention.slice(-8).map((row) => {
                  const pct = row.users_that_week > 0
                    ? Math.round((row.returned_next_week / row.users_that_week) * 100)
                    : 0
                  return (
                    <tr key={row.cohort_week} style={{ borderTop: '1px solid var(--vl-line)' }}>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--vl-text-2)' }}>{fmtWeek(row.cohort_week)}</td>
                      <td style={{ padding: '7px 8px 7px 0', fontWeight: 700, color: 'var(--vl-text)' }}>{row.users_that_week}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--vl-text-2)' }}>{row.returned_next_week}</td>
                      <td style={{ padding: '7px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, color: retentionColor(pct) }}>{pct}%</span>
                        <div style={{ flex: 1, height: 6, background: 'var(--vl-surf-2)', borderRadius: 3, minWidth: 60 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: retentionColor(pct), borderRadius: 3 }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 12, lineHeight: 1.6 }}>
          % d'utilisateurs actifs une semaine qui reviennent la semaine suivante.
          Vert ≥50% · Orange ≥25% · Rouge &lt;25%
        </div>
      </div>

    </div>
  )
}
