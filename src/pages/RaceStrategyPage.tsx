import { useState, useRef, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import { mapDbRace } from '../types/race'
import type { GpxPoint } from '../types/race'
import { analyzeGPX } from '../utils/gpxAnalyze'
import type { AnalyzeResult } from '../utils/gpxAnalyze'
import { fetchForecastWeather } from '../lib/fetchForecastWeather'
import type { WeatherForecast } from '../lib/fetchForecastWeather'
import { genNutritionRows } from '../utils/nutritionPlan'
import { isRun, fmtD } from '../utils/formatters'
import { GpxElevationChart } from '../components/GpxElevationChart'
import { GpxStratMap } from '../components/GpxStratMap'
import type { Section } from '../utils/gpxCore'

const FC_MAX_DEFAULT = 185

// Confidence dots: ● filled / ○ empty
function ConfDots({ confidence }: { confidence: 'good' | 'medium' | 'low' }) {
  const n = confidence === 'good' ? 5 : confidence === 'medium' ? 3 : 1
  const color = { good: 'var(--vl-growth)', medium: 'var(--vl-amber)', low: 'var(--vl-ember)' }[confidence]
  return (
    <span style={{ letterSpacing: 2, fontSize: 11 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <span key={i} style={{ color: i < n ? color : 'var(--vl-text-3)' }}>{i < n ? '●' : '○'}</span>
      ))}
    </span>
  )
}

