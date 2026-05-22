import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import { isRun, fmtD } from '../utils/formatters'

export function DashboardPage() {
  const user = useVLStore(s => s.user)

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(200)
      return (data || []).filter(r => isRun(r.type as string)).map(mapDbActivity)
    },
    enabled: !!user,
  })

  const now = new Date()
  const thisMonth = activities.filter(a => {
    const d = new Date(a.start_date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const thisWeek = activities.filter(a => {
    const daysToMon = (now.getDay() + 6) % 7
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMon)
    return new Date(a.start_date) >= weekStart
  })

  const kmM = thisMonth.reduce((s, a) => s + a.distance / 1000, 0)
  const kmW = thisWeek.reduce((s, a) => s + a.distance / 1000, 0)
  const dpM = thisMonth.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)

  const kpi = (label: string, value: string, sub?: string, color?: string) => (
    <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 800, color: color ?? 'var(--vl-text-1)' }}>{value}</div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.04em', marginBottom: 20 }}>
        DASHBOARD
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        {kpi('KM CE MOIS', kmM.toFixed(0), `${thisMonth.length} sorties`, 'var(--vl-ember)')}
        {kpi('KM CETTE SEMAINE', kmW.toFixed(0), `${thisWeek.length} sorties`)}
        {kpi('D+ CE MOIS', Math.round(dpM) + ' m', undefined, 'var(--vl-growth)')}
      </div>

      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 12 }}>
        DERNIÈRES SORTIES
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {activities.slice(0, 5).map(act => {
          const d = new Date(act.start_date_local || act.start_date)
          const ds = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()
          return (
            <Link
              key={act.id}
              to={`/activities/${act.id}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--vl-surf-2)', borderRadius: 8, padding: '10px 14px', textDecoration: 'none', color: 'inherit' }}
            >
              <div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', fontWeight: 600 }}>{act.name}</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginTop: 2 }}>
                  {(act.distance / 1000).toFixed(1)} km · {fmtD(act.moving_time)}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>{ds}</div>
            </Link>
          )
        })}
      </div>

      <Link to="/activities" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-ember)', textDecoration: 'none' }}>
        Voir toutes les activités →
      </Link>

      <div style={{ marginTop: 40, padding: '16px 20px', background: 'var(--vl-surf-2)', borderRadius: 8, borderLeft: '3px solid var(--vl-amber)' }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-amber)', letterSpacing: '.1em', marginBottom: 6 }}>MIGRATION EN COURS</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-text-3)', lineHeight: 1.6 }}>
          Renfo, Race Strategy et le dashboard complet arrivent dans les prochaines passes React.<br />
          Les algorithmes sont déjà prêts — c'est juste de l'UI.
        </div>
      </div>
    </div>
  )
}
