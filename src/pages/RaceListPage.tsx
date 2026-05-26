import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
}

interface Activity {
  id: string
  name: string
  distance: number
  total_elevation_gain: number | null
  moving_time: number | null
  start_date: string
  start_date_local: string | null
  type: string
  sport_type: string | null
}

interface RenfoLog {
  session_date: string
  focus: string | null
}

function isRunning(a: { type: string; sport_type?: string | null }) {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(a.type) ||
    ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(a.sport_type ?? '')
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export default function RaceListPage() {
  const { user } = useVLStore()
  const [currentDate, setCurrentDate] = useState(new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // ── Races ──────────────────────────────────────────────────────────────────
  const { data: races = [] } = useQuery<Race[]>({
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

  // ── Activities for displayed month ─────────────────────────────────────────
  const { data: monthActivities = [] } = useQuery<Activity[]>({
    queryKey: ['activities-calendar', year, month],
    queryFn: async () => {
      const start = new Date(year, month, 1).toISOString()
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
      const { data } = await supabase
        .from('strava_activities')
        .select('id,name,distance,total_elevation_gain,moving_time,start_date,start_date_local,type,sport_type')
        .gte('start_date', start)
        .lte('start_date', end)
      return (data ?? []) as Activity[]
    },
  })

  // ── Renfo logs for displayed month ─────────────────────────────────────────
  const { data: monthRenfoLogs = [] } = useQuery<RenfoLog[]>({
    queryKey: ['renfo-calendar', year, month],
    queryFn: async () => {
      if (!user) return []
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const { data } = await supabase
        .from('renfo_focus_log')
        .select('session_date,focus')
        .eq('user_id', user.id)
        .gte('session_date', start)
        .lte('session_date', end)
      return (data ?? []) as RenfoLog[]
    },
    enabled: !!user,
  })

  // ── Calendar grid construction ─────────────────────────────────────────────
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = toDateStr(new Date())

  const cells = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - startOffset + 1
    const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth
    const date = new Date(year, month, dayNum)
    const dateStr = toDateStr(date)
    const isToday = dateStr === todayStr
    return { dayNum, isCurrentMonth, date, dateStr, isToday }
  })

  // ── Index lookups ──────────────────────────────────────────────────────────
  const activitiesByDate: Record<string, Activity[]> = {}
  for (const a of monthActivities) {
    const d = (a.start_date_local ?? a.start_date).slice(0, 10)
    if (!activitiesByDate[d]) activitiesByDate[d] = []
    activitiesByDate[d].push(a)
  }

  const renfoByDate: Record<string, RenfoLog[]> = {}
  for (const r of monthRenfoLogs) {
    if (!renfoByDate[r.session_date]) renfoByDate[r.session_date] = []
    renfoByDate[r.session_date].push(r)
  }

  const raceByDate: Record<string, Race> = {}
  for (const r of races) {
    raceByDate[r.date.slice(0, 10)] = r
  }

  // ── Upcoming races (future + today) ───────────────────────────────────────
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const upcoming = races.filter((r) => new Date(r.date) >= now)

  function daysLeft(dateIso: string) {
    const d = new Date(dateIso)
    d.setHours(0, 0, 0, 0)
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
    return diff
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const DAY_HEADERS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: '2rem' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 700 }}>
          Calendrier
        </div>
        <Link
          to="/race/new"
          style={{
            fontFamily: 'var(--vl-display)',
            fontSize: '.85rem',
            fontWeight: 700,
            background: 'var(--vl-ember)',
            color: 'var(--vl-ink)',
            border: 'none',
            borderRadius: 6,
            padding: '7px 14px',
            cursor: 'pointer',
            textDecoration: 'none',
            pointerEvents: 'none',
            opacity: 0.5,
          }}
        >
          + Ajouter une course
        </Link>
      </div>

      {/* ── Month navigation ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1rem' }}>
        <button
          onClick={prevMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vl-text-2)', fontSize: '1.1rem', padding: '4px 8px' }}
        >
          ←
        </button>
        <span style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 700, minWidth: 120, textAlign: 'center' }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vl-text-2)', fontSize: '1.1rem', padding: '4px 8px' }}
        >
          →
        </button>
      </div>

      {/* ── Calendar grid ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '2rem' }}>
        {/* Day headers */}
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            style={{
              fontFamily: 'var(--vl-mono)',
              fontSize: 9,
              color: 'var(--vl-text-3)',
              textAlign: 'center',
              padding: '4px 0',
              borderBottom: '1px solid var(--vl-line)',
              letterSpacing: '.08em',
            }}
          >
            {d}
          </div>
        ))}

        {/* Day cells */}
        {cells.map(({ dayNum, isCurrentMonth, dateStr, isToday }, i) => {
          const dayActivities = activitiesByDate[dateStr] ?? []
          const dayRenfo = renfoByDate[dateStr] ?? []
          const dayRace = raceByDate[dateStr]
          const runs = dayActivities.filter(isRunning)

          return (
            <div
              key={i}
              style={{
                border: '1px solid var(--vl-line)',
                padding: '4px 5px',
                minHeight: 64,
                opacity: isCurrentMonth ? 1 : 0.3,
                background: isToday ? 'var(--vl-surf-2)' : 'transparent',
                outline: isToday ? '2px solid var(--vl-ember)' : 'none',
                outlineOffset: -1,
                boxSizing: 'border-box',
              }}
            >
              {/* Day number */}
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)', marginBottom: 2 }}>
                {isCurrentMonth || dayNum !== 0
                  ? Math.abs(dayNum) > 0
                    ? (() => {
                        // Show actual calendar day number for out-of-month cells
                        return new Date(cells[i].date).getDate()
                      })()
                    : ''
                  : ''}
              </div>

              {/* Runs */}
              {runs.map((a) => (
                <div
                  key={a.id}
                  style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden' }}
                >
                  → {(a.distance / 1000).toFixed(1)}k
                </div>
              ))}

              {/* Renfo */}
              {dayRenfo.length > 0 && (
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: '#a78bfa', lineHeight: 1.4 }}>
                  ⊕⊕ RENFO
                </div>
              )}

              {/* Race */}
              {dayRace && (
                <div
                  style={{
                    background: 'var(--vl-ember)',
                    color: 'var(--vl-ink)',
                    borderRadius: 3,
                    padding: '2px 4px',
                    fontSize: 9,
                    fontFamily: 'var(--vl-mono)',
                    marginTop: 2,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {dayRace.name.length > 12 ? dayRace.name.slice(0, 12) + '…' : dayRace.name}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Upcoming races list ────────────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <div>
          <div
            className="mlabel"
            style={{ letterSpacing: '.14em', marginBottom: '.75rem' }}
          >
            PROCHAINES COURSES
          </div>

          {upcoming.map((race) => {
            const dl = daysLeft(race.date)
            return (
              <div
                key={race.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--vl-line)',
                }}
              >
                {/* Type icon */}
                <span style={{ color: race.type === 'Trail' ? 'var(--vl-ember)' : 'var(--vl-growth)', fontSize: 16, flexShrink: 0 }}>
                  {race.type === 'Trail' ? '⛰' : '→'}
                </span>

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '.95rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {race.name}
                  </div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
                    {formatDate(race.date)}
                    {race.distance ? ` · ${race.distance}km` : ''}
                    {race.elevation ? ` · ${race.elevation}m D+` : ''}
                  </div>
                </div>

                {/* Days left */}
                <Link
                  to={`/race/${race.id}`}
                  style={{
                    fontFamily: 'var(--vl-display)',
                    fontSize: '1rem',
                    fontWeight: 800,
                    color: 'var(--vl-ember)',
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  {dl === 0 ? 'Aujourd\'hui →' : `${dl}j →`}
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {upcoming.length === 0 && races.length === 0 && (
        <div className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Aucune course planifiée</div>
      )}
    </div>
  )
}
