import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { computeRaceProjection, type GpxPoint, type ProjectionResult, type Section } from '../lib/computeRaceProjection'
import { computeNutritionPlan } from '../lib/nutritionPlan'
import { extractGpxWaypoints, scoreRaceSection, type RavitoPoint, type UnclassifiedWaypoint } from '../lib/crewPlan'
import { getAthleteLabel } from '../lib/athleteLabel'
import CrewPlan from '../components/races/CrewPlan'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
  goal_time: string | null
  gpx_data: unknown | null
  last_projection: unknown | null
  share_token: string | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

function sectionLabel(type: 'up' | 'down' | 'flat') {
  return type === 'up' ? 'Montée' : type === 'down' ? 'Descente' : 'Plat'
}

function confidenceColor(c: string) {
  return c === 'good' ? 'var(--vl-growth)' : c === 'medium' ? '#f39c12' : 'var(--vl-ember)'
}
function confidenceLabel(c: string) {
  return c === 'good' ? 'Bonne' : c === 'medium' ? 'Moyenne' : 'Faible'
}
function confidenceExplanation(c: string, trailCount?: number, recentCount?: number) {
  const tc = trailCount != null ? `${trailCount} sortie${trailCount > 1 ? 's' : ''} trail` : null
  const rc = recentCount != null ? `${recentCount} récente${recentCount > 1 ? 's' : ''}` : null
  const base = [tc, rc].filter(Boolean).join(' · ')
  if (c === 'low') return (base ? `${base} · ` : '') + 'fourchette large'
  if (c === 'medium') return (base ? `${base} · ` : '') + 'estimation raisonnable'
  return (base ? `${base} · ` : '') + 'profil solide, estimation fiable'
}
function departStrategy(c: string) {
  if (c === 'low') return 'Départ prudent fortement conseillé — fourchette large, commencez 10% en dessous du rythme cible.'
  if (c === 'medium') return 'Départ légèrement conservateur recommandé — restez dans la fourchette prudente les premiers km.'
  return 'Départ selon le plan — profil fiable, respectez le rythme cible.'
}
function riskConseil(grade: number) {
  if (grade > 15) return 'Marche active recommandée.'
  if (grade > 8) return 'Effort maîtrisé, FC max 85%, montée contrôlée.'
  return 'Gérez l\'effort, ne partez pas trop vite.'
}
function sectionConseil(s: Section) {
  if (s.type === 'up') {
    if (s.grade > 15) return 'Marche active recommandée — économisez l\'énergie pour la suite.'
    if (s.grade > 8) return 'Effort maîtrisé — FC max 85%, cadence courte, bras actifs.'
    return 'Montée roulante — rythme soutenu possible, restez relâché.'
  }
  if (s.type === 'down') {
    if (Math.abs(s.grade) > 15) return 'Freinage actif quadriceps — descente raide, attention aux chutes.'
    if (Math.abs(s.grade) > 8) return 'Descente technique — contrôlez la vitesse, préservez les quadriceps.'
    return 'Descente roulante — récupération possible, relâchez le haut du corps.'
  }
  return 'Section plate — rythme régulier, profitez pour boire et manger.'
}
function profileAltiLabel(dplus: number, totalDistM: number) {
  const mPerKm = Math.round(dplus / (totalDistM / 1000))
  if (mPerKm > 50) return { short: `${mPerKm} m/km D+`, tag: 'Montagneux', hint: 'Alternez course et marche, gérez les montées tôt.' }
  if (mPerKm > 25) return { short: `${mPerKm} m/km D+`, tag: 'Undulé', hint: "Réglez l'effort sur chaque côte, récupérez en descente." }
  return { short: `${mPerKm} m/km D+`, tag: 'Roulant', hint: 'Pacing régulier possible — économisez pour la fin.' }
}

