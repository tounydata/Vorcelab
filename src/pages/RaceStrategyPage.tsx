import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { computeRaceProjection, type GpxPoint, type ProjectionResult } from '../lib/computeRaceProjection'
import { fetchRaceForecast, computeWeatherImpact } from '../lib/raceWeather'
import type { ConditionPenalties } from '../lib/runnerProfile'
import { computeNutritionPlan } from '../lib/nutritionPlan'
import { resolveNutritionProducts } from '../lib/nutritionProducts'
import { extractGpxWaypoints, type RavitoPoint, type UnclassifiedWaypoint } from '../lib/crewPlan'
import type { RaceAnnotation } from '../lib/raceDebrief'
import { getAthleteLabel } from '../lib/athleteLabel'
import CrewPlan from '../components/races/CrewPlan'
import StrategyView from '../components/races/strategy/StrategyView'
import RaceResult from '../components/races/RaceResult'
import { fetchTerrainSurfaces } from '../lib/terrain'
import BrandedLoader from '../components/BrandedLoader'
import LoadError from '../components/LoadError'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
  goal_time: string | null
  start_time: string | null
  gpx_data: unknown | null
  last_projection: unknown | null
  share_token: string | null
  ravitos: unknown | null
  surfaces: unknown | null
  result_activity_id: string | null
  result_annotations: unknown | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function RaceStrategyPage() {
  const { raceId } = useParams<{ raceId: string }>()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [projection, setProjection] = useState<ProjectionResult | null>(null)
  // Clé météo stabilisée sur la projection de base (sans terrain) pour partager le
  // cache avec useRaceProjection (qui utilise également baseProjection.estTimeS).
  const [baseEstTimeS, setBaseEstTimeS] = useState<number | undefined>()
  const [isComputing, setIsComputing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'strategie' | 'assistance' | 'resultat'>('strategie')
  const [ravitos, setRavitos] = useState<RavitoPoint[]>([])
  const [unclassifiedWaypoints, setUnclassifiedWaypoints] = useState<UnclassifiedWaypoint[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Édition des infos de la course (nom, date, distance, D+).
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editDistance, setEditDistance] = useState('')
  const [editElevation, setEditElevation] = useState('')
  const [editStartTime, setEditStartTime] = useState('')
  const [editGoalTime, setEditGoalTime] = useState('')

  useEffect(() => {
    if (!settingsOpen) return
    function onPointerDown(e: PointerEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [settingsOpen])

  const shareMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      const token = enable ? crypto.randomUUID() : null
      const { error } = await supabase
        .from('race_calendar')
        .update({ share_token: token })
        .eq('id', raceId!)
      if (error) throw error
      return token
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['race', raceId] }),
  })

  // Lie (ou délie) l'activité Strava réelle de la course pour la comparaison projeté/réel.
  const resultMutation = useMutation({
    mutationFn: async (activityId: string | null) => {
      const { error } = await supabase
        .from('race_calendar')
        .update({ result_activity_id: activityId })
        .eq('id', raceId!)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['race', raceId] }),
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      const km = parseFloat(editDistance.replace(',', '.'))
      const { error } = await supabase
        .from('race_calendar')
        .update({
          name: editName.trim(),
          date: editDate,
          distance: Number.isFinite(km) ? km : null,
          elevation: editElevation ? parseInt(editElevation, 10) : null,
          start_time: editStartTime || null,
          goal_time: editGoalTime.trim() || null,
        })
        .eq('id', raceId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['race', raceId] })
      queryClient.invalidateQueries({ queryKey: ['races'] })
      setEditOpen(false)
      // Recalcule la projection (objectif/heure → labels & météo recalés).
      setProjection(null)
    },
  })

  function openEdit() {
    if (!race) return
    setEditName(race.name)
    setEditDate(race.date?.slice(0, 10) ?? '')
    setEditDistance(race.distance != null ? String(race.distance) : '')
    setEditElevation(race.elevation != null ? String(race.elevation) : '')
    setEditStartTime(race.start_time ?? '')
    setEditGoalTime(race.goal_time ?? '')
    setSettingsOpen(false)
    setEditOpen(true)
  }

  function copyShareUrl(token: string) {
    const url = `${window.location.origin}${window.location.pathname}#/s/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const { data: race, isLoading: raceLoading, isError, refetch: refetchRace } = useQuery<Race>({
    queryKey: ['race', raceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id,name,date,distance,elevation,type,goal_time,start_time,gpx_data,last_projection,share_token,ravitos,surfaces,result_activity_id,result_annotations')
        .eq('id', raceId!)
        .single()
      if (error) throw error
      return data as Race
    },
    enabled: !!raceId,
  })

  const { data: activitiesData } = useQuery<Record<string, unknown>[]>({
    queryKey: ['activities-strategy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('*')
        .order('start_date', { ascending: false })
        .limit(150)
      if (error) throw error
      return (data ?? []) as Record<string, unknown>[]
    },
  })

  const { data: profileData } = useQuery<Record<string, unknown>>({
    queryKey: ['profile-strategy'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (error) return {}
      return (data ?? {}) as Record<string, unknown>
    },
  })

  // ── Météo J-10 : prévision sur la fenêtre de course (départ → arrivée estimée) ──
  // On utilise baseEstTimeS (passe sans terrain) pour que la clé de cache coïncide
  // exactement avec celle de useRaceProjection → un seul appel API partagé.
  const startPt = projection?.points?.[0]
  const { data: forecast } = useQuery({
    queryKey: ['race-forecast', raceId, race?.date, race?.start_time, baseEstTimeS, startPt?.lat, startPt?.lon],
    enabled: !!startPt && !!race?.date && !!baseEstTimeS,
    staleTime: 30 * 60 * 1000,
    queryFn: () => fetchRaceForecast({
      lat: startPt!.lat, lon: startPt!.lon,
      dateISO: race!.date.slice(0, 10),
      startTime: race!.start_time ?? null,
      estDurationS: baseEstTimeS!,
    }),
  })
  const weather = forecast
    ? computeWeatherImpact(forecast, (profileData?.runner_profile as { conditionPenalties?: ConditionPenalties } | undefined)?.conditionPenalties)
    : null

  // `shouldSave` : import GPX explicite → on persiste + affiche le statut « enregistré ».
  // `silentSync` : recalcul auto au chargement → on re-persiste la projection fraîche
  // (sans flash de statut) UNIQUEMENT si elle a dérivé de celle stockée, pour que le
  // dashboard (qui lit last_projection) reste raccord avec la vraie projection.
  function runAnalysis(pts: GpxPoint[], shouldSave: boolean, silentSync = false, terrain?: { surfaces: (string | null)[]; weather?: { precip?: number } } | null) {
    setIsComputing(true)
    setTimeout(() => {
      try {
        const result = computeRaceProjection(
          pts,
          activitiesData ?? [],
          profileData ?? {},
          race ? { type: race.type, goal_time: race.goal_time } : null,
          terrain ?? null,
        )
        setProjection(result)
        // Fixe l'estTimeS de base une seule fois (passe sans terrain) pour que
        // la clé météo reste stable et corresponde à celle de useRaceProjection.
        if (!terrain) setBaseEstTimeS(result.estTimeS)

        const fresh = {
          cible:      Math.round(result.estTimeS),
          prudent:    Math.round(result.timeMax),
          agressif:   Math.round(result.timeMin),
          confidence: result.confidence,
          // Horodatage : le dashboard affiche « projection du X » si > 24 h —
          // un instantané daté plutôt qu'un chiffre périmé présenté comme actuel.
          computedAt: new Date().toISOString(),
        }
        const stored = race?.last_projection as typeof fresh | null
        const drifted = !stored
          || stored.cible !== fresh.cible
          || stored.prudent !== fresh.prudent
          || stored.agressif !== fresh.agressif
          || stored.confidence !== fresh.confidence
        // Même valeur mais horodatage > 24 h → on re-tamponne : la projection vient
        // d'être vérifiée, le dashboard ne doit pas la dater d'avant-hier.
        const staleStamp = !stored?.computedAt
          || Date.now() - new Date(stored.computedAt).getTime() > 24 * 3600_000

        if (shouldSave || (silentSync && (drifted || staleStamp))) {
          if (!silentSync) setSaveStatus('saving')
          supabase
            .from('race_calendar')
            .update({ gpx_data: pts, last_projection: fresh })
            .eq('id', raceId!)
            .then(() => {
              if (!silentSync) setSaveStatus('saved')
              // Le dashboard relira la projection à jour.
              queryClient.invalidateQueries({ queryKey: ['next-race-dashboard'] })
            })
        }
      } catch (err) {
        console.error('GPX projection error:', err)
      } finally {
        setIsComputing(false)
      }
    }, 0)
  }

  useEffect(() => {
    if (!race?.gpx_data || !activitiesData || !profileData) return
    if (projection) return
    const pts = race.gpx_data as GpxPoint[]
    if (!Array.isArray(pts) || pts.length < 2) return
    runAnalysis(pts, false, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race, activitiesData, profileData])

  // Charge les ravitos sauvegardés une fois (sinon ils restent vides jusqu'à un import GPX).
  const ravitosLoadedRef = useRef(false)
  useEffect(() => {
    if (!race || ravitosLoadedRef.current) return
    if (Array.isArray(race.ravitos)) setRavitos(race.ravitos as RavitoPoint[])
    ravitosLoadedRef.current = true
  }, [race])

  // Étiquetage des arrêts (débrief) : chargé une fois, persisté à chaque changement.
  const [annotations, setAnnotations] = useState<RaceAnnotation[]>([])
  const annotationsLoadedRef = useRef(false)
  useEffect(() => {
    if (!race || annotationsLoadedRef.current) return
    if (Array.isArray(race.result_annotations)) setAnnotations(race.result_annotations as RaceAnnotation[])
    annotationsLoadedRef.current = true
  }, [race])
  function updateAnnotations(next: RaceAnnotation[]) {
    const sorted = [...next].sort((a, b) => a.km - b.km)
    setAnnotations(sorted)
    if (raceId) supabase.from('race_calendar').update({ result_annotations: sorted }).eq('id', raceId).then(() => {})
  }

  // Terrain : récupère les surfaces (cache base sinon OSM), puis re-projette avec le malus.
  // Une fois par course/projection ; persisté pour ne pas ré-interroger Overpass.
  const surfacesDoneRef = useRef(false)
  useEffect(() => {
    if (!projection || !race?.gpx_data || surfacesDoneRef.current) return
    surfacesDoneRef.current = true
    const pts = race.gpx_data as GpxPoint[]
    const weather = forecast?.available && forecast.precipMm != null ? { precip: forecast.precipMm } : undefined
    const apply = (surfaces: (string | null)[]) => {
      if (surfaces.some((s) => s != null)) runAnalysis(pts, false, true, { surfaces, weather })
    }
    const cached = race.surfaces
    if (Array.isArray(cached) && cached.length === projection.sections.length) {
      apply(cached as (string | null)[])
      return
    }
    fetchTerrainSurfaces(pts, projection.sections).then((surfaces) => {
      supabase.from('race_calendar').update({ surfaces }).eq('id', raceId!).then(() => {
        // Le dashboard relit les surfaces pour que useRaceProjection soit en phase.
        queryClient.invalidateQueries({ queryKey: ['next-race-dashboard'] })
      })
      apply(surfaces)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection, race])


  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      const trkpts = Array.from(doc.querySelectorAll('trkpt'))
      if (trkpts.length < 2) return
      const pts: GpxPoint[] = trkpts.map((node) => ({
        lat: parseFloat(node.getAttribute('lat') ?? '0'),
        lon: parseFloat(node.getAttribute('lon') ?? '0'),
        ele: node.querySelector('ele')
          ? parseFloat(node.querySelector('ele')!.textContent ?? '0')
          : null,
      }))
      if (pts.length < 2) return
      const { ravitos: gpxRavitos, unclassified } = extractGpxWaypoints(text, pts)
      updateRavitos(gpxRavitos)
      setUnclassifiedWaypoints(unclassified)
      surfacesDoneRef.current = false // nouveau tracé → re-détecter les surfaces
      supabase.from('race_calendar').update({ surfaces: null }).eq('id', raceId!).then(() => {})
      runAnalysis(pts, true)
    }
    reader.readAsText(file)
  }

  function printStrategie() {
    document.body.classList.add('print-mode-strategie')
    setTimeout(() => { window.print(); document.body.classList.remove('print-mode-strategie') }, 80)
  }
  function printAssistance() {
    document.body.classList.add('print-mode-assistance')
    setTimeout(() => { window.print(); document.body.classList.remove('print-mode-assistance') }, 80)
  }
  function printBoth() {
    setTimeout(() => window.print(), 80)
  }

  async function handleRemoveGpx() {
    setProjection(null)
    setRavitos([])
    setUnclassifiedWaypoints([])
    setSettingsOpen(false)
    surfacesDoneRef.current = false
    await supabase.from('race_calendar').update({ gpx_data: null, last_projection: null, ravitos: null, surfaces: null }).eq('id', raceId!)
    queryClient.invalidateQueries({ queryKey: ['race', raceId] })
  }

  // Persiste les ravitos en base (avant : uniquement en état React → perdus au reload).
  function updateRavitos(next: RavitoPoint[]) {
    const sorted = [...next].sort((a, b) => a.km - b.km)
    setRavitos(sorted)
    if (raceId) supabase.from('race_calendar').update({ ravitos: sorted }).eq('id', raceId).then(() => {})
  }

  const menuItemStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', background: 'none',
    border: 'none', padding: '9px 14px', cursor: 'pointer',
    fontFamily: 'var(--vl-mono)', fontSize: '0.78rem', letterSpacing: '0.04em',
    color: 'var(--vl-text-1)', lineHeight: 1.3,
  }

  function GearIcon() {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    )
  }

  const BackLink = () => (
    <Link to="/" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
      ← Dashboard
    </Link>
  )

  if (raceLoading) {
    return (
      <>
        <BackLink />
        <BrandedLoader />
      </>
    )
  }

  if (isError) {
    return (<><BackLink /><LoadError onRetry={() => refetchRace()} message="Impossible de charger la course — vérifie ta connexion." /></>)
  }
  if (!race) {
    return (<><BackLink /><div className="mlabel">Course introuvable.</div></>)
  }

  const athleteName = getAthleteLabel(profileData ?? null)

  // Onglet RÉSULTAT (lier ton activité + comparer le réalisé) dispo DÈS le jour de
  // la course, et après. Comparaison en date LOCALE : l'ancien seuil « +1 jour en
  // UTC » masquait le résultat tout le soir de la course pour les fuseaux à l'est de
  // UTC (ex. trail nocturne en France : indisponible jusqu'à 02 h locales le lendemain).
  const _now = new Date()
  const _todayLocal = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const isPast = !!race.date && race.date.slice(0, 10) <= _todayLocal

  const nutritionRows = projection
    ? computeNutritionPlan(
        projection.totalDistM,
        projection.estTimeS,
        profileData?.nutrition_level as string | undefined,
        resolveNutritionProducts(profileData?.nutrition_products as string[] | undefined),
        profileData?.nutrition_no_caffeine === true,
      )
    : []

  return (
    <>
      <BackLink />

      {/* ── Race header + gear icon ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', letterSpacing: '0.02em', lineHeight: 1, marginBottom: 4 }}>
            {race.name}
          </div>
          <div className="race-meta">
            {formatDate(race.date)}
            {race.distance != null && ` · ${race.distance} km`}
            {race.elevation != null && ` · ↑${race.elevation} m`}
            {race.type && ` · ${race.type}`}
          </div>
        </div>

        {/* Gear settings */}
        <div ref={settingsRef} style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }} className="no-print">
          <button
            onClick={() => setSettingsOpen(o => !o)}
            style={{ background: 'none', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: 'var(--vl-text-2)', display: 'flex', alignItems: 'center' }}
          >
            <GearIcon />
          </button>

          {settingsOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200, minWidth: 210, background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
              {/* Résultat : lier l'activité réalisée (dès le jour J, GPX importé) */}
              {isPast && projection && (
                <>
                  <button style={{ ...menuItemStyle, color: 'var(--vl-ember)' }} onClick={() => { setTab('resultat'); setSettingsOpen(false) }}>
                    Lier l'activité réalisée
                  </button>
                  <div style={{ height: 1, background: 'var(--vl-line)' }} />
                </>
              )}

              {/* Infos course */}
              <button style={menuItemStyle} onClick={openEdit}>
                Modifier la course
              </button>

              <div style={{ height: 1, background: 'var(--vl-line)' }} />

              {/* GPX */}
              <button style={menuItemStyle} onClick={() => { fileInputRef.current?.click(); setSettingsOpen(false) }}>
                Changer de GPX
              </button>
              {projection && (
                <button style={{ ...menuItemStyle, color: 'var(--vl-ember)' }} onClick={handleRemoveGpx}>
                  Supprimer le GPX
                </button>
              )}

              <div style={{ height: 1, background: 'var(--vl-line)' }} />

              {/* Partage */}
              {race.share_token ? (
                <>
                  <button style={{ ...menuItemStyle, color: 'var(--vl-growth)' }} onClick={() => { copyShareUrl(race.share_token!); setSettingsOpen(false) }}>
                    {copied ? 'Lien copié ✓' : 'Copier le lien partage'}
                  </button>
                  <button style={{ ...menuItemStyle, color: 'var(--vl-text-2)' }} onClick={() => { shareMutation.mutate(false); setSettingsOpen(false) }}>
                    Arrêter le partage
                  </button>
                </>
              ) : (
                <button style={menuItemStyle} onClick={() => { shareMutation.mutate(true); setSettingsOpen(false) }}>
                  {shareMutation.isPending ? '…' : 'Partager cette stratégie'}
                </button>
              )}

              {projection && (
                <>
                  <div style={{ height: 1, background: 'var(--vl-line)' }} />
                  {/* Impression */}
                  <button style={menuItemStyle} onClick={() => { printStrategie(); setSettingsOpen(false) }}>Imprimer plan coureur</button>
                  <button style={menuItemStyle} onClick={() => { printAssistance(); setSettingsOpen(false) }}>Imprimer plan assistance</button>
                  <button style={menuItemStyle} onClick={() => { printBoth(); setSettingsOpen(false) }}>Imprimer les deux</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Modale d'édition des infos de la course ──────────────────────────── */}
      {editOpen && (
        <div
          onClick={() => setEditOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(10,10,12,0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          className="no-print"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: 'var(--vl-surf)', border: '1px solid var(--vl-line-2)', borderTop: '3px solid var(--vl-ember)', borderRadius: 'var(--vl-r)', padding: '18px 18px 16px', boxShadow: '0 24px 60px -24px rgba(0,0,0,.85)' }}
          >
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, marginBottom: 14 }}>
              Modifier la course
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="mlabel" htmlFor="edit-name" style={{ display: 'block', marginBottom: 5 }}>Nom</label>
                <input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '10px 12px', color: 'var(--vl-text)', fontSize: '.95rem' }} />
              </div>
              <div>
                <label className="mlabel" htmlFor="edit-date" style={{ display: 'block', marginBottom: 5 }}>Date</label>
                <input id="edit-date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '10px 12px', color: 'var(--vl-text)', fontSize: '.95rem' }} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="mlabel" htmlFor="edit-dist" style={{ display: 'block', marginBottom: 5 }}>Distance (km)</label>
                  <input id="edit-dist" type="number" inputMode="decimal" min="0" step="0.1" value={editDistance} onChange={(e) => setEditDistance(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '10px 12px', color: 'var(--vl-text)', fontSize: '.95rem' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="mlabel" htmlFor="edit-elev" style={{ display: 'block', marginBottom: 5 }}>D+ (m)</label>
                  <input id="edit-elev" type="number" inputMode="numeric" min="0" step="10" value={editElevation} onChange={(e) => setEditElevation(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '10px 12px', color: 'var(--vl-text)', fontSize: '.95rem' }} />
                </div>
              </div>
              <div>
                <label className="mlabel" htmlFor="edit-start" style={{ display: 'block', marginBottom: 5 }}>Heure de départ</label>
                <input id="edit-start" type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '10px 12px', color: 'var(--vl-text)', fontSize: '.95rem' }} />
                <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginTop: 4 }}>Affine la météo à J-10 (chaleur, nuit, vent).</div>
              </div>
              <div>
                <label className="mlabel" htmlFor="edit-goal" style={{ display: 'block', marginBottom: 5 }}>Objectif (optionnel)</label>
                <input id="edit-goal" value={editGoalTime} onChange={(e) => setEditGoalTime(e.target.value)} placeholder="ex. 3h30"
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '10px 12px', color: 'var(--vl-text)', fontSize: '.95rem' }} />
                <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginTop: 4 }}>Temps visé — comparé à la projection (ex. « 3h », « 3h30 »).</div>
              </div>
            </div>

            {editMutation.isError && (
              <div style={{ color: 'var(--vl-status-bad, #d66)', fontSize: '.85rem', marginTop: 10 }}>
                Impossible d’enregistrer. Réessaie.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={() => setEditOpen(false)} className="hbtn" style={{ fontSize: '.85rem', padding: '8px 14px' }}>
                Annuler
              </button>
              <button
                onClick={() => editMutation.mutate()}
                disabled={!editName.trim() || !editDate || editMutation.isPending}
                style={{ border: 'none', borderRadius: 'var(--vl-r-sm)', padding: '8px 16px', fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '.9rem', cursor: editName.trim() && editDate && !editMutation.isPending ? 'pointer' : 'not-allowed', background: editName.trim() && editDate ? 'var(--vl-ember)' : 'var(--vl-line)', color: editName.trim() && editDate ? 'var(--vl-ink)' : 'var(--vl-text-3)' }}
              >
                {editMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isComputing && (
        <BrandedLoader label="Calcul de la stratégie…" />
      )}

      {!projection && !isComputing && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="clabel" style={{ marginBottom: '1rem' }}>CHARGER LE GPX</div>
          <div className="mlabel" style={{ marginBottom: '1.25rem' }}>
            Importez le fichier GPX de la course pour générer votre stratégie personnalisée
          </div>
          <button className="hbtn" onClick={() => fileInputRef.current?.click()}>Sélectionner un fichier .gpx</button>
          <input ref={fileInputRef} type="file" accept=".gpx" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>
      )}

      {saveStatus === 'saving' && <div className="mlabel" style={{ margin: '0.5rem 0' }}>Sauvegarde…</div>}
      {saveStatus === 'saved'  && <div className="mlabel" style={{ margin: '0.5rem 0', color: 'var(--vl-growth)' }}>GPX sauvegardé</div>}

      {/* ── Main content (tabs) ──────────────────────────────────────────────── */}
      {projection && (
        <>
          {/* Tab switcher */}
          <div className="vl-profil-tabs no-print">
            <button className={`vl-tab${tab === 'strategie' ? ' active' : ''}`} onClick={() => setTab('strategie')}>STRATÉGIE</button>
            <button className={`vl-tab${tab === 'assistance' ? ' active' : ''}`} onClick={() => setTab('assistance')}>PLAN ASSISTANCE</button>
            {isPast && (
              <button className={`vl-tab${tab === 'resultat' ? ' active' : ''}`} onClick={() => setTab('resultat')}>RÉSULTAT</button>
            )}
          </div>


          {/* ── ONGLET STRATÉGIE ──────────────────────────────────────────────── */}
          {/* onglet STRATEGIE (refonte direction A) */}
          <div className={`strategie-section${tab !== 'strategie' ? ' tab-screen-hidden' : ''}`}>
            <StrategyView
              projection={projection}
              race={race}
              athleteName={athleteName}
              nutritionRows={nutritionRows}
              ravitos={ravitos}
              forecast={forecast ?? null}
              weather={weather}
            />
          </div>

          {/* ── ONGLET ASSISTANCE ─────────────────────────────────────────────── */}
          <div className={`plan-assistance-section crew-plan-page-break${tab !== 'assistance' ? ' tab-screen-hidden' : ''}`}>
            <CrewPlan
              projection={projection}
              nutritionRows={nutritionRows}
              ravitos={ravitos}
              unclassifiedWaypoints={unclassifiedWaypoints}
              onAddRavito={(r) => updateRavitos([...ravitos.filter(x => x.km !== r.km), r])}
              onRemoveRavito={(km) => updateRavitos(ravitos.filter(r => r.km !== km))}
              onPromoteWaypoint={(w) => {
                updateRavitos([...ravitos.filter(x => x.km !== w.km), { km: w.km, label: w.label, source: 'gpx' as const }])
                setUnclassifiedWaypoints(prev => prev.filter(u => u.km !== w.km))
              }}
              athleteName={athleteName}
              startTime={race.start_time}
            />
          </div>

          {/* ── ONGLET RÉSULTAT (course passée) ───────────────────────────────── */}
          {isPast && (
            <div className={`${tab !== 'resultat' ? 'tab-screen-hidden' : ''}`}>
              <RaceResult
                projection={projection}
                activities={activitiesData ?? []}
                resultActivityId={race.result_activity_id}
                raceDateISO={race.date}
                fcMax={(profileData?.fc_max as number | undefined) ?? null}
                annotations={annotations}
                onChangeAnnotations={updateAnnotations}
                ravitos={ravitos}
                onLink={(id) => resultMutation.mutate(id)}
                onUnlink={() => resultMutation.mutate(null)}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}
