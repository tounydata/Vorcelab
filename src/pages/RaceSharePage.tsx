import { useMemo } from 'react'
import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { mapDbRace } from '../types/race'
import { analyzeGPX } from '../utils/gpxAnalyze'
import { fmtD } from '../utils/formatters'
import { GpxElevationChart } from '../components/GpxElevationChart'
import { GpxStratMap } from '../components/GpxStratMap'

export function RaceSharePage() {
  const { token } = useParams<{ token: string }>()

  const { data: race, isLoading, isError } = useQuery({
    queryKey: ['share', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_shared_race', { p_share_token: token! })
      if (error) throw error
      if (!data || (Array.isArray(data) && data.length === 0)) throw new Error('not_found')
      const row = Array.isArray(data) ? data[0] : data
      return mapDbRace(row as Record<string, unknown>)
    },
    enabled: !!token,
    retry: false,
  })

  // Reconstruit les sections / graphe depuis gpx_data (pas d'activités = projection par défaut)
  const result = useMemo(() => {
    if (!race?.gpx_data?.length) return null
    return analyzeGPX({
      points: race.gpx_data,
      race: { name: race.name, date: race.date, type: race.type, goal_time: race.goal_time },
      activities: [],
      profile: {},
      weather: null,
    })
  }, [race])

  const isTrail = race ? ['Trail', 'TrailRun', 'trail'].includes(race.type) : false
  const proj = race?.last_projection  // projection sauvegardée avec les données réelles du coureur

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'monospace', color: '#666' }}>
        Chargement…
      </div>
    )
  }

  if (isError || !race) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 20px', fontFamily: 'monospace', textAlign: 'center' }}>
        <div style={{ fontSize: '1.2rem', marginBottom: 12 }}>Course introuvable</div>
        <div style={{ fontSize: '.75rem', color: '#888', marginBottom: 24 }}>Ce lien n'est plus valide ou n'a jamais existé.</div>
        <Link to="/" style={{ fontSize: '.7rem', color: '#E5562A', textDecoration: 'none' }}>← Créer ma stratégie sur Vorcelab</Link>
      </div>
    )
  }

  const dateStr = new Date(race.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vl-bg, #0e0e10)', color: 'var(--vl-text-1, #f0f0f0)' }}>
      {/* Header minimal */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,.08)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--vl-display, monospace)', fontWeight: 800, fontSize: '.85rem', letterSpacing: '.12em', color: 'var(--vl-ember, #E5562A)' }}>VORCELAB</span>
        <Link to="/" style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.55rem', color: 'var(--vl-text-3, #888)', textDecoration: 'none' }}>Créer mon plan →</Link>
      </div>

      <div style={{ maxWidth: 660, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* Race header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'var(--vl-display, monospace)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '.02em', textTransform: 'uppercase', lineHeight: 1.1, margin: '0 0 6px' }}>
            {race.name}
          </h1>
          <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.6rem', color: 'var(--vl-text-3, #888)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{dateStr}</span>
            <span style={{ padding: '1px 6px', borderRadius: 4, background: isTrail ? 'rgba(229,86,42,.15)' : 'rgba(16,185,129,.15)', color: isTrail ? '#E5562A' : '#10B981', fontWeight: 700 }}>
              {isTrail ? 'Trail' : 'Route'}
            </span>
            {race.distance > 0 && <span>{(race.distance / 1000).toFixed(1)} km</span>}
            {race.goal_time && <span>Objectif {race.goal_time}</span>}
          </div>
        </div>

        {/* Projection sauvegardée */}
        {proj && (
          <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: '14px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.55rem', color: 'var(--vl-text-3, #888)', letterSpacing: '.1em', marginBottom: 6 }}>PROJECTION VORCELAB</div>
              <div style={{ fontFamily: 'var(--vl-display, monospace)', fontSize: '2.2rem', fontWeight: 900, lineHeight: 1 }}>{fmtD(proj.cible)}</div>
              <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.6rem', color: 'var(--vl-text-3, #888)', marginTop: 4 }}>
                {fmtD(proj.prudent)} – {fmtD(proj.agressif)}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.55rem', color: '#888', marginTop: 6 }}>
                Calculée avec les données du coureur
              </div>
            </div>
            {race.goal_time && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.55rem', color: '#888', letterSpacing: '.1em', marginBottom: 4 }}>OBJECTIF</div>
                <div style={{ fontFamily: 'var(--vl-display, monospace)', fontSize: '1.4rem', fontWeight: 800 }}>{race.goal_time}</div>
              </div>
            )}
          </div>
        )}

        {/* Tracé + profil */}
        {result && (
          <>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 1, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              {[
                { val: (result.totalDist / 1000).toFixed(1) + ' km', lbl: 'Distance', col: '#E5562A' },
                { val: '+' + Math.round(result.dplus) + ' m', lbl: 'D+', col: '#E8A23A' },
                { val: '−' + Math.round(result.dminus) + ' m', lbl: 'D−' },
                { val: result.altMin + ' m', lbl: 'Alt. min' },
                { val: result.altMax + ' m', lbl: 'Alt. max' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,.03)', padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--vl-display, monospace)', fontSize: '1rem', fontWeight: 700, color: s.col ?? '#ccc' }}>{s.val}</div>
                  <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.5rem', color: '#666', letterSpacing: '.08em', marginTop: 2 }}>{s.lbl}</div>
                </div>
              ))}
            </div>

            {/* Carte + profil élévation */}
            <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ padding: '10px 14px 8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.55rem', color: '#888', letterSpacing: '.1em' }}>TRACÉ GPX + PROFIL</span>
                <span style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.55rem', color: '#888' }}>{(result.totalDist / 1000).toFixed(2)} km</span>
              </div>
              <GpxStratMap points={race.gpx_data!} sections={result.sections} cumDist={result.cumDist} />
              <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '8px 14px 10px' }}>
                <GpxElevationChart samples={result.samples} sections={result.sections} />
              </div>
            </div>

            {/* Sections résumé */}
            <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.6rem', color: '#888', marginBottom: 20 }}>
              {result.sections.length} section{result.sections.length > 1 ? 's' : ''} · {result.sections.filter(s => s.type === 'up').length} montée{result.sections.filter(s => s.type === 'up').length > 1 ? 's' : ''} · temps estimé {fmtD(result.estTimeS)} (modèle par défaut)
            </div>
          </>
        )}

        {!race.gpx_data?.length && !proj && (
          <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.65rem', color: '#666', textAlign: 'center', padding: '40px 0' }}>
            La stratégie n'a pas encore été calculée pour cette course.
          </div>
        )}

        {/* CTA */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 24, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--vl-mono, monospace)', fontSize: '.65rem', color: '#888', marginBottom: 12 }}>
            Calcule ta propre stratégie de course avec Vorcelab
          </div>
          <Link
            to="/"
            style={{ display: 'inline-block', fontFamily: 'var(--vl-display, monospace)', fontSize: '.8rem', fontWeight: 700, letterSpacing: '.06em', color: '#E5562A', textDecoration: 'none', border: '1px solid rgba(229,86,42,.4)', borderRadius: 8, padding: '10px 20px' }}
          >
            CRÉER MON PLAN →
          </Link>
        </div>
      </div>
    </div>
  )
}
