import { useQuery } from '@tanstack/react-query'
import { Link, NavLink } from 'react-router'
import { supabase } from '../lib/supabase'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function RaceListPage() {
  const { data: races = [], isLoading } = useQuery<Race[]>({
    queryKey: ['races'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id,name,date,distance,elevation,type')
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Race[]
    },
  })

  const now = new Date()
  const upcoming = races.filter((r) => new Date(r.date) >= now)
  const past = races.filter((r) => new Date(r.date) < now)

  return (
    <>
      <div className="clabel" style={{ marginBottom: '0.5rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        STRATÉGIES DE COURSE
      </div>

      <Link to="/" className="mlabel" style={{ display: 'inline-block', marginBottom: '1.25rem', textDecoration: 'none', color: 'var(--vl-text-3)' }}>
        ← Dashboard
      </Link>

      {isLoading ? (
        <div className="loading">
          <div className="spinner" />
          <span className="mlabel">Chargement</span>
        </div>
      ) : races.length === 0 ? (
        <div className="mlabel">Aucune course</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="mlabel" style={{ marginBottom: '0.75rem', color: 'var(--vl-ember)' }}>À VENIR</div>
              <div className="race-list">
                {upcoming.map((race) => (
                  <NavLink key={race.id} to={`/race/${race.id}`} className="race-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="race-info">
                      <div className="race-name">{race.name}</div>
                      <div className="race-meta">
                        {formatDate(race.date)}
                        {race.distance && ` · ${race.distance} km`}
                        {race.elevation && ` · ↑${race.elevation} m`}
                      </div>
                    </div>
                    {race.type && (
                      <div className="race-tags">
                        <span className="race-tag" style={{ borderColor: 'var(--vl-ember)', color: 'var(--vl-ember)' }}>{race.type}</span>
                      </div>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <div className="mlabel" style={{ marginBottom: '0.75rem' }}>PASSÉES</div>
              <div className="race-list">
                {past.map((race) => (
                  <NavLink key={race.id} to={`/race/${race.id}`} className="race-item" style={{ textDecoration: 'none', color: 'inherit', opacity: 0.6 }}>
                    <div className="race-info">
                      <div className="race-name">{race.name}</div>
                      <div className="race-meta">
                        {formatDate(race.date)}
                        {race.distance && ` · ${race.distance} km`}
                      </div>
                    </div>
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
