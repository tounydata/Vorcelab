import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { computeRaceProjection, type GpxPoint, type ProjectionResult, type Section } from '../lib/computeRaceProjection'
import { computeNutritionPlan } from '../lib/nutritionPlan'
import { extractGpxWaypoints, type RavitoPoint } from '../lib/crewPlan'
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
function confidenceExplanation(c: string) {
  if (c === 'low') return "peu d'activités trail récentes · fourchette large"
  if (c === 'medium') return 'activités trail disponibles · estimation raisonnable'
  return 'profil trail solide · estimation fiable'
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
  if (mPerKm > 50) return `${mPerKm} m/km — course de montagne`
  if (mPerKm > 25) return `${mPerKm} m/km — course undulée`
  return `${mPerKm} m/km — course roulante`
}

export default function RaceStrategyPage() {
  const { raceId } = useParams<{ raceId: string }>()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<L.Map | null>(null)

  const [projection, setProjection] = useState<ProjectionResult | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [nutritionOpen, setNutritionOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'strategie' | 'assistance'>('strategie')
  const [ravitos, setRavitos] = useState<RavitoPoint[]>([])

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
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
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
      const waypoints = extractGpxWaypoints(text, pts)
      setRavitos(waypoints)
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
  let opportunitySection: Section | null = null
  interface SectionItem { section: Section; time: number; score: number; nutritionMoment?: string }
  let top3Sections: SectionItem[] = []

  if (projection) {
    riskSectionIdx = projection.sections.reduce((maxIdx, s, i) =>
      s.type === 'up' && s.grade > (maxIdx >= 0 ? projection.sections[maxIdx].grade : 0) ? i : maxIdx, -1)
    riskSection = riskSectionIdx >= 0 ? projection.sections[riskSectionIdx] : null
    riskSectionTime = riskSection ? projection.sectionTimes[riskSectionIdx] : 0

    opportunitySection = [...projection.sections]
      .filter(s => s.type === 'down')
      .sort((a, b) => b.dist - a.dist)[0] ?? null

    top3Sections = projection.sections
      .map((s, i) => ({
        section: s,
        time: projection.sectionTimes[i],
        score: Math.abs(s.grade) * s.dist,
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

      {/* ── Race header ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
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

      {/* ── Share ─────────────────────────────────────────────────────────────── */}
      <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {race.share_token ? (
          <>
            <button className="hbtn" style={{ color: 'var(--vl-growth)', borderColor: 'var(--vl-growth)' }} onClick={() => copyShareUrl(race.share_token!)}>
              {copied ? 'Lien copié ✓' : 'Copier le lien'}
            </button>
            <button className="hbtn" onClick={() => shareMutation.mutate(false)} disabled={shareMutation.isPending}>Arrêter le partage</button>
          </>
        ) : (
          <button className="hbtn" onClick={() => shareMutation.mutate(true)} disabled={shareMutation.isPending}>
            {shareMutation.isPending ? '…' : 'Partager cette stratégie'}
          </button>
        )}
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

          {/* Print buttons */}
          <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button className="hbtn" onClick={printStrategie}>Imprimer plan coureur</button>
            <button className="hbtn" onClick={printAssistance}>Imprimer plan assistance</button>
            <button className="hbtn" onClick={printBoth}>Imprimer les deux</button>
          </div>

          {/* ── ONGLET STRATÉGIE ──────────────────────────────────────────────── */}
          <div className={`strategie-section${tab !== 'strategie' ? ' tab-screen-hidden' : ''}`}>

            {/* Section A — Plan de course */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel">PLAN DE COURSE DE {athleteName.toUpperCase()}</div>

              {/* Times */}
              <div className="strip" style={{ marginTop: '0.5rem' }}>
                <div className="scell">
                  <div className="sval">{fmtTime(projection.estTimeS)}</div>
                  <div className="slbl">Cible</div>
                </div>
                <div className="scell">
                  <div className="sval">{fmtTime(projection.timeMin)}</div>
                  <div className="slbl">Optimiste</div>
                </div>
                <div className="scell">
                  <div className="sval">{fmtTime(projection.timeMax)}</div>
                  <div className="slbl">Prudent</div>
                </div>
              </div>

              {/* Confiance */}
              <div className="mlabel" style={{ marginTop: '0.5rem', color: confidenceColor(projection.confidence) }}>
                Confiance : {confidenceLabel(projection.confidence)} — {confidenceExplanation(projection.confidence)}
              </div>

              {/* Objectif */}
              {race.goal_time && projection.goalLabel && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="sval" style={{ fontSize: '1.2rem' }}>{race.goal_time}</span>
                  <span className="mlabel" style={{ color: projection.goalCompareColor }}>{projection.goalLabel}</span>
                  {projection.goalCompareStr && <span className="mlabel">{projection.goalCompareStr}</span>}
                </div>
              )}

              {/* Stratégie départ */}
              <div className="mlabel" style={{ marginTop: '0.5rem', fontStyle: 'italic', color: 'var(--vl-text-2)', textTransform: 'none', letterSpacing: 0 }}>
                {departStrategy(projection.confidence)}
              </div>

              {/* Risque principal */}
              {riskSection && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--vl-line)' }}>
                  <div className="mlabel" style={{ color: 'var(--vl-ember)', marginBottom: 4 }}>RISQUE PRINCIPAL</div>
                  <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <strong>Conseil :</strong> {riskConseil(riskSection.grade)}
                  </div>
                  <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <strong>Preuve :</strong> {Math.round(riskSection.grade)}% moyen · +{Math.round(riskSection.dplus)}m D+ · {(riskSection.dist / 1000).toFixed(1)} km.
                  </div>
                  <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <strong>Détail :</strong> km {riskSection.startKm.toFixed(1)} → {(riskSection.startKm + riskSection.dist / 1000).toFixed(1)} · temps estimé {fmtTime(riskSectionTime)}.
                  </div>
                </div>
              )}

              {/* Opportunité */}
              {opportunitySection && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--vl-line)' }}>
                  <div className="mlabel" style={{ color: 'var(--vl-growth)', marginBottom: 4 }}>OPPORTUNITÉ</div>
                  <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    Récupération possible sur la descente km {opportunitySection.startKm.toFixed(1)} → {(opportunitySection.startKm + opportunitySection.dist / 1000).toFixed(1)} (-{Math.round(opportunitySection.dminus)}m D-).
                  </div>
                </div>
              )}

              {/* Personal adjustments */}
              {projection.personalAdjustments.map((adj, i) => (
                <div key={i} className="fg" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span className="mlabel">{adj.label}</span>
                  <span className="mlabel" style={{ color: adj.color }}>{adj.detail}</span>
                </div>
              ))}
            </div>

            {/* Section B — Facteurs décisifs */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: '0.5rem' }}>FACTEURS DÉCISIFS</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* 1. Profil altimétrique */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--vl-line)' }}>
                  <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>Profil altimétrique</span>
                  <span className="mlabel" style={{ textAlign: 'right', textTransform: 'none', letterSpacing: 0 }}>
                    {profileAltiLabel(projection.dplus, projection.totalDistM)}
                  </span>
                </div>

                {/* 2. Confiance */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--vl-line)' }}>
                  <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>Confiance projection</span>
                  <span className="mlabel" style={{ textAlign: 'right', color: confidenceColor(projection.confidence), textTransform: 'none', letterSpacing: 0 }}>
                    {confidenceLabel(projection.confidence)} — {confidenceExplanation(projection.confidence)}
                  </span>
                </div>

                {/* 3. Section critique */}
                {riskSection && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--vl-line)' }}>
                    <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>Section critique</span>
                    <span className="mlabel" style={{ textAlign: 'right', textTransform: 'none', letterSpacing: 0 }}>
                      km {riskSection.startKm.toFixed(1)}–{(riskSection.startKm + riskSection.dist / 1000).toFixed(1)} · {Math.round(riskSection.grade)}% · +{Math.round(riskSection.dplus)}m · {fmtTime(riskSectionTime)}
                    </span>
                  </div>
                )}

                {/* 4. Fourchette d'incertitude */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--vl-line)' }}>
                  <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>Fourchette d'incertitude</span>
                  <span className="mlabel" style={{ textAlign: 'right', textTransform: 'none', letterSpacing: 0 }}>
                    {fmtTime(projection.timeMax - projection.timeMin)} entre scénarios
                  </span>
                </div>

                {/* 5. Ajustement fraîcheur */}
                {projection.personalAdjustments.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '6px 0' }}>
                    <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>Ajustement fraîcheur</span>
                    <span className="mlabel" style={{ textAlign: 'right', color: projection.personalAdjustments[0].color, textTransform: 'none', letterSpacing: 0 }}>
                      {projection.personalAdjustments[0].detail}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Section C — Sections clés */}
            {top3Sections.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="clabel" style={{ marginBottom: '0.5rem' }}>SECTIONS CLÉS</div>
                {top3Sections.map((item, i) => (
                  <div key={i} style={{ padding: '0.75rem 0', borderBottom: i < top3Sections.length - 1 ? '1px solid var(--vl-line)' : 'none' }}>
                    <div className="mlabel" style={{ marginBottom: 3 }}>
                      <span style={{ color: item.section.type === 'up' ? 'var(--vl-ember)' : 'var(--vl-growth)' }}>
                        {sectionLabel(item.section.type)}
                      </span>
                      {' '}km {item.section.startKm.toFixed(1)} → {(item.section.startKm + item.section.dist / 1000).toFixed(1)}
                    </div>
                    <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 2 }}>
                      <strong>Conseil :</strong> {sectionConseil(item.section)}
                    </div>
                    <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)', marginBottom: 2 }}>
                      <strong>Preuve :</strong> {Math.abs(Math.round(item.section.grade))}% · {item.section.type === 'up' ? `+${Math.round(item.section.dplus)}m D+` : `-${Math.round(item.section.dminus)}m D-`} · {(item.section.dist / 1000).toFixed(1)} km · {fmtTime(item.time)}.
                    </div>
                    <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)' }}>
                      <strong>Détail :</strong> km {item.section.startKm.toFixed(1)} → {(item.section.startKm + item.section.dist / 1000).toFixed(1)}
                      {item.nutritionMoment ? ` · Nutrition : ${item.nutritionMoment}` : ''}.
                    </div>
                  </div>
                ))}
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

              {/* Map */}
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
              onAddRavito={(r) => setRavitos(prev => [...prev.filter(x => x.km !== r.km), r].sort((a, b) => a.km - b.km))}
              onRemoveRavito={(km) => setRavitos(prev => prev.filter(r => r.km !== km))}
              athleteName={athleteName}
            />
          </div>
        </>
      )}
    </>
  )
}
