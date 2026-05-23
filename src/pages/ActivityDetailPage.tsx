import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchStreams } from '../lib/fetchStreams'
import type { Streams } from '../lib/fetchStreams'
import { fetchWeather } from '../lib/fetchWeather'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import type { Activity } from '../types/activity'
import { fmtP, fmtD, tL, isRun } from '../utils/formatters'
import { computeRaceContext, computeHRZones } from '../utils/raceContext'
import { StatBlock } from '../components/StatBlock'
import { AltHRChart } from '../components/charts/AltHRChart'
import { HRZonesChart } from '../components/charts/HRZonesChart'
import { ActivityMap } from '../components/ActivityMap'

interface Race {
  id: string
  name: string
  date: string
  strava_activity_id?: number | null
}

export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const user = useVLStore(s => s.user)
  const qc = useQueryClient()
  const [showLinkPanel, setShowLinkPanel] = useState(false)

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

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('fc_max,vo2max').eq('id', user!.id).single()
      return data as { fc_max?: number; vo2max?: number } | null
    },
    enabled: !!user,
  })

  const { data: allActivities = [] } = useQuery({
    queryKey: ['activities', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(500)
      return (data || []).filter(r => isRun(r.type as string)).map(r => mapDbActivity(r as Record<string, unknown>))
    },
    enabled: !!user,
  })

  const { data: races = [] } = useQuery<Race[]>({
    queryKey: ['races', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('race_calendar')
        .select('id, name, date, strava_activity_id')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
      return (data || []) as Race[]
    },
    enabled: !!user,
  })

  const linkMutation = useMutation({
    mutationFn: async ({ raceId, actId }: { raceId: string; actId: number }) => {
      const { error } = await supabase
        .from('race_calendar')
        .update({ strava_activity_id: actId })
        .eq('id', raceId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['races', user?.id] })
      setShowLinkPanel(false)
    },
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
  const fcMax = profile?.fc_max ?? 185
  const zones = computeHRZones(hrData, fcMax)

  const sessionInsights = activity ? buildSessionInsights(activity, streams ?? null, fcMax) : null
  const vamData = streams ? computeVAMFromStreams(streams) : null
  const similar = allActivities.length > 1 ? findSimilarActivities(activity, allActivities) : []
  const signals = similar.length >= 2 ? computeProgressSignals(activity, similar) : null
  const linkedRace = races.find(r => r.strava_activity_id != null && String(r.strava_activity_id) === String(activity.id))

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

      {/* Session quality block */}
      {sessionInsights && (sessionInsights.hasHR || sessionInsights.insights.length > 0) && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: sessionInsights.drift || sessionInsights.insights.length > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>
              QUALITÉ DE SÉANCE
            </div>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', fontWeight: 700, letterSpacing: '.1em', padding: '3px 8px', borderRadius: 3, background: 'var(--vl-bg)', color: 'var(--vl-text-2)' }}>
              {sessionInsights.type.toUpperCase()}
            </span>
          </div>
          {(sessionInsights.drift || sessionInsights.insights.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sessionInsights.drift && Math.abs(sessionInsights.drift.driftPct) >= 3 && (
                <div style={{ background: 'var(--vl-bg)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, color: sessionInsights.drift.driftPct > 10 ? 'var(--vl-ember)' : sessionInsights.drift.driftPct > 5 ? '#f59e0b' : 'var(--vl-growth)' }}>
                    {sessionInsights.drift.driftPct > 0 ? '+' : ''}{sessionInsights.drift.driftPct}%
                  </div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>DÉRIVE FC</div>
                </div>
              )}
              {sessionInsights.insights.map(ins => (
                <div key={ins.key} style={{ background: 'var(--vl-bg)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800 }}>{ins.value}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>{ins.key.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Athlete profile — VAM / recovery / downhill */}
      {vamData && (vamData.uphillSections.length > 0 || vamData.recoveries.length > 0) && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 10 }}>
            PROFIL ATHLÈTE — EXTRAIT DE CETTE SORTIE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: vamData.avgVAM ? 10 : 0 }}>
            {vamData.avgVAM != null && (
              <div style={{ background: 'var(--vl-bg)', borderRadius: 6, padding: '8px 12px' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.2rem', fontWeight: 800, color: vamData.maxVAM! > 1000 ? 'var(--vl-growth)' : vamData.maxVAM! > 700 ? '#06b6d4' : vamData.maxVAM! > 400 ? '#f59e0b' : 'var(--vl-ember)' }}>
                  {vamData.avgVAM} m/h
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>VAM MOY MONTÉE</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', marginTop: 1 }}>max {vamData.maxVAM} m/h</div>
              </div>
            )}
            {vamData.avgRecovery != null && (
              <div style={{ background: 'var(--vl-bg)', borderRadius: 6, padding: '8px 12px' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.2rem', fontWeight: 800, color: vamData.avgRecovery > 30 ? 'var(--vl-growth)' : vamData.avgRecovery > 20 ? '#06b6d4' : vamData.avgRecovery > 10 ? '#f59e0b' : 'var(--vl-ember)' }}>
                  {vamData.avgRecovery} bpm
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>RÉCUP FC/MIN</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', marginTop: 1 }}>
                  {vamData.avgRecovery > 30 ? 'Rapide' : vamData.avgRecovery > 20 ? 'Correct' : vamData.avgRecovery > 10 ? 'Lent' : 'Très lent'}
                </div>
              </div>
            )}
            {vamData.avgDownhill != null && (
              <div style={{ background: 'var(--vl-bg)', borderRadius: 6, padding: '8px 12px' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-elevation,var(--vl-growth))' }}>
                  {vamData.avgDownhill} km/h
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>VITESSE DESCENTE</div>
              </div>
            )}
            {vamData.uphillSections.length > 0 && (
              <div style={{ background: 'var(--vl-bg)', borderRadius: 6, padding: '8px 12px' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.2rem', fontWeight: 800 }}>
                  {vamData.uphillSections.length}
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>MONTÉES ANALYSÉES</div>
              </div>
            )}
          </div>
          {vamData.avgVAM != null && (
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.62rem', color: 'var(--vl-text-2)', lineHeight: 1.6 }}>
              <strong>Grimpeur :</strong> VAM moyenne {vamData.avgVAM} m/h
              {vamData.avgVAM > 700 ? ' — niveau trail compétitif.' : vamData.avgVAM > 400 ? ' — bon niveau trail loisir.' : ' — marge de progression en montée.'}
              {vamData.avgRecovery != null && (
                <><br /><strong>Récupération :</strong> −{vamData.avgRecovery} bpm/min après montée — {vamData.avgRecovery > 25 ? 'excellente capacité intra-effort.' : vamData.avgRecovery > 15 ? 'capacité correcte.' : 'à travailler.'}</>
              )}
            </div>
          )}
        </div>
      )}

      {/* Link activity to race */}
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 2 }}>
              LIER À UNE COURSE
            </div>
            {linkedRace ? (
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-growth)', fontWeight: 600 }}>
                ✓ {linkedRace.name} · {new Date(linkedRace.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>
                Aucune course liée
              </div>
            )}
          </div>
          <button
            onClick={() => setShowLinkPanel(p => !p)}
            style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', background: 'none', border: '1px solid var(--vl-border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: 'var(--vl-text-2)', flexShrink: 0 }}
          >
            {showLinkPanel ? 'Fermer' : linkedRace ? 'Modifier' : 'Associer'}
          </button>
        </div>
        {showLinkPanel && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {races.length === 0 ? (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>
                Aucune course dans le calendrier —{' '}
                <Link to="/race" style={{ color: 'var(--vl-ember)', textDecoration: 'none' }}>créer une course</Link>
              </span>
            ) : races.map(race => (
              <button
                key={race.id}
                onClick={() => linkMutation.mutate({ raceId: race.id, actId: activity.id })}
                disabled={linkMutation.isPending}
                style={{
                  fontFamily: 'var(--vl-mono)', fontSize: '.55rem',
                  background: linkedRace?.id === race.id ? 'var(--vl-growth)' : 'var(--vl-bg)',
                  color: linkedRace?.id === race.id ? '#000' : 'var(--vl-text-2)',
                  border: '1px solid var(--vl-border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                }}
              >
                {race.name} · {new Date(race.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Progress comparison */}
      {similar.length > 0 && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          {similar.length < 2 || !signals ? (
            <>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 4 }}>COMPARAISON HISTORIQUE</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>
                {similar.length} sortie similaire — pas assez pour comparer.
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>COMPARAISON HISTORIQUE</div>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)' }}>
                  {signals.n} sorties similaires
                </span>
              </div>
              <div style={{
                fontFamily: 'var(--vl-mono)', fontSize: '.7rem', fontWeight: 700,
                color: signals.paceSignal === 'faster' ? 'var(--vl-growth)' : signals.paceSignal === 'slower' ? 'var(--vl-ember)' : 'var(--vl-text-2)',
              }}>
                {signals.paceSignal === 'faster'
                  ? `↑ +${Math.abs(signals.paceDiff!).toFixed(1)}% vs historique`
                  : signals.paceSignal === 'slower'
                  ? `↓ −${Math.abs(signals.paceDiff!).toFixed(1)}% vs historique`
                  : `→ allure comparable à l'historique`}
              </div>
              {signals.hrSignal && signals.hrSignal !== 'similar' && (
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-2)', marginTop: 4 }}>
                  {signals.hrSignal === 'better' ? 'FC plus basse à allure comparable' : 'FC plus haute à allure comparable'}
                </div>
              )}
            </>
          )}
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

// ── Session quality ────────────────────────────────────────────────────────────

const TRAIL_TYPES = new Set(['TrailRun', 'Trail Run'])
function isTrailAct(a: Activity) { return TRAIL_TYPES.has(a.type) }

function classifySession(activity: Activity, fcMax: number): string {
  const durMin = activity.moving_time / 60
  const distKm = activity.distance / 1000
  const dpKm = distKm > 0 ? activity.total_elevation_gain / distKm : 0
  const trail = isTrailAct(activity)
  const hrPct = activity.average_heartrate && fcMax > 0 ? activity.average_heartrate / fcMax : null

  if (durMin < 15) return 'sortie courte'
  if (hrPct !== null) {
    if (hrPct >= 0.90) return 'effort maximal'
    if (hrPct >= 0.82) return 'fractionné probable'
    if (hrPct >= 0.75) return 'tempo / seuil'
    if (hrPct >= 0.68) return durMin >= 90 ? 'sortie longue' : 'endurance active'
    if (hrPct >= 0.60) return durMin >= 90 ? 'sortie longue' : 'endurance facile'
    return durMin >= 60 ? 'sortie longue (récup)' : 'récupération'
  }
  if (trail && dpKm >= 40) return 'trail vallonné'
  if (trail) return 'trail'
  if (durMin >= 120) return 'sortie longue'
  const pace = distKm > 0 ? activity.moving_time / distKm : 0
  if (pace > 0 && pace < 270) return 'effort soutenu'
  if (durMin >= 60) return 'endurance'
  return 'sortie'
}

interface CardiacDrift { first: number; second: number; driftPct: number }
function computeCardiacDrift(streams: Streams | null): CardiacDrift | null {
  const hr = streams?.heartrate?.data
  if (!hr || hr.length < 40) return null
  const mid = Math.floor(hr.length / 2)
  const first = hr.slice(0, mid).reduce((s, v) => s + v, 0) / mid
  const second = hr.slice(mid).reduce((s, v) => s + v, 0) / (hr.length - mid)
  const driftPct = first > 0 ? +((second - first) / first * 100).toFixed(1) : 0
  return { first: Math.round(first), second: Math.round(second), driftPct }
}

interface SessionInsights {
  type: string
  drift: CardiacDrift | null
  insights: { key: string; value: string }[]
  hasHR: boolean
}
function buildSessionInsights(activity: Activity, streams: Streams | null, fcMax: number): SessionInsights {
  const type = classifySession(activity, fcMax)
  const drift = computeCardiacDrift(streams)
  const durMin = activity.moving_time / 60
  const distKm = activity.distance / 1000
  const dpKm = distKm > 0 ? activity.total_elevation_gain / distKm : 0
  const hrPct = activity.average_heartrate && fcMax > 0 ? activity.average_heartrate / fcMax : null
  const hasHR = !!activity.average_heartrate

  const insights: { key: string; value: string }[] = []
  if (durMin >= 180) insights.push({ key: 'durée', value: `${Math.floor(durMin / 60)}h${String(Math.round(durMin % 60)).padStart(2, '0')}` })
  if (dpKm >= 25) insights.push({ key: 'D+/km', value: `${Math.round(dpKm)} m/km` })
  if (hrPct !== null) {
    const zone = hrPct >= 0.90 ? 'Z5' : hrPct >= 0.80 ? 'Z4' : hrPct >= 0.70 ? 'Z3' : hrPct >= 0.60 ? 'Z2' : 'Z1'
    insights.push({ key: 'zone moy', value: zone })
  }

  return { type, drift, insights, hasHR }
}

// ── VAM / Athlete profile ─────────────────────────────────────────────────────

interface VAMData {
  uphillSections: { vam: number; dAlt: number; dist: number; avgHR: number | null }[]
  downhillSections: { speed: number; grade: number }[]
  recoveries: { drop: number; hrAtTop: number; hrAfter60: number }[]
  avgVAM: number | null
  maxVAM: number | null
  avgRecovery: number | null
  avgDownhill: number | null
}
function computeVAMFromStreams(streams: Streams): VAMData | null {
  const altD = streams.altitude?.data || []
  const hrD = streams.heartrate?.data || []
  const velD = streams.velocity_smooth?.data || []
  const distD = streams.distance?.data || []
  const timeD = streams.time?.data || []
  if (!altD.length || !velD.length) return null
  if (!timeD.length || timeD.length !== altD.length) return null

  const uphillSections: VAMData['uphillSections'] = []
  const downhillSections: VAMData['downhillSections'] = []
  const recoveries: VAMData['recoveries'] = []
  let inUphill = false
  let uphillStart: { idx: number; alt: number; dist: number; time: number } | null = null
  const WIN = Math.min(30, Math.floor(altD.length / 10))

  for (let i = WIN; i < altD.length - WIN; i++) {
    const elevN = altD[i + WIN] - altD[i]
    const distN = distD[i + WIN] - distD[i]
    const grade = distN > 0 ? elevN / distN * 100 : 0

    if (grade > 4 && !inUphill) {
      inUphill = true
      uphillStart = { idx: i, alt: altD[i], dist: distD[i], time: timeD[i] }
    } else if (grade <= 1.5 && inUphill && uphillStart) {
      inUphill = false
      const dAlt = altD[i] - uphillStart.alt
      const dTime = timeD[i] - uphillStart.time
      if (dAlt > 10 && dTime > 0) {
        const vam = Math.round(dAlt / (dTime / 3600))
        const avgHR = hrD.length
          ? Math.round(hrD.slice(uphillStart.idx, i).reduce((a, b) => a + b, 0) / (i - uphillStart.idx))
          : null
        uphillSections.push({ vam, dAlt: Math.round(dAlt), dist: Math.round(distD[i] - uphillStart.dist), avgHR })
        if (hrD.length) {
          const hrAtTop = hrD[i] || 0
          const hrAfter60 = hrD[Math.min(i + 60, hrD.length - 1)] || 0
          if (hrAtTop > 0) recoveries.push({ drop: hrAtTop - hrAfter60, hrAtTop, hrAfter60 })
        }
      }
    }
    if (grade < -5) {
      const avgVel = velD.slice(i, i + 30).reduce((a, b) => a + b, 0) / 30
      downhillSections.push({ speed: +(avgVel * 3.6).toFixed(1), grade: +grade.toFixed(1) })
    }
  }

  if (!uphillSections.length && !recoveries.length) return null

  return {
    uphillSections,
    downhillSections,
    recoveries,
    avgVAM: uphillSections.length ? Math.round(uphillSections.reduce((a, b) => a + b.vam, 0) / uphillSections.length) : null,
    maxVAM: uphillSections.length ? Math.max(...uphillSections.map(s => s.vam)) : null,
    avgRecovery: recoveries.length ? Math.round(recoveries.reduce((a, b) => a + b.drop, 0) / recoveries.length) : null,
    avgDownhill: downhillSections.length ? +(downhillSections.reduce((a, b) => a + b.speed, 0) / downhillSections.length).toFixed(1) : null,
  }
}

// ── Progress comparison ───────────────────────────────────────────────────────

function dpPerKm(a: Activity): number {
  const km = a.distance / 1000
  return km > 0 ? a.total_elevation_gain / km : 0
}
function paceS(a: Activity): number | null {
  return a.average_speed > 0 ? 1000 / a.average_speed : null
}

function findSimilarActivities(activity: Activity, activities: Activity[]): Activity[] {
  const dist = activity.distance
  const dp = dpPerKm(activity)
  const trail = isTrailAct(activity)
  const actTime = new Date(activity.start_date).getTime()

  return activities
    .filter(a => {
      if (a.id === activity.id) return false
      if (!isRun(a.type)) return false
      if (isTrailAct(a) !== trail) return false
      const aTime = new Date(a.start_date).getTime()
      if (aTime >= actTime) return false
      if (actTime - aTime < 2 * 86_400_000) return false
      const dRatio = dist > 0 ? a.distance / dist : 1
      if (dRatio < 0.75 || dRatio > 1.30) return false
      if (dp > 5) {
        const r = dpPerKm(a) / dp
        if (r < 0.50 || r > 2.0) return false
      }
      return true
    })
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
}

interface ProgressSignals {
  paceSignal: 'faster' | 'slower' | 'similar'
  paceDiff: number | null
  hrSignal: 'better' | 'worse' | 'similar' | null
  n: number
}
function computeProgressSignals(activity: Activity, similar: Activity[]): ProgressSignals | null {
  if (!similar || similar.length < 2) return null

  const curr = paceS(activity)
  const withPace = similar.filter(a => paceS(a) !== null)
  const avgPace = withPace.length
    ? withPace.reduce((s, a) => s + paceS(a)!, 0) / withPace.length
    : null

  let paceSignal: ProgressSignals['paceSignal'] = 'similar'
  let paceDiff: number | null = null
  if (curr && avgPace) {
    paceDiff = (avgPace - curr) / avgPace * 100
    paceSignal = paceDiff > 3 ? 'faster' : paceDiff < -3 ? 'slower' : 'similar'
  }

  const effNow = activity.average_heartrate && curr
    ? activity.average_heartrate / (1000 / curr) : null
  const effHist = similar
    .filter(a => a.average_heartrate && paceS(a))
    .map(a => a.average_heartrate! / (1000 / paceS(a)!))
  const avgEff = effHist.length ? effHist.reduce((s, v) => s + v, 0) / effHist.length : null
  let hrSignal: ProgressSignals['hrSignal'] = null
  if (effNow && avgEff) {
    const d = (avgEff - effNow) / avgEff * 100
    hrSignal = d > 4 ? 'better' : d < -4 ? 'worse' : 'similar'
  }

  return { paceSignal, paceDiff, hrSignal, n: similar.length }
}
