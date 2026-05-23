import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbRace } from '../types/race'
import { fmtD } from '../utils/formatters'
import { ProjectionChart } from '../components/ProjectionChart'

export function RaceListPage() {
  const user = useVLStore(s => s.user)

  const { data: races = [], isLoading } = useQuery({
    queryKey: ['races', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id, name, date, type, distance, goal_time, last_projection')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
      if (error) throw error
      return (data || []).map(r => mapDbRace(r as Record<string, unknown>))
    },
    enabled: !!user,
  })

  const now = new Date()
  const upcoming = races.filter(r => new Date(r.date) >= now).reverse()
  const past = races.filter(r => new Date(r.date) < now)

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.04em' }}>
          STRATÉGIES DE COURSE
        </div>
        <Link to="/" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', textDecoration: 'none' }}>
          ← Dashboard
        </Link>
      </div>

      {isLoading ? (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-3)', padding: '40px 0', textAlign: 'center' }}>
          Chargement…
        </div>
      ) : races.length === 0 ? (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', color: 'var(--vl-text-3)', textAlign: 'center', padding: '40px 0', lineHeight: 1.8 }}>
          Aucune course dans le calendrier.<br />
          Ajoutes-en une depuis l'application principale.
        </div>
      ) : (
        <>
          <ProjectionChart races={races} />
          {upcoming.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 12 }}>
                À VENIR · {upcoming.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map(race => <RaceCard key={race.id} race={race} />)}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 12 }}>
                PASSÉES · {past.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {past.map(race => <RaceCard key={race.id} race={race} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function RaceCard({ race }: { race: ReturnType<typeof mapDbRace> }) {
  const date = new Date(race.date)
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  const isTrail = ['Trail', 'TrailRun', 'trail'].includes(race.type)
  const hasProjection = race.last_projection != null
  const distKm = race.distance > 0 ? (race.distance / 1000).toFixed(0) + ' km' : null

  return (
    <Link
      to={`/race/${race.id}`}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', textDecoration: 'none', color: 'inherit', gap: 12 }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {race.name}
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{dateStr}</span>
          {distKm && <span style={{ color: 'var(--vl-ember)' }}>{distKm}</span>}
          {race.goal_time && <span>Objectif {race.goal_time}</span>}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: isTrail ? 'rgba(229,86,42,.15)' : 'rgba(16,185,129,.15)', color: isTrail ? 'var(--vl-ember)' : 'var(--vl-growth)' }}>
          {isTrail ? 'Trail' : 'Route'}
        </span>
        {hasProjection && (
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>
            {fmtD(race.last_projection!.cible)} projetés
          </span>
        )}
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>→</span>
      </div>
    </Link>
  )
}
