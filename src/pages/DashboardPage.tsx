import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router'
import { supabase } from '../lib/supabase'

interface Activity {
  id: string
  name: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  start_date: string
  type: string
  average_heartrate?: number
}

function formatKm(meters: number) {
  return (meters / 1000).toFixed(1)
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function isRunning(type: string) {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type)
}

export default function DashboardPage() {
  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ['activities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,name,distance,total_elevation_gain,moving_time,start_date,type,average_heartrate')
        .order('start_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as Activity[]
    },
  })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const runs = activities.filter((a) => isRunning(a.type))
  const monthRuns = runs.filter((a) => new Date(a.start_date) >= startOfMonth)
  const weekRuns = runs.filter((a) => new Date(a.start_date) >= startOfWeek)

  const kmMonth = monthRuns.reduce((s, a) => s + a.distance, 0)
  const kmWeek = weekRuns.reduce((s, a) => s + a.distance, 0)
  const elevMonth = monthRuns.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)

  const recent = runs.slice(0, 5)

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1.25rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        DASHBOARD
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-val">{formatKm(kmMonth)}</div>
              <div className="stat-lbl">KM CE MOIS</div>
            </div>
            <div className="stat-card">
              <div className="stat-val">{formatKm(kmWeek)}</div>
              <div className="stat-lbl">KM CETTE SEMAINE</div>
            </div>
            <div className="stat-card">
              <div className="stat-val">{Math.round(elevMonth)}</div>
              <div className="stat-lbl">D+ CE MOIS</div>
            </div>
          </div>

          <div className="card">
            <div className="clabel">DERNIÈRES SORTIES</div>
            {recent.length === 0 ? (
              <div className="mlabel">Aucune activité enregistrée</div>
            ) : (
              <div className="acts-grid">
                {recent.map((a) => (
                  <NavLink key={a.id} to={`/activities/${a.id}`} className="act-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ flex: 1 }}>
                      <div className="act-name">{a.name}</div>
                      <div className="act-meta">
                        {formatDate(a.start_date)} · {formatKm(a.distance)} km · {formatTime(a.moving_time)} · ↑{Math.round(a.total_elevation_gain ?? 0)} m
                      </div>
                    </div>
                    <div>
                      <span className="act-badge">{a.type}</span>
                    </div>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
