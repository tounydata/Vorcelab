import { useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { type GpxPoint } from '../lib/computeRaceProjection'

interface SharedRace {
  id: string
  name: string
  date: string
  type: string | null
  distance: number | null
  elevation: number | null
  goal_time: string | null
  gpx_data: GpxPoint[] | null
  last_projection: {
    cible: number
    prudent: number
    agressif: number
    confidence: string
  } | null
}

function fmtTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function RaceStrategyPublicPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<L.Map | null>(null)

  const { data: race, isLoading, isError } = useQuery<SharedRace | null>({
    queryKey: ['shared-race', shareToken],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_shared_race', { p_share_token: shareToken })
      if (error) throw error
      if (!data || (Array.isArray(data) && data.length === 0)) return null
      const row = Array.isArray(data) ? data[0] : data
      return row as SharedRace
    },
    enabled: !!shareToken,
  })

  useEffect(() => {
    if (!race?.gpx_data || !mapContainerRef.current) return
    if (leafletMapRef.current) {
      leafletMapRef.current.remove()
      leafletMapRef.current = null
    }
    const pts = race.gpx_data
    if (!Array.isArray(pts) || pts.length < 2) return
    const map = L.map(mapContainerRef.current)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    const latLngs = pts.map((p) => [p.lat, p.lon] as L.LatLngTuple)
    const poly = L.polyline(latLngs, { color: '#00d4ff', weight: 3 }).addTo(map)
    map.fitBounds(poly.getBounds(), { padding: [20, 20] })
    leafletMapRef.current = map
    return () => {
      leafletMapRef.current?.remove()
      leafletMapRef.current = null
    }
  }, [race])

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--vl-ember)' }}>
          VORCELAB
        </div>
        <Link to="/">
          <button className="hbtn">Créer un compte</button>
        </Link>
      </div>

      {isLoading && (
        <div className="loading">
          <div className="spinner" />
          <span className="mlabel">Chargement…</span>
        </div>
      )}

      {(isError || (!isLoading && !race)) && (
        <div className="card">
          <div className="clabel" style={{ marginBottom: 8 }}>LIEN INVALIDE</div>
          <div className="mlabel">Ce lien de partage est introuvable ou a été désactivé.</div>
        </div>
      )}

      {race && (
        <>
          {/* Race header */}
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

          {/* Map */}
          {race.gpx_data && Array.isArray(race.gpx_data) && race.gpx_data.length > 1 && (
            <div
              ref={mapContainerRef}
              style={{ height: 240, borderRadius: 8, marginBottom: '1rem', overflow: 'hidden' }}
            />
          )}

          {/* Projection */}
          {race.last_projection ? (
            <>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="clabel">PROJECTION VORCELAB</div>
                <div className="strip">
                  <div className="scell">
                    <div className="sval">{fmtTime(race.last_projection.cible)}</div>
                    <div className="slbl">Cible</div>
                  </div>
                  <div className="scell">
                    <div className="sval">{fmtTime(race.last_projection.agressif)}</div>
                    <div className="slbl">Optimiste</div>
                  </div>
                  <div className="scell">
                    <div className="sval">{fmtTime(race.last_projection.prudent)}</div>
                    <div className="slbl">Prudent</div>
                  </div>
                </div>
                {race.last_projection.confidence && (
                  <div className="mlabel">Confiance : {race.last_projection.confidence}</div>
                )}
              </div>

              {race.goal_time && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                  <div className="clabel">OBJECTIF</div>
                  <div className="sval">{race.goal_time}</div>
                </div>
              )}
            </>
          ) : (
            <div className="card">
              <div className="mlabel">Aucune projection calculée pour cette course.</div>
            </div>
          )}

          {/* CTA */}
          <div className="card" style={{ marginTop: '2rem', textAlign: 'center' }}>
            <div className="clabel" style={{ marginBottom: 8 }}>ANALYSEZ VOS PROPRES COURSES</div>
            <div className="mlabel" style={{ marginBottom: '1rem', textTransform: 'none', letterSpacing: 0 }}>
              Vorcelab prédit vos temps de trail à partir de votre profil Strava et d'un algorithme biomécanique (Minetti 2002).
            </div>
            <Link to="/">
              <button className="btn-primary">Commencer gratuitement</button>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