function SectionCard({ s, timeS, idx, isTrail, fcMax }: { s: Section; timeS: number; idx: number; isTrail: boolean; fcMax: number }) {
  const cols: Record<string, string> = { up: 'var(--vl-ember)', down: 'var(--vl-amber)', flat: 'var(--vl-growth)' }
  const icons = { up: '↑', down: '↓', flat: '→' }
  const names = { up: 'Montée', down: 'Descente', flat: 'Plat / Liaison' }
  const lthr = Math.round(fcMax * 0.88)
  const z2top = Math.round(fcMax * 0.70)
  const z3top = Math.round(fcMax * 0.80)
  const distKm = (s.dist / 1000).toFixed(2)

  let advice: string
  const tags: { l: string; c: string }[] = []

  if (s.type === 'up') {
    const steep = Math.abs(s.grade) > 10
    const vam = s.dplus > 0 ? Math.round(s.dplus / (timeS / 3600)) : 0
    if (isTrail) {
      const rpe = steep ? 7 : 6
      tags.push({ l: `${distKm} km`, c: 'var(--vl-ember)' }, { l: `+${s.dplus}m D+`, c: 'var(--vl-ember)' }, { l: `${Math.abs(s.grade).toFixed(1)}% pente`, c: 'var(--vl-amber)' }, { l: `RPE ${rpe}/10`, c: steep ? 'var(--vl-ember)' : 'var(--vl-amber)' })
      advice = steep
        ? `Montée raide (${Math.abs(s.grade).toFixed(1)}%) — passe en marche active dès que tu ne peux plus tenir une conversation (RPE 8+). La marche rapide est souvent plus efficace que courir en souffrant ici.${vam > 0 ? ` VAM requise ~${vam} m/h.` : ''}`
        : `Montée modérée (${Math.abs(s.grade).toFixed(1)}%) — foulée courte et fréquente, appuis avant-pied, bras actifs. Vise RPE 6-7 : tu dois pouvoir dire 2-3 mots entre chaque respiration.${vam > 0 ? ` VAM requise ~${vam} m/h.` : ''}`
    } else {
      const fcCible = steep ? Math.round(lthr * 0.96) : Math.round(lthr * 0.92)
      tags.push({ l: `${distKm} km`, c: 'var(--vl-ember)' }, { l: `+${s.dplus}m D+`, c: 'var(--vl-ember)' }, { l: `${Math.abs(s.grade).toFixed(1)}% pente`, c: 'var(--vl-amber)' }, { l: `FC < ${fcCible} bpm`, c: 'var(--vl-text-2)' })
      advice = `Côte (${Math.abs(s.grade).toFixed(1)}%) — maintenir FC sous ${fcCible} bpm (${steep ? '96' : '92'}% LTHR). Raccourcir la foulée, ne pas chercher à maintenir l'allure — la FC est ton gouverneur ici.`
    }
  } else if (s.type === 'down') {
    const technical = Math.abs(s.grade) > 12
    if (isTrail) {
      tags.push({ l: `${distKm} km`, c: 'var(--vl-amber)' }, { l: `-${s.dminus}m D-`, c: 'var(--vl-amber)' }, { l: `${Math.abs(s.grade).toFixed(1)}% pente`, c: 'var(--vl-text-2)' }, { l: 'RPE 3-4', c: 'var(--vl-text-2)' }, { l: 'Récupération active', c: 'var(--vl-growth)' })
      advice = technical
        ? `Descente technique (${Math.abs(s.grade).toFixed(1)}%) — foulées très courtes et rapides, regard 2-3m devant, léger penché avant. Ne jamais freiner avec les talons (impact 3-4× ton poids). RPE 4 max.`
        : `Descente douce (${Math.abs(s.grade).toFixed(1)}%) — foulées courtes et rapides, laisse la FC descendre sous Z3 (${z2top}-${z3top} bpm). C'est ta fenêtre de récupération. RPE 3-4.`
    } else {
      tags.push({ l: `${distKm} km`, c: 'var(--vl-amber)' }, { l: `-${s.dminus}m D-`, c: 'var(--vl-amber)' }, { l: 'Récupération', c: 'var(--vl-growth)' })
      advice = `Descente — allure légèrement accélérée, contrôlée. FC qui redescend sous ${z3top} bpm. Profite pour récupérer avant la prochaine côte.`
    }
  } else {
    if (isTrail) {
      tags.push({ l: `${distKm} km`, c: 'var(--vl-growth)' }, { l: 'RPE 4-5', c: 'var(--vl-growth)' }, { l: 'Récupération active', c: 'var(--vl-text-2)' })
      advice = 'Section plate / liaison — laisse la FC redescendre, reprends la respiration. RPE 4-5 : tu dois pouvoir parler en phrases courtes. Si tu as un ravito, c\'est ici qu\'on mange et qu\'on boit.'
    } else {
      const fcLow = Math.round(lthr * 0.90), fcHigh = Math.round(lthr * 0.95)
      tags.push({ l: `${distKm} km`, c: 'var(--vl-growth)' }, { l: `FC cible ${fcLow}-${fcHigh} bpm`, c: 'var(--vl-growth)' })
      advice = `Section plate — allure cible, FC maintenue entre ${fcLow} et ${fcHigh} bpm (90-95% LTHR). C'est ton allure de croisière sur route.`
    }
  }

  return (
    <div key={idx} style={{ flexShrink: 0, width: 260, background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${cols[s.type]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>
          km {s.startKm.toFixed(1)} → {s.endKm.toFixed(1)}
        </span>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>
          {fmtD(timeS)} estimé
        </span>
      </div>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '.95rem', fontWeight: 700, color: cols[s.type], marginBottom: 8 }}>
        {icons[s.type]} {names[s.type]}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {tags.map((t, i) => (
          <span key={i} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', padding: '2px 6px', borderRadius: 4, border: `1px solid ${t.c}40`, color: t.c }}>
            {t.l}
          </span>
        ))}
      </div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-2)', lineHeight: 1.6 }}>
        {advice}
      </div>
    </div>
  )
}

function parseGpxXml(xml: string): GpxPoint[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const pts = doc.querySelectorAll('trkpt')
  const points: GpxPoint[] = []
  pts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat') || '0')
    const lon = parseFloat(pt.getAttribute('lon') || '0')
    const eleEl = pt.querySelector('ele')
    points.push({ lat, lon, ele: eleEl ? parseFloat(eleEl.textContent || '0') : null })
  })
  return points
}

