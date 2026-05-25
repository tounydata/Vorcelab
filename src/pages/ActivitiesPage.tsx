import { useState } from 'react'
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

export default function ActivitiesPage() {
  const [search, setSearch] = useState('')

  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ['activities-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,name,distance,total_elevation_gain,moving_time,start_date,type')
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as Activity[]
    },
  })

  const filtered = activities.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        ACTIVITÉS
      </div>

      <input
        className="fi"
        type="search"
        placeholder="Rechercher une sortie…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 360, marginBottom: '1.25rem' }}
      />

      {isLoading ? (
        <div className="loading">
          <div className="spinner" />
          <span className="mlabel">Chargement</span>
        </div>
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
        </>
      )}
    </>
  )
}
