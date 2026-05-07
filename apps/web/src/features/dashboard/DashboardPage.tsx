import { useEffect } from 'react'
import { useStravaStore } from '@/features/activities/useStravaStore'
import { useRaceStore } from '@/features/race-calendar/useRaceStore'
import type { StravaActivity } from '@runner-os/shared'
import { metresToKm, speedToPace } from '@runner-os/shared'

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${String(hours)}h${String(minutes).padStart(2, '0')}`
  return `${String(minutes)}min`
}

function formatDate(value: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function getRuns(activities: StravaActivity[]): StravaActivity[] {
  return activities.filter((a) => ['Run', 'TrailRun', 'VirtualRun'].includes(a.type))
}

export function DashboardPage() {
  const { activities, connected, connectStrava, loadActivities } = useStravaStore()
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
          Bienvenue sur VORCELAB
        </div>
        <div style={{ fontSize: '.88rem', color: 'var(--text2)', maxWidth: 430, lineHeight: 1.6 }}>
          Connecte ton compte Strava pour importer tes activités et débloquer ton tableau de bord.
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
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  const runs = getRuns(activities)
  const thisMonth = runs.filter((a) => new Date(a.start_date) >= monthStart)
  const last7Days = runs.filter((a) => new Date(a.start_date) >= sevenDaysAgo)
  const last30Days = runs.filter((a) => new Date(a.start_date) >= thirtyDaysAgo)
  const latest = runs[0]

  const kmMonth = thisMonth.reduce((sum, a) => sum + a.distance, 0)
  const km7Days = last7Days.reduce((sum, a) => sum + a.distance, 0)
  const km30Days = last30Days.reduce((sum, a) => sum + a.distance, 0)
  const elevMonth = thisMonth.reduce((sum, a) => sum + a.total_elevation_gain, 0)
  const timeMonth = thisMonth.reduce((sum, a) => sum + a.moving_time, 0)
  const longestRun = runs.length > 0 ? runs.reduce((max, a) => (a.distance > max.distance ? a : max), runs[0]) : null
  const avgHrValues = thisMonth
    .map((a) => a.average_heartrate)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const avgHr =
    avgHrValues.length > 0
      ? Math.round(avgHrValues.reduce((sum, value) => sum + value, 0) / avgHrValues.length)
      : null

  const nextRace = races.find((r) => new Date(r.date) >= now)
  const daysToNext = nextRace
    ? Math.ceil((new Date(nextRace.date).getTime() - now.getTime()) / 86400000)
    : null

  const heroStats = [
    { value: metresToKm(kmMonth), label: 'km / mois', tone: 'var(--cyan)' },
    { value: String(thisMonth.length), label: 'sorties', tone: 'var(--green)' },
    { value: `+${String(Math.round(elevMonth))}`, label: 'D+ mois', tone: 'var(--orange)' },
    { value: formatDuration(timeMonth), label: 'temps actif', tone: 'var(--purple)' },
    { value: avgHr != null ? String(avgHr) : '—', label: 'FC moy.', tone: 'var(--red)' },
    {
      value: nextRace && daysToNext != null ? `J-${String(daysToNext)}` : '—',
      label: 'prochain objectif',
      tone: 'var(--yellow)',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section
        style={{
          background:
            'linear-gradient(135deg, rgba(0,212,255,.10), rgba(167,139,250,.08) 42%, rgba(255,107,53,.06))',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '1.4rem',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            marginBottom: '1.2rem',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '.56rem',
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: '.12em',
                marginBottom: '.35rem',
              }}
            >
              Vorcelab · Running intelligence
            </div>
            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: '2.2rem',
                lineHeight: 1,
                letterSpacing: '.04em',
              }}
            >
              Dashboard course
            </div>
            <div style={{ color: 'var(--text2)', fontSize: '.82rem', marginTop: '.45rem' }}>
              {runs.length} activités synchronisées · {metresToKm(km30Days)} km sur 30 jours
            </div>
          </div>

          <div
            style={{
              background: 'rgba(6,8,16,.45)',
              border: '1px solid var(--border2)',
              borderRadius: 12,
              padding: '11px 14px',
              minWidth: 190,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '.54rem',
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
              }}
            >
              dernière sortie
            </div>
            <div style={{ fontWeight: 700, fontSize: '.88rem', marginTop: 5 }}>
              {latest?.name ?? 'Aucune sortie'}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text2)', marginTop: 3 }}>
              {latest ? `${formatDate(latest.start_date)} · ${metresToKm(latest.distance)} km` : '—'}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 1,
            background: 'var(--border)',
            borderRadius: 'var(--r)',
            overflow: 'hidden',
          }}
        >
          {heroStats.map((cell) => (
            <div key={cell.label} style={{ background: 'rgba(13,18,25,.92)', padding: '14px 16px' }}>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: '1.65rem',
                  letterSpacing: '.03em',
                  lineHeight: 1,
                  color: cell.tone,
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
                  marginTop: 4,
                }}
              >
                {cell.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, .75fr)', gap: 14 }}>
        <section
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '1.25rem',
          }}
        >
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
            Focus charge récente
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {[
              { label: '7 derniers jours', value: `${metresToKm(km7Days)} km`, sub: `${last7Days.length} sorties` },
              { label: '30 derniers jours', value: `${metresToKm(km30Days)} km`, sub: `${last30Days.length} sorties` },
              {
                label: 'plus longue sortie',
                value: longestRun ? `${metresToKm(longestRun.distance)} km` : '—',
                sub: longestRun?.name ?? 'aucune donnée',
              },
              {
                label: 'allure dernière',
                value: latest ? speedToPace(latest.average_speed) : '—',
                sub: latest ? formatDuration(latest.moving_time) : 'aucune donnée',
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '13px 14px',
                }}
              >
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.45rem', lineHeight: 1 }}>{item.value}</div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '.54rem',
                    color: 'var(--text3)',
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    marginTop: 5,
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--text2)', marginTop: 5 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '.56rem',
              color: 'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '.1em',
              marginBottom: '.75rem',
            }}
          >
            Prochain objectif
          </div>
          {nextRace && daysToNext != null ? (
            <>
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
                  marginBottom: '.6rem',
                }}
              >
                jours restants
              </div>
              <div style={{ fontWeight: 700 }}>{nextRace.name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text2)', marginTop: 4 }}>
                {nextRace.distance} km · {nextRace.elevation ?? 0} m D+
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text2)', fontSize: '.82rem', lineHeight: 1.6 }}>
              Ajoute une course dans le calendrier pour afficher le compte à rebours et les objectifs.
            </div>
          )}
        </section>
      </div>

      <section>
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))',
            gap: 10,
          }}
        >
          {runs.slice(0, 12).map((a) => (
            <div
              key={a.id}
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '13px 14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: '.84rem', lineHeight: 1.25 }}>{a.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.56rem', color: 'var(--text3)' }}>
                  {formatDate(a.start_date)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: '.68rem' }}>
                <span>{metresToKm(a.distance)} km</span>
                <span>{speedToPace(a.average_speed)}</span>
                <span>+{String(Math.round(a.total_elevation_gain))} m</span>
                {a.average_heartrate != null && <span>{Math.round(a.average_heartrate)} bpm</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
