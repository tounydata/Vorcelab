import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchStreams } from '../lib/fetchStreams'
import { fetchWeather } from '../lib/fetchWeather'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import { fmtP, fmtD, tL } from '../utils/formatters'
import { computeRaceContext, computeHRZones } from '../utils/raceContext'
import { StatBlock } from '../components/StatBlock'
import { AltHRChart } from '../components/charts/AltHRChart'
import { HRZonesChart } from '../components/charts/HRZonesChart'
import { ActivityMap } from '../components/ActivityMap'

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

  const { data: enriched } = useQuery({
    queryKey: ['activity-enriched', id],
    queryFn: async () => {
      const streams = await fetchStreams(Number(id))
      const llStream = streams.latlng?.data
      let lat0 = activity!.start_latlng?.[0]
      let lon0 = activity!.start_latlng?.[1]
      if ((lat0 == null || lon0 == null) && Array.isArray(llStream) && llStream.length) {
        lat0 = llStream[0][0]; lon0 = llStream[0][1]
      }
      const weather = lat0 != null && lon0 != null
        ? await fetchWeather(lat0, lon0, activity!.start_date_local || activity!.start_date)
        : null
      return { streams, weather }
    },
    enabled: !!activity,
    staleTime: 5 * 60 * 1000,
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

  const streams = enriched?.streams
  const weather = enriched?.weather ?? null
  const ctx = enriched ? computeRaceContext(activity, weather) : null
  const altData = streams?.altitude?.data || []
  const hrData = streams?.heartrate?.data || []
  const distData = streams?.distance?.data || []
  const latlng = streams?.latlng?.data || []
  const zones = computeHRZones(hrData, 185)

  return (
    <div style={{ maxWidth: 660 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 8, marginBottom: 16 }}>
        <StatBlock label="km" value={distKm} color="var(--color-distance,var(--vl-ember))" />
        <StatBlock label="temps" value={fmtD(activity.moving_time)} />
        <StatBlock
          label="/km"
          value={fmtP(activity.average_speed)}
          sub={ctx ? `contextualisé ${ctx.paceNorm}/km` : undefined}
          color="var(--vl-amber)"
        />
        {hasEle && <StatBlock label="D+ m" value={`+${Math.round(activity.total_elevation_gain)}`} color="var(--color-elevation,var(--vl-growth))" />}
        {hasHR && <StatBlock label="FC moy" value={String(Math.round(activity.average_heartrate!))} sub={activity.max_heartrate ? `max ${activity.max_heartrate} bpm` : undefined} />}
      </div>

      {/* Race context factors */}
      {ctx && ctx.factors.length > 0 && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 8 }}>
            FACTEURS DE COURSE · CONDITIONS +{(ctx.totalAdj * 100).toFixed(0)}%
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ctx.factors.map(f => (
              <div key={f.label} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.62rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: 'var(--vl-text-3)' }}>{f.label}</span>
                <span style={{ color: 'var(--vl-text-2)' }}>{f.value}</span>
                <span style={{ color: f.color, fontWeight: 700 }}>{f.adj}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: altData.length ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 16 }}>
        {altData.length > 0 && (
          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 8 }}>
              PROFIL ALTIMÉTRIQUE{hrData.length ? ' & FC' : ''}
            </div>
            <AltHRChart altitude={altData} heartrate={hrData} distance={distData} />
          </div>
        )}
        {hrData.length > 0 && zones.some(z => z > 0) && (
          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 8 }}>
              RÉPARTITION ZONES FC
            </div>
            <HRZonesChart zones={zones} />
          </div>
        )}
      </div>

      {/* Map */}
      {latlng.length > 1 && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 8 }}>
            CARTE DU PARCOURS
          </div>
          <ActivityMap latlng={latlng} />
        </div>
      )}

      {/* Loading streams indicator */}
      {!enriched && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '20px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', letterSpacing: '.08em' }}>
            Chargement des streams Strava…
          </div>
        </div>
      )}

      {/* No streams message */}
      {enriched && !altData.length && !hrData.length && !latlng.length && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '20px', textAlign: 'center', marginBottom: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: 'var(--vl-line)' }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>
            Données de stream non disponibles — vérifie ta connexion Strava.
          </div>
        </div>
      )}
    </div>
  )
}