export function RaceStrategyPage() {
  const { id } = useParams<{ id: string }>()
  const user = useVLStore(s => s.user)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [weather, setWeather] = useState<WeatherForecast | null>(null)
  const [weatherNote, setWeatherNote] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [openSections, setOpenSections] = useState(true)
  const [openNutrition, setOpenNutrition] = useState(false)
  const [shareState, setShareState] = useState<'idle' | 'saving' | 'copied'>('idle')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [linkedStrava, setLinkedStrava] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const { data: race, isLoading: raceLoading } = useQuery({
    queryKey: ['race', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('*')
        .eq('id', id)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return mapDbRace(data as Record<string, unknown>)
    },
    enabled: !!user && !!id,
  })

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('strava_activities').select('*').eq('user_id', user!.id).is('deleted_at', null).order('start_date', { ascending: false }).limit(200)
      return (data || []).filter(r => isRun(r.type as string)).map(mapDbActivity)
    },
    enabled: !!user,
  })

  const { data: profile = {} } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('fc_max, prs, nutrition_level').eq('id', user!.id).single()
      return (data as { fc_max?: number; prs?: Record<string, { timeS: number; dist: number }>; nutrition_level?: string } | null) ?? {}
    },
    enabled: !!user,
  })

  // Sortie Strava correspondante (même jour ±1 j, type run, non encore liée)
  const stravaMatch = useMemo(() => {
    if (linkedStrava || race?.strava_activity_id !== null && race?.strava_activity_id !== undefined || !race?.date || !activities.length) return null
    const raceDate = race.date
    return activities.find(a => {
      const actDate = (a.start_date_local ?? a.start_date).slice(0, 10)
      return Math.abs(new Date(actDate).getTime() - new Date(raceDate).getTime()) <= 86400000
    }) ?? null
  }, [race, activities, linkedStrava])

  // Auto-analyze when race gpx_data is loaded — useEffect to avoid state updates during render
  const autoAnalyzed = useRef(false)
  useEffect(() => {
    if (autoAnalyzed.current || !race?.gpx_data || race.gpx_data.length < 2 || result || analyzing) return
    autoAnalyzed.current = true
    setAnalyzing(true)
    const points = race.gpx_data
    fetchForecastWeather(points[0], race.date).then(({ weather: w, weatherNote: wn }) => {
      setWeather(w)
      setWeatherNote(wn)
      const r = analyzeGPX({ points, race, activities, profile, weather: w })
      setResult(r)
      setAnalyzing(false)
      // Persist projection when not yet saved (gpx_data came from main app without projection)
      if (race.id && !race.last_projection) {
        supabase
          .from('race_calendar')
          .update({
            last_projection: {
              cible: Math.round(r.estTimeS),
              prudent: Math.round(r.timeMax),
              agressif: Math.round(r.timeMin),
              confidence: r.confidence,
            },
          })
          .eq('id', race.id)
          .then(({ error }) => {
            if (error) console.warn('[VL] projection save error:', error.message)
            else queryClient.invalidateQueries({ queryKey: ['race', id] })
          })
      }
    })
  }, [race, activities, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGpxFile(file: File) {
    setAnalyzing(true)
    setResult(null)
    setSaveState('idle')
    const text = await file.text()
    const points = parseGpxXml(text)
    if (points.length < 2) { setAnalyzing(false); return }
    const { weather: w, weatherNote: wn } = await fetchForecastWeather(points[0], race?.date)
    setWeather(w)
    setWeatherNote(wn)
    const r = analyzeGPX({ points, race: race ?? { name: file.name.replace('.gpx', '') }, activities, profile, weather: w })
    setResult(r)
    setAnalyzing(false)

    if (race?.id) {
      setSaveState('saving')
      const { error } = await supabase
        .from('race_calendar')
        .update({
          gpx_data: points,
          last_projection: {
            cible: Math.round(r.estTimeS),
            prudent: Math.round(r.timeMax),
            agressif: Math.round(r.timeMin),
            confidence: r.confidence,
          },
        })
        .eq('id', race.id)
      if (error) {
        console.warn('[VL] race save error:', error.message)
        setSaveState('error')
      } else {
        setSaveState('saved')
        queryClient.invalidateQueries({ queryKey: ['race', id] })
        setTimeout(() => setSaveState('idle'), 3000)
      }
    }
  }

  async function handleShare() {
    if (!race) return
    setShareState('saving')
    let token = race.share_token
    if (!token) {
      token = crypto.randomUUID()
      const { error } = await supabase
        .from('race_calendar')
        .update({ share_token: token })
        .eq('id', race.id)
      if (error) { setShareState('idle'); return }
      queryClient.invalidateQueries({ queryKey: ['race', id] })
    }
    const base = window.location.href.split('#')[0]
    const url = `${base}#/share/${token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      setShareUrl(url)
    }
    setShareState('copied')
    setTimeout(() => { setShareState('idle'); setShareUrl(null) }, 3000)
  }

  async function handleLinkStrava(activityId: number) {
    if (!race) return
    const { error } = await supabase
      .from('race_calendar')
      .update({ strava_activity_id: activityId })
      .eq('id', race.id)
    if (!error) {
      setLinkedStrava(true)
      queryClient.invalidateQueries({ queryKey: ['race', id] })
    }
  }

  if (raceLoading) {
    return <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-3)', padding: '60px 0', textAlign: 'center' }}>Chargement…</div>
  }
  if (!race) {
    return <div style={{ padding: 20 }}><Link to="/race" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-text-3)', textDecoration: 'none' }}>← Retour</Link><div style={{ fontFamily: 'var(--vl-mono)', color: 'var(--vl-ember)', marginTop: 20 }}>Course introuvable.</div></div>
  }

  const fcMax = profile.fc_max || FC_MAX_DEFAULT
  const isTrail = ['Trail', 'TrailRun', 'trail'].includes(race.type)
  const raceDate = new Date(race.date)
  const dateStr = raceDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const confidenceLabel = result ? { good: 'Fiable', medium: 'Indicative', low: 'Estimation' }[result.confidence] : ''
  const confidenceColor = result ? { good: 'var(--vl-growth)', medium: 'var(--vl-amber)', low: 'var(--vl-ember)' }[result.confidence] : ''
  const nutrRows = result ? genNutritionRows(result.totalDist, result.estTimeS, profile.nutrition_level) : []

  // Goal time comparison
  let goalLabel = '', goalColor = 'var(--vl-text-3)', goalNote = ''
  if (result && race.goal_time) {
    const gMatch = race.goal_time.match(/(\d+)[hH](\d*)/)
    if (gMatch) {
      const goalSec = parseInt(gMatch[1]) * 3600 + (parseInt(gMatch[2]) || 0) * 60
      const ratio = Math.round(result.estTimeS) / goalSec
      const absDiff = Math.abs(goalSec - Math.round(result.estTimeS))
      const diffStr = fmtD(absDiff)
      if (ratio < 0.94) { goalLabel = 'Très conservateur'; goalColor = 'var(--vl-text-3)'; goalNote = `Projection ${diffStr} plus rapide` }
      else if (ratio < 0.97) { goalLabel = 'Conservateur'; goalColor = 'var(--vl-growth)'; goalNote = `Projection ${diffStr} plus rapide` }
      else if (ratio <= 1.03) { goalLabel = 'Réaliste'; goalColor = 'var(--vl-growth)'; goalNote = 'Objectif aligné avec la projection' }
      else if (ratio <= 1.10) { goalLabel = 'Ambitieux'; goalColor = 'var(--vl-amber)'; goalNote = `Objectif ${diffStr} plus rapide` }
      else { goalLabel = 'Très ambitieux'; goalColor = 'var(--vl-ember)'; goalNote = `Objectif ${diffStr} plus rapide` }
    }
  }

  return (
    <div style={{ maxWidth: 660 }}>
      <Link to="/race" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-text-3)', textDecoration: 'none', display: 'inline-block', marginBottom: 20 }}>
        ← Stratégies
      </Link>

      {/* Race header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '.02em', textTransform: 'uppercase', lineHeight: 1.1, margin: '0 0 4px' }}>
          {race.name}
        </h1>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>{dateStr}</span>
          <span style={{ padding: '1px 6px', borderRadius: 4, background: isTrail ? 'rgba(229,86,42,.15)' : 'rgba(16,185,129,.15)', color: isTrail ? 'var(--vl-ember)' : 'var(--vl-growth)', fontWeight: 700 }}>{isTrail ? 'Trail' : 'Route'}</span>
          {race.goal_time && <span>Objectif {race.goal_time}</span>}
        </div>
      </div>

      {/* Suggestion de lien Strava automatique */}
      {stravaMatch && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'rgba(232,162,58,.08)', border: '1px solid rgba(232,162,58,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-2)', minWidth: 0 }}>
            <span style={{ color: 'var(--vl-amber)', fontWeight: 700 }}>Strava ↗ </span>
            Sortie du {new Date(stravaMatch.start_date_local).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · <em>{stravaMatch.name}</em>
          </div>
          <button
            onClick={() => handleLinkStrava(stravaMatch.id)}
            style={{ flexShrink: 0, fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-amber)', background: 'none', border: '1px solid rgba(232,162,58,.4)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Lier →
          </button>
        </div>
      )}

      {/* Upload zone — shown when no GPX loaded */}
      {!result && !analyzing && (
        <div
          style={{ border: '2px dashed var(--vl-line)', borderRadius: 8, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.gpx')) handleGpxFile(f) }}
        >
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '.05em', marginBottom: 8 }}>
            CHARGER LE GPX
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-text-3)' }}>
            Glisse un fichier .gpx ou clique pour choisir
          </div>
          <input ref={fileInputRef} type="file" accept=".gpx" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleGpxFile(f) }} />
        </div>
      )}

      {/* Loading splash */}
      {analyzing && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '40px 20px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--vl-line)', borderTopColor: 'var(--vl-ember)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-text-3)' }}>
            Calcul de la stratégie…
          </div>
        </div>
      )}

      {result && (
        <>
          {/* Stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 1, background: 'var(--vl-line)', border: '1px solid var(--vl-line)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            {[
              { val: (result.totalDist / 1000).toFixed(1) + ' km', lbl: 'Distance', col: 'var(--vl-ember)' },
              { val: '+' + Math.round(result.dplus) + ' m', lbl: 'D+', col: 'var(--vl-amber)' },
              { val: '−' + Math.round(result.dminus) + ' m', lbl: 'D−' },
              { val: result.altMin + ' m', lbl: 'Alt. min' },
              { val: result.altMax + ' m', lbl: 'Alt. max' },
              ...(weather !== null ? [{ val: Math.round(weather.temp) + '°C', lbl: 'Météo', col: weather.temp > 25 ? 'var(--vl-ember)' : weather.temp < 5 ? 'var(--vl-amber)' : 'var(--vl-growth)' }] : []),
              ...(weather !== null ? [{ val: weather.precip_prob + '%', lbl: 'Pluie', col: weather.precip_prob > 50 ? 'var(--vl-ember)' : 'var(--vl-growth)' }] : []),
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--vl-surf)', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 700, color: s.col ?? 'var(--vl-text-2)' }}>{s.val}</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>{s.lbl}</div>
              </div>
            ))}
          </div>

          {/* Map + elevation */}
          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '10px 14px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>TRACÉ GPX + PROFIL</span>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>{(result.totalDist / 1000).toFixed(2)} km</span>
            </div>
            <GpxStratMap points={race.gpx_data ?? []} sections={result.sections} cumDist={result.cumDist} />
            <div style={{ borderTop: '1px solid var(--vl-line)', padding: '8px 14px 10px' }}>
              <GpxElevationChart samples={result.samples} sections={result.sections} />
            </div>
          </div>

          {/* Projection card */}
          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 6 }}>PROJECTION VORCELAB</div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2.2rem', fontWeight: 900, color: 'var(--vl-text-1)', lineHeight: 1 }}>
                {fmtD(result.estTimeS)}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginTop: 4 }}>
                {fmtD(result.timeMin)} – {fmtD(result.timeMax)}
              </div>
              {weatherNote && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-amber)', marginTop: 4 }}>{weatherNote}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <ConfDots confidence={result.confidence} />
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: confidenceColor }}>{confidenceLabel}</span>
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginTop: 4, lineHeight: 1.5 }}>
                {result.projSource}
              </div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              {race.goal_time ? (
                <>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 4 }}>OBJECTIF</div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 800 }}>{race.goal_time}</div>
                  {goalLabel && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: goalColor, marginTop: 4 }}>{goalLabel}</div>}
                  {goalNote && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', marginTop: 2 }}>{goalNote}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 6 }}>SCÉNARIOS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <div><span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>Prudent </span><span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem' }}>{fmtD(result.timeMax)}</span></div>
                    <div><span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-growth)' }}>Agressif </span><span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem' }}>{fmtD(result.timeMin)}</span></div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sections */}
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setOpenSections(v => !v)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: openSections ? '8px 8px 0 0' : 8, padding: '11px 14px', cursor: 'pointer', color: 'inherit' }}
            >
              <span style={{ fontFamily: 'var(--vl-display)', fontSize: '.9rem', fontWeight: 700, letterSpacing: '.04em' }}>PLAN DE COURSE</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>{result.sections.length} section{result.sections.length > 1 ? 's' : ''}</span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 14, color: 'var(--vl-text-3)' }}>{openSections ? '▾' : '▸'}</span>
              </span>
            </button>
            {openSections && (
              <div style={{ border: '1px solid var(--vl-line)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '12px', overflowX: 'auto' }}>
                <div style={{ display: 'flex', gap: 10, width: 'max-content' }}>
                  {result.sections.map((s, i) => (
                    <SectionCard key={i} s={s} timeS={result.sectionTimes[i]} idx={i} isTrail={result.isTrail} fcMax={fcMax} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Nutrition */}
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setOpenNutrition(v => !v)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: openNutrition ? '8px 8px 0 0' : 8, padding: '11px 14px', cursor: 'pointer', color: 'inherit' }}
            >
              <span style={{ fontFamily: 'var(--vl-display)', fontSize: '.9rem', fontWeight: 700, letterSpacing: '.04em' }}>PLAN NUTRITION</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>{result.estTimeS / 3600 < 1.25 ? '< 75 min' : result.estTimeS / 3600 < 2.5 ? '75–150 min' : '> 150 min'}</span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 14, color: 'var(--vl-text-3)' }}>{openNutrition ? '▾' : '▸'}</span>
              </span>
            </button>
            {openNutrition && (
              <div style={{ border: '1px solid var(--vl-line)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '12px 14px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--vl-mono)', fontSize: '.6rem' }}>
                  <thead>
                    <tr>
                      {['Moment', 'Action', 'Glucides', 'Justification'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--vl-text-3)', fontWeight: 600, letterSpacing: '.06em', borderBottom: '1px solid var(--vl-line)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nutrRows.map((row, i) => (
                      <tr key={i} style={{ background: row.highlight === 'info' ? 'rgba(0,212,255,.04)' : row.highlight === 'tip' ? 'rgba(16,185,129,.04)' : 'transparent' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--vl-text-3)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{row.timing}</td>
                        <td style={{ padding: '7px 8px', color: 'var(--vl-text-2)', verticalAlign: 'top' }}>{row.action}</td>
                        <td style={{ padding: '7px 8px', color: 'var(--vl-ember)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{row.carbs}</td>
                        <td style={{ padding: '7px 8px', color: 'var(--vl-text-3)', verticalAlign: 'top', lineHeight: 1.5 }}>{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actions : re-upload + partage + save indicator */}
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => { setResult(null); setSaveState('idle') }} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', background: 'none', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
              Changer le GPX
            </button>
            <button
              onClick={handleShare}
              disabled={shareState === 'saving'}
              style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: shareState === 'copied' ? 'var(--vl-growth)' : 'var(--vl-text-3)', background: 'none', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}
            >
              {shareState === 'saving' ? '…' : shareState === 'copied' ? 'Lien copié ✓' : 'Partager ↗'}
            </button>
            {saveState === 'saving' && (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>Sauvegarde…</span>
            )}
            {saveState === 'saved' && (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-growth)' }}>GPX sauvegardé ✓</span>
            )}
            {saveState === 'error' && (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-ember)' }}>Erreur sauvegarde</span>
            )}
            {shareUrl && (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', wordBreak: 'break-all' }}>{shareUrl}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