export default function RaceStrategyPage() {
  const { raceId } = useParams<{ raceId: string }>()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<L.Map | null>(null)
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null)

  const [projection, setProjection] = useState<ProjectionResult | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [nutritionOpen, setNutritionOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'strategie' | 'assistance'>('strategie')
  const [ravitos, setRavitos] = useState<RavitoPoint[]>([])
  const [unclassifiedWaypoints, setUnclassifiedWaypoints] = useState<UnclassifiedWaypoint[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

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

  function copyShareUrl(token: string) {
    const url = `${window.location.origin}${window.location.pathname}#/s/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const { data: race, isLoading: raceLoading, isError } = useQuery<Race>({
    queryKey: ['race', raceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id,name,date,distance,elevation,type,goal_time,gpx_data,last_projection,share_token')
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

  function runAnalysis(pts: GpxPoint[], shouldSave: boolean) {
    setIsComputing(true)
    setTimeout(() => {
      try {
        const result = computeRaceProjection(
          pts,
          activitiesData ?? [],
          profileData ?? {},
          race ? { type: race.type, goal_time: race.goal_time } : null,
        )
        setProjection(result)
        if (shouldSave) {
          setSaveStatus('saving')
          supabase
            .from('race_calendar')
            .update({
              gpx_data: pts,
              last_projection: {
                cible:      Math.round(result.estTimeS),
                prudent:    Math.round(result.timeMax),
                agressif:   Math.round(result.timeMin),
                confidence: result.confidence,
              },
            })
            .eq('id', raceId!)
            .then(() => setSaveStatus('saved'))
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
    runAnalysis(pts, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race, activitiesData, profileData])

  // Re-init map when projection changes or user returns to stratégie tab
  useEffect(() => {
    if (!projection || !mapContainerRef.current) return
    if (leafletMapRef.current) {
      leafletMapRef.current.remove()
      leafletMapRef.current = null
    }
    const map = L.map(mapContainerRef.current)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)
    const latLngs = projection.points.map((p) => [p.lat, p.lon] as L.LatLngTuple)
    const poly = L.polyline(latLngs, { color: '#00d4ff', weight: 3 }).addTo(map)
    map.fitBounds(poly.getBounds(), { padding: [20, 20] })
    leafletMapRef.current = map
    return () => {
      leafletMapRef.current?.remove()
      leafletMapRef.current = null
    }
  }, [projection, tab])

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
      setRavitos(gpxRavitos)
      setUnclassifiedWaypoints(unclassified)
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
    await supabase.from('race_calendar').update({ gpx_data: null, last_projection: null }).eq('id', raceId!)
    queryClient.invalidateQueries({ queryKey: ['race', raceId] })
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
    <Link to="/race" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
      ← Stratégies
    </Link>
  )

  if (raceLoading) {
    return (
      <>
        <BackLink />
        <div className="loading"><div className="spinner" /><span className="mlabel">Chargement…</span></div>
      </>
    )
  }

  if (isError || !race) {
    return (<><BackLink /><div className="mlabel">Course introuvable.</div></>)
  }

  const athleteName = getAthleteLabel(profileData ?? null)

  const TRAIL_TYPES_UI = ['TrailRun', 'Trail Run', 'Trail']
  const trailActivityCount = (activitiesData ?? []).filter(a => {
    const t = a.type as string
    const st = a.sport_type as string
    return (TRAIL_TYPES_UI.includes(t) || TRAIL_TYPES_UI.includes(st) || st === 'TrailRun') && (a.distance as number) > 5000
  }).length
  const recentActivityCount = (activitiesData ?? []).filter(a => {
    const t = a.type as string
    const st = a.sport_type as string
    const ALL_RUN = ['Run', 'TrailRun', 'Trail Run', 'Running', 'Trail']
    return (ALL_RUN.includes(t) || ALL_RUN.includes(st)) &&
      new Date(a.start_date as string).getTime() >= Date.now() - 90 * 24 * 3600_000 &&
      (a.distance as number) > 0
  }).length

  const nutritionRows = projection
    ? computeNutritionPlan(
        projection.totalDistM,
        projection.estTimeS,
        profileData?.nutrition_level as string | undefined,
      )
    : []

  // ── Derived values for sections A / B / C ───────────────────────────────────
  let riskSection: Section | null = null
  let riskSectionIdx = -1
  let riskSectionTime = 0
  let riskOrdinal = ''
  let opportunitySection: Section | null = null
  let opportunityOrdinal = ''
  interface SectionItem { section: Section; time: number; score: number; nutritionMoment?: string }
  let top3Sections: SectionItem[] = []

  if (projection) {
    riskSectionIdx = projection.sections.reduce((maxIdx, s, i) =>
      s.type === 'up' && s.grade > (maxIdx >= 0 ? projection.sections[maxIdx].grade : 0) ? i : maxIdx, -1)
    riskSection = riskSectionIdx >= 0 ? projection.sections[riskSectionIdx] : null
    riskSectionTime = riskSection ? projection.sectionTimes[riskSectionIdx] : 0

    // Ordinal rank of riskSection among all ascending sections (by km position)
    if (riskSection) {
      const upByKm = projection.sections
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.type === 'up')
        .sort((a, b) => a.s.startKm - b.s.startKm)
      const rank = upByKm.findIndex(({ i }) => i === riskSectionIdx) + 1
      riskOrdinal = rank === 1 ? '1ère montée' : `${rank}e montée`
    }

    const downSorted = [...projection.sections]
      .filter(s => s.type === 'down')
      .sort((a, b) => b.dist - a.dist)
    opportunitySection = downSorted[0] ?? null
    if (opportunitySection) {
      const oppIdx = projection.sections
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.type === 'down')
        .sort((a, b) => a.s.startKm - b.s.startKm)
        .findIndex(({ s }) => s === opportunitySection) + 1
      opportunityOrdinal = oppIdx === 1 ? '1ère descente' : `${oppIdx}e descente`
    }

    const gradeBucketMultipliers = (profileData?.runner_profile as { gradeBucketMultipliers?: Record<string, number> } | null)?.gradeBucketMultipliers

    top3Sections = projection.sections
      .map((s, i) => ({
        section: s,
        time: projection.sectionTimes[i],
        score: scoreRaceSection(s, projection.sectionTimes[i], { gradeBucketMultipliers }),
        nutritionMoment: nutritionRows.find(r => {
          const k = r.moment.match(/~?(\d+)\s*km/i)
          if (!k) return false
          const km = parseInt(k[1], 10)
          return km >= s.startKm && km <= s.startKm + s.dist / 1000
        })?.moment,
      }))
      .filter(item => item.section.type !== 'flat')
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }

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
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200, minWidth: 210, background: 'var(--vl-card)', border: '1px solid var(--vl-line)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
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

      {isComputing && (
        <div className="loading"><div className="spinner" /><span className="mlabel">Calcul de la stratégie…</span></div>
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
          </div>


          {/* ── ONGLET STRATÉGIE ──────────────────────────────────────────────── */}
          <div className={`strategie-section${tab !== 'strategie' ? ' tab-screen-hidden' : ''}`}>

            {/* Section A — Plan de course */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel">PLAN DE COURSE DE {athleteName.toUpperCase()}</div>

              {/* Hero time */}
              <div style={{ textAlign: 'center', margin: '1.25rem 0 0.75rem' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '3.2rem', lineHeight: 1, letterSpacing: '-0.01em' }}>
                  {fmtTime(projection.estTimeS)}
                </div>
                <div className="mlabel" style={{ marginTop: 4 }}>temps cible</div>
              </div>

              {/* Range bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem' }}>
                <div style={{ textAlign: 'center', minWidth: 52 }}>
                  <div className="sval" style={{ fontSize: '1rem' }}>{fmtTime(projection.timeMin)}</div>
                  <div className="slbl" style={{ fontSize: '0.65rem' }}>optimiste</div>
                </div>
                <div style={{ flex: 1, position: 'relative', height: 6, background: 'var(--vl-line)', borderRadius: 3 }}>
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, var(--vl-growth) 0%, var(--vl-ember) 50%, #c0392b 100%)`, borderRadius: 3, opacity: 0.3 }} />
                  <div style={{ position: 'absolute', left: '50%', top: '50%', width: 12, height: 12, borderRadius: '50%', background: 'var(--vl-ember)', border: '2px solid var(--vl-bg)', transform: 'translate(-50%,-50%)' }} />
                </div>
                <div style={{ textAlign: 'center', minWidth: 52 }}>
                  <div className="sval" style={{ fontSize: '1rem' }}>{fmtTime(projection.timeMax)}</div>
                  <div className="slbl" style={{ fontSize: '0.65rem' }}>prudent</div>
                </div>
              </div>

              {/* Confiance pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <span className="mlabel">Confiance</span>
                <span style={{ padding: '2px 10px', borderRadius: 10, background: confidenceColor(projection.confidence) + '28', color: confidenceColor(projection.confidence), fontFamily: 'var(--vl-display)', fontSize: '0.8rem', letterSpacing: '.05em' }}>
                  {confidenceLabel(projection.confidence)}
                </span>
                <span className="mlabel" style={{ color: 'var(--vl-text-2)', textTransform: 'none', letterSpacing: 0 }}>
                  {confidenceExplanation(projection.confidence, trailActivityCount, recentActivityCount)}
                </span>
              </div>

              {/* Objectif vs projection */}
              {race.goal_time && projection.goalLabel && (
                <div style={{ marginBottom: '0.5rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="mlabel">Objectif {race.goal_time}</span>
                  <span className="mlabel" style={{ color: projection.goalCompareColor }}>→ {projection.goalLabel}</span>
                  {projection.goalCompareStr && <span className="mlabel" style={{ color: 'var(--vl-text-2)', textTransform: 'none', letterSpacing: 0 }}>{projection.goalCompareStr}</span>}
                </div>
              )}

              {/* Stratégie départ */}
              <div className="mlabel" style={{ fontStyle: 'italic', color: 'var(--vl-text-2)', textTransform: 'none', letterSpacing: 0, marginBottom: riskSection || opportunitySection ? '0.75rem' : 0 }}>
                {departStrategy(projection.confidence)}
              </div>

              {/* Risque + Opportunité — 2 cards côte à côte */}
              {(riskSection || opportunitySection) && (
                <div style={{ display: 'grid', gridTemplateColumns: riskSection && opportunitySection ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {riskSection && (
                    <div style={{ padding: '0.6rem 0.75rem', borderRadius: 8, background: 'rgba(214,128,62,0.08)', border: '1px solid rgba(214,128,62,0.3)' }}>
                      <div className="mlabel" style={{ color: 'var(--vl-ember)', marginBottom: 4 }}>⚠ RISQUE — {riskOrdinal.toUpperCase()}</div>
                      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', lineHeight: 1.1, color: 'var(--vl-ember)', marginBottom: 4 }}>
                        Montée la plus raide — {Math.round(riskSection.grade)}% sur {(riskSection.dist / 1000).toFixed(1)} km
                      </div>
                      <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)', marginBottom: 3 }}>
                        km {riskSection.startKm.toFixed(1)} → {(riskSection.startKm + riskSection.dist / 1000).toFixed(1)} · +{Math.round(riskSection.dplus)} m D+ · {fmtTime(riskSectionTime)}
                      </div>
                      <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>{riskConseil(riskSection.grade)} Ne brûlez pas vos réserves ici.</div>
                    </div>
                  )}
                  {opportunitySection && (
                    <div style={{ padding: '0.6rem 0.75rem', borderRadius: 8, background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.3)' }}>
                      <div className="mlabel" style={{ color: 'var(--vl-growth)', marginBottom: 4 }}>✓ RÉCUPÉRATION — {opportunityOrdinal.toUpperCase()}</div>
                      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', lineHeight: 1.1, color: 'var(--vl-growth)', marginBottom: 4 }}>
                        Descente principale — {(opportunitySection.dist / 1000).toFixed(1)} km favorables
                      </div>
                      <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)', marginBottom: 3 }}>
                        km {opportunitySection.startKm.toFixed(1)} → {(opportunitySection.startKm + opportunitySection.dist / 1000).toFixed(1)} · -{Math.round(opportunitySection.dminus)} m D-
                      </div>
                      <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>Relâchez les épaules, récupérez le souffle. Gérez l'impact quadriceps.</div>
                    </div>
                  )}
                </div>
              )}

              {/* Personal adjustments */}
              {projection.personalAdjustments.length > 0 && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--vl-line)' }}>
                  {projection.personalAdjustments.map((adj, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="mlabel">{adj.label}</span>
                      <span className="mlabel" style={{ color: adj.color }}>{adj.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section B — Données course */}
            {(() => {
              const alti = profileAltiLabel(projection.dplus, projection.totalDistM)
              const halfRange = Math.round((projection.timeMax - projection.timeMin) / 2)
              return (
                <div className="card" style={{ marginBottom: '1rem' }}>
                  <div className="clabel" style={{ marginBottom: '0.5rem' }}>DONNÉES COURSE</div>

                  {/* Profil */}
                  <div style={{ padding: '8px 0', borderBottom: '1px solid var(--vl-line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>Profil</span>
                      <span className="mlabel">{alti.short} — <strong>{alti.tag}</strong></span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--vl-text-3)', fontStyle: 'italic', marginTop: 2 }}>{alti.hint}</div>
                  </div>

                  {/* Fourchette */}
                  <div style={{ padding: '8px 0', borderBottom: riskSection ? '1px solid var(--vl-line)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>Incertitude</span>
                      <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>±{fmtTime(halfRange)} entre scénarios</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--vl-text-3)', fontStyle: 'italic', marginTop: 2 }}>
                      Restez sur le temps cible si tout se passe bien, basculez vers prudent si ça résiste.
                    </div>
                  </div>

                  {/* Section critique */}
                  {riskSection && (
                    <div style={{ padding: '8px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>Point chaud</span>
                        <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-ember)' }}>
                          km {riskSection.startKm.toFixed(1)}–{(riskSection.startKm + riskSection.dist / 1000).toFixed(1)} · {Math.round(riskSection.grade)}% · {fmtTime(riskSectionTime)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--vl-text-3)', fontStyle: 'italic', marginTop: 2 }}>
                        Montée la plus raide — {riskConseil(riskSection.grade).replace(/\.$/, '').toLowerCase()}, ne grilllez pas vos réserves ici.
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Section C — Sections clés */}
            {top3Sections.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="clabel" style={{ marginBottom: '0.75rem' }}>SECTIONS CLÉS</div>
                {top3Sections.map((item, i) => {
                  const isUp = item.section.type === 'up'
                  const color = isUp ? 'var(--vl-ember)' : 'var(--vl-growth)'
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '0.6rem 0', borderBottom: i < top3Sections.length - 1 ? '1px solid var(--vl-line)' : 'none', alignItems: 'flex-start' }}>
                      {/* Grade badge */}
                      <div style={{ minWidth: 44, textAlign: 'center', padding: '4px 6px', borderRadius: 6, background: color + '18', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', color, lineHeight: 1 }}>{Math.abs(Math.round(item.section.grade))}%</div>
                        <div className="slbl" style={{ fontSize: '0.6rem', color }}>{isUp ? 'D+' : 'D-'}</div>
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1 }}>
                        <div className="mlabel" style={{ marginBottom: 2 }}>
                          <span style={{ color }}>{sectionLabel(item.section.type)}</span>
                          {' '}km {item.section.startKm.toFixed(1)}→{(item.section.startKm + item.section.dist / 1000).toFixed(1)}
                          <span style={{ color: 'var(--vl-text-2)' }}>
                            {' '}· {isUp ? `+${Math.round(item.section.dplus)}m` : `-${Math.round(item.section.dminus)}m`} · {(item.section.dist / 1000).toFixed(1)} km · {fmtTime(item.time)}
                          </span>
                        </div>
                        <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-1)' }}>
                          → {sectionConseil(item.section)}
                        </div>
                        {item.nutritionMoment && (
                          <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)', marginTop: 2 }}>
                            Nutrition {item.nutritionMoment}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Section D — Analyse complète */}
            <div>
              {/* Stats strip */}
              <div className="strip">
                <div className="scell">
                  <div className="sval">{(projection.totalDistM / 1000).toFixed(1)}</div>
                  <div className="slbl">Distance</div>
                </div>
                <div className="scell">
                  <div className="sval">+{Math.round(projection.dplus)}</div>
                  <div className="slbl">D+</div>
                </div>
                <div className="scell">
                  <div className="sval">-{Math.round(projection.dminus)}</div>
                  <div className="slbl">D-</div>
                </div>
              </div>

              {/* Profil altimétrique interactif — synchronisé avec la carte */}
              {projection.points.some(p => p.ele != null) && (() => {
                // Cumulative distance pour chaque point GPX
                const RAD = Math.PI / 180
                const hav = (a: GpxPoint, b: GpxPoint) => {
                  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD
                  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
                  return 6371000 * 2 * Math.asin(Math.sqrt(s))
                }
                const cumPts: { lat: number; lon: number; ele: number; dist: number }[] = []
                let cumDist = 0
                for (let i = 0; i < projection.points.length; i++) {
                  const p = projection.points[i]
                  if (i > 0) cumDist += hav(projection.points[i - 1], p)
                  if (p.ele != null) cumPts.push({ lat: p.lat, lon: p.lon, ele: p.ele, dist: cumDist })
                }
                if (cumPts.length < 4) return null
                const step = Math.max(1, Math.floor(cumPts.length / 120))
                const sampled = cumPts.filter((_, i) => i % step === 0)
                const totalDist = cumPts[cumPts.length - 1].dist
                const eles = sampled.map(p => p.ele)
                const minEle = Math.min(...eles), maxEle = Math.max(...eles), rangeEle = maxEle - minEle || 1
                const VW = 500, VH = 70
                const toX = (d: number) => (d / totalDist) * VW
                const toY = (e: number) => VH - 4 - ((e - minEle) / rangeEle) * (VH - 10)
                const pathCoords = sampled.map(p => `${toX(p.dist).toFixed(1)},${toY(p.ele).toFixed(1)}`).join(' L')
                const areaPath = `M${pathCoords} L${toX(totalDist).toFixed(1)},${VH} L0,${VH} Z`
                const linePath = `M${pathCoords}`

                const handleAltiHover = (e: React.MouseEvent<SVGElement>) => {
                  if (!leafletMapRef.current) return
                  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
                  const xPct = (e.clientX - rect.left) / rect.width
                  const hovDist = xPct * totalDist
                  // find closest sampled point
                  let best = cumPts[0], bestDiff = Infinity
                  for (const p of cumPts) {
                    const d = Math.abs(p.dist - hovDist)
                    if (d < bestDiff) { bestDiff = d; best = p }
                  }
                  if (hoverMarkerRef.current) {
                    hoverMarkerRef.current.setLatLng([best.lat, best.lon])
                  } else {
                    hoverMarkerRef.current = L.circleMarker([best.lat, best.lon], {
                      radius: 7, color: 'var(--vl-ember)', fillColor: '#d6803e', fillOpacity: 1, weight: 2,
                    }).addTo(leafletMapRef.current)
                  }
                }
                const handleAltiLeave = () => {
                  hoverMarkerRef.current?.remove()
                  hoverMarkerRef.current = null
                }

                return (
                  <div style={{ marginBottom: 6 }}>
                    <div className="mlabel" style={{ marginBottom: 4, letterSpacing: '.1em' }}>PROFIL ALTIMÉTRIQUE</div>
                    <svg
                      viewBox={`0 0 ${VW} ${VH}`}
                      preserveAspectRatio="none"
                      width="100%"
                      height={70}
                      style={{ display: 'block', cursor: 'crosshair' }}
                      onMouseMove={handleAltiHover}
                      onMouseLeave={handleAltiLeave}
                    >
                      <defs>
                        <linearGradient id="altiGrad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="var(--vl-ember)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--vl-ember)" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} fill="url(#altiGrad)" />
                      <path d={linePath} fill="none" stroke="var(--vl-ember)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                      {/* km ticks */}
                      {Array.from({ length: Math.floor(totalDist / 1000) + 1 }, (_, k) => {
                        if (k === 0) return null
                        const x = toX(k * 1000)
                        return (
                          <g key={k}>
                            <line x1={x} y1={VH - 8} x2={x} y2={VH} stroke="var(--vl-text-3)" strokeWidth={0.5} />
                            {k % 5 === 0 && (
                              <text x={x} y={VH - 10} textAnchor="middle"
                                style={{ fontFamily: 'monospace', fontSize: 7, fill: 'var(--vl-text-3)' }}>{k}</text>
                            )}
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                )
              })()}

              {/* Carte Leaflet */}
              <div
                ref={mapContainerRef}
                style={{ height: 240, borderRadius: 8, marginBottom: '1rem', overflow: 'hidden' }}
              />

              {/* Sections table */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="clabel">PLAN DE COURSE — TOUTES LES SECTIONS</div>
                {projection.sections.map((s, i) => (
                  <div
                    key={i}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--vl-line)' }}
                  >
                    <span className="mlabel">{sectionLabel(s.type)}</span>
                    <span className="mlabel">
                      {s.startKm.toFixed(1)}–{(s.startKm + s.dist / 1000).toFixed(1)} km
                      {s.type === 'up' && ` · +${s.dplus}m`}
                      {s.type === 'down' && ` · -${s.dminus}m`}
                    </span>
                    <span className="mlabel">{fmtTime(projection.sectionTimes[i])}</span>
                  </div>
                ))}
              </div>

              {/* Nutrition accordion */}
              <div className="card" style={{ marginBottom: '2rem' }}>
                <button
                  className="hbtn"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => setNutritionOpen((o) => !o)}
                >
                  PLAN NUTRITION {nutritionOpen ? '▲' : '▼'}
                </button>
                {nutritionOpen && (
                  <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th className="mlabel" style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--vl-line)' }}>Moment</th>
                          <th className="mlabel" style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--vl-line)' }}>Action</th>
                          <th className="mlabel" style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--vl-line)' }}>Glucides</th>
                          <th className="mlabel" style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--vl-line)' }}>Justification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nutritionRows.map((row, i) => (
                          <tr key={i}>
                            <td className="mono" style={{ padding: '6px 8px' }}>{row.moment}</td>
                            <td className="mlabel" style={{ padding: '6px 8px' }}>{row.action}</td>
                            <td className="mlabel" style={{ padding: '6px 8px' }}>{row.glucides}</td>
                            <td className="mlabel" style={{ padding: '6px 8px' }}>{row.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── ONGLET ASSISTANCE ─────────────────────────────────────────────── */}
          <div className={`plan-assistance-section crew-plan-page-break${tab !== 'assistance' ? ' tab-screen-hidden' : ''}`}>
            <CrewPlan
              projection={projection}
              nutritionRows={nutritionRows}
              ravitos={ravitos}
              unclassifiedWaypoints={unclassifiedWaypoints}
              onAddRavito={(r) => setRavitos(prev => [...prev.filter(x => x.km !== r.km), r].sort((a, b) => a.km - b.km))}
              onRemoveRavito={(km) => setRavitos(prev => prev.filter(r => r.km !== km))}
              onPromoteWaypoint={(w) => {
                setRavitos(prev => [...prev.filter(x => x.km !== w.km), { km: w.km, label: w.label, source: 'gpx' as const }].sort((a, b) => a.km - b.km))
                setUnclassifiedWaypoints(prev => prev.filter(u => u.km !== w.km))
              }}
              athleteName={athleteName}
            />
          </div>
        </>
      )}
    </>
  )
}
