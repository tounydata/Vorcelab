import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
// @ts-ignore
import { computeActivityLoad } from '../../training-load.js'

interface ActivityDetail {
  id: string
  name: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  elapsed_time: number | null
  start_date: string
  start_date_local: string | null
  type: string
  sport_type: string | null
  average_heartrate: number | null
  max_heartrate: number | null
  average_speed: number | null
  max_speed: number | null
  suffer_score: number | null
  description: string | null
  kudos_count: number | null
}

function fmtKm(m: number) { return (m / 1000).toFixed(2) }
function fmtTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}h${String(m).padStart(2, '0')}'${String(sec).padStart(2, '0')}`
    : `${m}'${String(sec).padStart(2, '0')}`
}
function fmtPace(distM: number, timeS: number) {
  if (!distM || !timeS) return '—'
  const secPerKm = timeS / (distM / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}'${String(s).padStart(2, '0')}/km`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtSpeed(ms: number | null) {
  if (!ms) return '—'
  return `${(ms * 3.6).toFixed(1)} km/h`
}

function hrZoneLabel(pct: number) {
  if (pct >= 0.90) return { label: 'Z5 — Rouge', color: '#e74c3c' }
  if (pct >= 0.80) return { label: 'Z4 — Orange', color: '#e67e22' }
  if (pct >= 0.70) return { label: 'Z3 — Vert', color: '#2ecc71' }
  if (pct >= 0.60) return { label: 'Z2 — Bleu', color: '#3498db' }
  return { label: 'Z1 — Gris', color: '#95a5a6' }
}

const FC_MAX = 205

export default function ActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>()
  const { user } = useVLStore()

  const { data: profile } = useQuery<{ fc_max?: number } | null>({
    queryKey: ['profile-fcmax'],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase.from('profiles').select('fc_max').eq('id', user.id).single()
      return data
    },
    enabled: !!user,
  })

  const fcMax = profile?.fc_max ?? FC_MAX

  const { data: activity, isLoading, isError } = useQuery<ActivityDetail | null>({
    queryKey: ['activity-detail', activityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,name,distance,total_elevation_gain,moving_time,elapsed_time,start_date,start_date_local,type,sport_type,average_heartrate,max_heartrate,average_speed,max_speed,suffer_score,description,kudos_count')
        .eq('id', activityId!)
        .single()
      if (error) throw error
      return data as ActivityDetail
    },
    enabled: !!activityId,
  })

  const BackLink = () => (
    <Link to="/activities" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
      ← Activités
    </Link>
  )

  if (isLoading) return <><BackLink /><div className="loading"><div className="spinner" /></div></>
  if (isError || !activity) return <><BackLink /><div className="mlabel">Activité introuvable.</div></>

  const load = computeActivityLoad(activity, fcMax)
  const paceStr = fmtPace(activity.distance, activity.moving_time)
  const dpKm = activity.distance > 0 ? (activity.total_elevation_gain ?? 0) / (activity.distance / 1000) : 0

  const hrZone = activity.average_heartrate
    ? hrZoneLabel(activity.average_heartrate / fcMax)
    : null

  return (
    <>
      <BackLink />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', letterSpacing: '0.02em', lineHeight: 1.1, marginBottom: 6 }}>
          {activity.name}
        </div>
        <div className="act-meta">
          {fmtDate(activity.start_date_local ?? activity.start_date)}
          {' · '}{activity.sport_type ?? activity.type}
        </div>
        {activity.description && (
          <div className="mlabel" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)' }}>
            {activity.description}
          </div>
        )}
      </div>

      {/* Stats principales */}
      <div className="strip" style={{ marginBottom: '1rem' }}>
        <div className="scell">
          <div className="sval">{fmtKm(activity.distance)}</div>
          <div className="slbl">KM</div>
        </div>
        <div className="scell">
          <div className="sval">{fmtTime(activity.moving_time)}</div>
          <div className="slbl">Temps</div>
        </div>
        <div className="scell">
          <div className="sval">{paceStr}</div>
          <div className="slbl">Allure</div>
        </div>
        <div className="scell">
          <div className="sval">+{Math.round(activity.total_elevation_gain ?? 0)}</div>
          <div className="slbl">D+</div>
        </div>
      </div>

      {/* Métriques secondaires */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="clabel" style={{ marginBottom: '0.75rem' }}>MÉTRIQUES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {[
            { label: 'D+/km', val: `${dpKm.toFixed(0)} m/km` },
            { label: 'Vitesse moy.', val: fmtSpeed(activity.average_speed) },
            { label: 'Vitesse max', val: fmtSpeed(activity.max_speed) },
            { label: 'Temps total', val: activity.elapsed_time ? fmtTime(activity.elapsed_time) : '—' },
            { label: 'FC moy.', val: activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : '—' },
            { label: 'FC max', val: activity.max_heartrate ? `${Math.round(activity.max_heartrate)} bpm` : '—' },
            { label: 'Suffer score', val: activity.suffer_score != null ? String(activity.suffer_score) : '—' },
            { label: 'Kudos', val: activity.kudos_count != null ? String(activity.kudos_count) : '—' },
          ].map(({ label, val }) => (
            <div key={label} className="fg" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mlabel" style={{ color: 'var(--vl-text-3)' }}>{label}</span>
              <span className="mlabel">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Zone cardiaque */}
      {hrZone && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="clabel" style={{ marginBottom: '0.5rem' }}>ZONE CARDIAQUE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: hrZone.color, flexShrink: 0 }} />
            <span className="fl" style={{ color: hrZone.color }}>{hrZone.label}</span>
          </div>
          <div className="mlabel" style={{ marginTop: 4, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
            FC moy. {Math.round(activity.average_heartrate!)} bpm / FC max ref. {fcMax} bpm
            {' '}({((activity.average_heartrate! / fcMax) * 100).toFixed(0)} %)
          </div>
        </div>
      )}

      {/* Impact charge */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="clabel" style={{ marginBottom: '0.5rem' }}>CHARGE TRIMP</div>
        <div className="sval" style={{ color: load > 200 ? 'var(--vl-ember)' : load > 100 ? 'var(--vl-amber)' : 'var(--vl-growth)' }}>
          {load}
        </div>
        <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Points de charge interne (durée × intensité × dénivelé × type)
        </div>
      </div>
    </>
  )
}
