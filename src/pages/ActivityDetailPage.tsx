import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import { fmtP, fmtD, tL } from '../utils/formatters'
import { StatBlock } from '../components/StatBlock'

export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const user = useVLStore(s => s.user)

  const { data: activity, isLoading, isError } = useQuery({
    queryKey: ['activity', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('strava_activity_id', id)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return mapDbActivity(data as Record<string, unknown>)
    },
    enabled: !!user && !!id,
  })

  if (isLoading) {
    return (
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-3)', padding: '60px 0', textAlign: 'center' }}>
        Chargement…
      </div>
    )
  }

  if (isError || !activity) {
    return (
      <div style={{ padding: 20 }}>
        <Link to="/activities" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-text-3)', textDecoration: 'none' }}>
          ← Activités
        </Link>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-ember)', marginTop: 24 }}>
          Activité introuvable.
        </div>
      </div>
    )
  }

  const date = new Date(activity.start_date_local || activity.start_date)
  const dateStr = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const distKm = (activity.distance / 1000).toFixed(1)
  const hasEle = activity.total_elevation_gain > 0
  const hasHR = activity.average_heartrate != null
  const colCount = 3 + (hasEle ? 1 : 0) + (hasHR ? 1 : 0)

  return (
    <div style={{ maxWidth: 600 }}>
      <Link
        to="/activities"
        style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-text-3)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 24, textDecoration: 'none' }}
      >
        ← Activités
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 800,
            letterSpacing: '.01em', textTransform: 'uppercase', lineHeight: 1.1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0,
          }}>
            {activity.name}
          </h1>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginTop: 4 }}>
            {dateStr}
          </div>
        </div>
        <span className="act-badge" style={{ flexShrink: 0 }}>{tL(activity.type)}</span>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 8, marginBottom: 24 }}>
        <StatBlock label="km" value={distKm} color="var(--color-distance,var(--vl-ember))" />
        <StatBlock label="temps" value={fmtD(activity.moving_time)} />
        <StatBlock label="/km" value={fmtP(activity.average_speed)} color="var(--vl-amber)" />
        {hasEle && <StatBlock label="D+ m" value={`+${Math.round(activity.total_elevation_gain)}`} color="var(--color-elevation,var(--vl-growth))" />}
        {hasHR && <StatBlock label="FC moy" value={String(Math.round(activity.average_heartrate!))} />}
      </div>

      {/* Secondary stats */}
      {(activity.elapsed_time > 0 || activity.max_speed > 0 || activity.kilojoules) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
          {activity.elapsed_time > 0 && <StatBlock label="temps total" value={fmtD(activity.elapsed_time)} />}
          {activity.max_speed > 0 && <StatBlock label="vmax /km" value={fmtP(activity.max_speed)} />}
          {activity.max_heartrate && <StatBlock label="FC max" value={String(activity.max_heartrate)} color="var(--vl-ember)" />}
        </div>
      )}

      {/* Streams placeholder — Phase 1 */}
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '20px', textAlign: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: 'var(--vl-line)' }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginBottom: 6 }}>
          GRAPHIQUE FC · ALTITUDE
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>
          Phase 1 — streams en cours d'intégration
        </div>
      </div>
    </div>
  )
}
