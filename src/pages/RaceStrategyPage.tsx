import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { computeRaceProjection, type GpxPoint, type ProjectionResult } from '../lib/computeRaceProjection'
import { computeNutritionPlan } from '../lib/nutritionPlan'

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

  // Activities feed the progression factor and freshness adjustment in computeRaceProjection
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

  // Runner profile: VAM, coefficients uphill/downhill/flat, PRs, fc_max
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
    // setTimeout lets React flush the isComputing=true state before the sync computation
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

  // Auto-analyse when DB already has stored GPX points
  useEffect(() => {
    if (!race?.gpx_data || !activitiesData || !profileData) return
    if (projection) return
    const pts = race.gpx_data as GpxPoint[]
    if (!Array.isArray(pts) || pts.length < 2) return
    runAnalysis(pts, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race, activitiesData, profileData])

  // Leaflet map — initialises once projection is set and the div is in the DOM
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
  }, [projection])

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
      runAnalysis(pts, true)
    }
    reader.readAsText(file)
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
        <div className="loading">
          <div className="spinner" />
          <span className="mlabel">Chargement…</span>
        </div>
      </>
    )
  }

  if (isError || !race) {
    return (
      <>
        <BackLink />
        <div className="mlabel">Course introuvable.</div>
      </>
    )
  }

  const nutritionRows = projection
    ? computeNutritionPlan(
        projection.totalDistM,
        projection.estTimeS,
        profileData?.nutrition_level as string | undefined,
      )
    : []

  return (
    <>
      <BackLink />

      {/* ── Race header ─────────────────────────────────────────────────────── */}
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

      {/* ── Partage ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {race.share_token ? (
          <>
            <button
              className="hbtn"
              style={{ color: 'var(--vl-growth)', borderColor: 'var(--vl-growth)' }}
              onClick={() => copyShareUrl(race.share_token!)}
            >
              {copied ? 'Lien copié ✓' : 'Copier le lien'}
            </button>
            <button
              className="hbtn"
              onClick={() => shareMutation.mutate(false)}
              disabled={shareMutation.isPending}
            >
              Arrêter le partage
            </button>
          </>
        ) : (
          <button
            className="hbtn"
            onClick={() => shareMutation.mutate(true)}
            disabled={shareMutation.isPending}
          >
            {shareMutation.isPending ? '…' : 'Partager cette stratégie'}
          </button>
        )}
      </div>

      {/* ── Computing spinner ───────────────────────────────────────────────── */}
      {isComputing && (
        <div className="loading">
          <div className="spinner" />
          <span className="mlabel">Calcul de la stratégie…</span>
        </div>
      )}

      {/* ── GPX upload zone (visible only when no projection and not computing) */}
      {!projection && !isComputing && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="clabel" style={{ marginBottom: '1rem' }}>CHARGER LE GPX</div>
          <div className="mlabel" style={{ marginBottom: '1.25rem' }}>
            Importez le fichier GPX de la course pour générer votre stratégie personnalisée
          </div>
          <button className="hbtn" onClick={() => fileInputRef.current?.click()}>
            Sélectionner un fichier .gpx
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* ── Save status ─────────────────────────────────────────────────────── */}
      {saveStatus === 'saving' && <div className="mlabel" style={{ margin: '0.5rem 0' }}>Sauvegarde…</div>}
      {saveStatus === 'saved'  && <div className="mlabel" style={{ margin: '0.5rem 0', color: 'var(--vl-growth)' }}>GPX sauvegardé</div>}

      {/* ── Projection results ──────────────────────────────────────────────── */}
      {projection && (
        <>
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

          {/* Leaflet map */}
          <div
            ref={mapContainerRef}
            style={{ height: 240, borderRadius: 8, marginBottom: '1rem', overflow: 'hidden' }}
          />

          {/* Projection card */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="clabel">PROJECTION VORCELAB</div>
            <div className="strip">
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
            <div className="mlabel">Confiance : {projection.confidence}</div>

            {/* Personal adjustments (freshness, etc.) */}
            {projection.personalAdjustments.map((adj, i) => (
              <div key={i} className="fg" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span className="mlabel">{adj.label}</span>
                <span className="mlabel" style={{ color: adj.color }}>{adj.detail}</span>
              </div>
            ))}
          </div>

          {/* Goal comparison */}
          {race.goal_time && projection.goalLabel && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel">OBJECTIF</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <span className="sval">{race.goal_time}</span>
                <span className="mlabel" style={{ color: projection.goalCompareColor }}>{projection.goalLabel}</span>
              </div>
              {projection.goalCompareStr && (
                <div className="mlabel">{projection.goalCompareStr}</div>
              )}
            </div>
          )}

          {/* Plan de course */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="clabel">PLAN DE COURSE</div>
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

          {/* Plan nutrition accordion */}
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
        </>
      )}
    </>
  )
}
