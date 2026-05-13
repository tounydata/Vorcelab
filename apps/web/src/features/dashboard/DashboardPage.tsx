import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStravaStore } from '@/features/activities/useStravaStore'
import { useRaceStore } from '@/features/race-calendar/useRaceStore'
import type { Race, StravaActivity } from '@runner-os/shared'
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

function getRacePhase(days: number): { label: string; color: string } {
  if (days <= 7) return { label: '🏁 Semaine de course !', color: 'var(--orange)' }
  if (days <= 21) return { label: 'Affûtage', color: 'var(--yellow)' }
  if (days <= 42) return { label: 'Préparation spécifique', color: 'var(--cyan)' }
  return { label: 'Construction de base', color: 'var(--green)' }
}

function formatRaceDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateStr))
}

function NextRacePanel({ nextRace, daysToNext }: { nextRace: Race | undefined; daysToNext: number | null }) {
  const navigate = useNavigate()

  if (!nextRace || daysToNext == null) {
    return (
      <section
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ fontFamily: 'var(--mono)', fontSize: '.56rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
          Prochaine course
        </div>
        <div style={{ fontSize: '2rem', opacity: .25, textAlign: 'center', padding: '1rem 0' }}>🏔</div>
        <div style={{ color: 'var(--text2)', fontSize: '.82rem', lineHeight: 1.7, textAlign: 'center' }}>
          Aucune course planifiée.<br />Ajoute-en une pour voir ton compte à rebours et ta phase d&apos;entraînement.
        </div>
        <button
          onClick={() => { void navigate('/calendar') }}
          style={{
            background: 'var(--cyan)', color: '#000', border: 'none',
            borderRadius: 8, padding: '9px 16px',
            fontFamily: 'var(--body)', fontWeight: 700, fontSize: '.82rem',
            cursor: 'pointer', marginTop: 'auto',
          }}
        >
          + Ajouter une course
        </button>
      </section>
    )
  }

  const phase = getRacePhase(daysToNext)
  const totalWeeks = Math.ceil(daysToNext / 7)
  const progressPct = Math.max(0, Math.min(100, 100 - (daysToNext / Math.max(daysToNext + 14, 84)) * 100))

  return (
    <section
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '.9rem',
      }}
    >
      <div style={{ fontFamily: 'var(--mono)', fontSize: '.56rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
        Prochaine course
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.75rem' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '3.8rem', lineHeight: 1, color: 'var(--cyan)' }}>
          {String(daysToNext)}
        </div>
        <div style={{ paddingBottom: '.4rem' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.56rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            jours
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.65rem', color: phase.color, marginTop: 2 }}>
            {phase.label}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: '.95rem', lineHeight: 1.3 }}>{nextRace.name}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text3)', marginTop: 2 }}>
          {formatRaceDate(nextRace.date)}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {nextRace.type && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--cyan)',
            background: 'rgba(0,212,255,.08)', border: '1px solid rgba(0,212,255,.2)',
            borderRadius: 20, padding: '3px 9px',
          }}>{nextRace.type}</span>
        )}
        {nextRace.distance != null && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text2)',
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            borderRadius: 20, padding: '3px 9px',
          }}>{nextRace.distance} km</span>
        )}
        {nextRace.elevation != null && nextRace.elevation > 0 && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text2)',
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            borderRadius: 20, padding: '3px 9px',
          }}>D+ {nextRace.elevation} m</span>
        )}
        {nextRace.goal_time && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--yellow)',
            background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)',
            borderRadius: 20, padding: '3px 9px',
          }}>Objectif {nextRace.goal_time}</span>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: '.52rem', color: 'var(--text3)', marginBottom: 5 }}>
          <span>Progression</span>
          <span>{totalWeeks} sem. restantes</span>
        </div>
        <div style={{ background: 'var(--bg4)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            background: `linear-gradient(90deg, var(--cyan), var(--purple))`,
            width: `${progressPct}%`,
            transition: 'width .4s ease',
          }} />
        </div>
      </div>

      <button
        onClick={() => { void navigate('/calendar') }}
        style={{
          background: 'transparent', color: 'var(--cyan)',
          border: '1px solid rgba(0,212,255,.3)', borderRadius: 8,
          padding: '8px 14px', fontFamily: 'var(--mono)',
          fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.06em',
          cursor: 'pointer', marginTop: 'auto',
        }}
      >
        Voir le calendrier →
      </button>
    </section>
  )
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

        <NextRacePanel nextRace={nextRace} daysToNext={daysToNext} />
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
