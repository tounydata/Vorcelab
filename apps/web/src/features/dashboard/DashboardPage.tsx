import { useEffect } from 'react'
import { useStravaStore } from '@/features/activities/useStravaStore'
import { useRaceStore } from '@/features/race-calendar/useRaceStore'
import { metresToKm } from '@runner-os/shared'

export function DashboardPage() {
  const { activities, zoneData, connected, connectStrava, loadActivities } = useStravaStore()
  const { races, loadRaces } = useRaceStore()

  useEffect(() => {
    void loadActivities()
    void loadRaces()
  }, [loadActivities, loadRaces])

  if (!connected) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '1.5rem',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <div style={{ fontSize: '4rem', opacity: 0.3 }}>🏃</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: '2rem', letterSpacing: '.03em' }}>
          Bienvenue sur Runner OS
        </div>
        <div style={{ fontSize: '.88rem', color: 'var(--text2)', maxWidth: 400, lineHeight: 1.6 }}>
          Connecte ton compte Strava pour débloquer le dashboard et voir tes stats de course.
        </div>
        <button
          onClick={() => {
            connectStrava()
          }}
          style={{
            background: '#fc4c02',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 24px',
            fontFamily: 'var(--body)',
            fontWeight: 700,
            fontSize: '.88rem',
            cursor: 'pointer',
            maxWidth: 300,
            width: '100%',
          }}
        >
          Connecter Strava →
        </button>
      </div>
    )
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const runs = activities.filter((a) => ['Run', 'TrailRun', 'VirtualRun'].includes(a.type))
  const thisMonth = runs.filter((a) => new Date(a.start_date) >= monthStart)
  const kmMonth = thisMonth.reduce((sum, a) => sum + a.distance, 0)
  const elevMonth = thisMonth.reduce((sum, a) => sum + a.total_elevation_gain, 0)

  const nextRace = races.find((r) => new Date(r.date) >= now)
  const daysToNext = nextRace
    ? Math.ceil((new Date(nextRace.date).getTime() - now.getTime()) / 86400000)
    : null

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const last7DaysRuns = runs.filter((a) => new Date(a.start_date) >= sevenDaysAgo)
  const totalMovingTime7Days = last7DaysRuns.reduce((sum, a) => sum + a.moving_time, 0)
  const z2Time7Days = last7DaysRuns.reduce((sum, a) => {
    const hrZones = zoneData?.[String(a.id)]?.heart_rate
    if (!hrZones || hrZones.length === 0) return sum

    const activityZ2Time = hrZones
      .filter((zone) => zone.min >= 60 && zone.max <= 72)
      .reduce((zoneSum, zone) => zoneSum + zone.time, 0)

    return sum + activityZ2Time
  }, 0)

  const z2Percent7Days =
    totalMovingTime7Days > 0 ? Math.round((z2Time7Days / totalMovingTime7Days) * 100) : null
  const longestRunKm = runs.length > 0 ? metresToKm(Math.max(...runs.map((a) => a.distance))) : '—'

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6,1fr)',
          gap: 1,
          background: 'var(--border)',
          borderRadius: 'var(--r)',
          overflow: 'hidden',
          marginBottom: '1.25rem',
        }}
      >
        {[
          { value: metresToKm(kmMonth), label: 'km / mois' },
          { value: String(thisMonth.length), label: 'sorties' },
          { value: `+${String(Math.round(elevMonth))}`, label: 'D+ mois' },
          {
            value: z2Percent7Days != null ? `${String(z2Percent7Days)}%` : '—',
            label: 'Z2 / 7j (stream)',
          },
          {
            value: nextRace && daysToNext != null ? `J-${String(daysToNext)}` : '—',
            label: 'prochain',
          },
          {
            value: longestRunKm,
            label: 'plus longue',
          },
        ].map((cell) => (
          <div
            key={cell.label}
            style={{ background: 'var(--bg2)', padding: '12px 16px', textAlign: 'center' }}
          >
            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: '1.4rem',
                letterSpacing: '.03em',
                lineHeight: 1,
                color: 'var(--cyan)',
              }}
            >
              {cell.value}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '.54rem',
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                marginTop: 3,
              }}
            >
              {cell.label}
            </div>
          </div>
        ))}
      </div>

      {nextRace && daysToNext != null && (
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '1.25rem',
            marginBottom: '1.25rem',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '.56rem',
              color: 'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '.1em',
              marginBottom: '.5rem',
            }}
          >
            Prochaine course
          </div>
          <div
            style={{
              fontFamily: 'var(--display)',
              fontSize: '4rem',
              lineHeight: 1,
              color: 'var(--cyan)',
            }}
          >
            {String(daysToNext)}
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '.6rem',
              color: 'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            jours — {nextRace.name}
          </div>
        </div>
      )}

      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '.56rem',
          color: 'var(--text3)',
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          marginBottom: '1rem',
        }}
      >
        Dernières activités
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))',
          gap: 10,
        }}
      >
        {runs.slice(0, 9).map((a) => (
          <div
            key={a.id}
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 9,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '.82rem', marginBottom: 4 }}>{a.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--text2)' }}>
              {metresToKm(a.distance)} km · +{String(Math.round(a.total_elevation_gain))} m
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
