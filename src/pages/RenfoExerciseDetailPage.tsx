import { useMemo } from 'react'
import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
// @ts-ignore
import { RENFO_EXERCISES as _RENFO_EXERCISES, RENFO_FOCUS_COLORS as _RENFO_FOCUS_COLORS } from '../../renfo-data.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RENFO_EXERCISES = _RENFO_EXERCISES as Record<string, any>
const RENFO_FOCUS_COLORS = _RENFO_FOCUS_COLORS as Record<string, string>

interface ChartPoint { date: string; e1rm: number }

function E1rmChart({ data, color }: { data: ChartPoint[]; color: string }) {
  const W = 300
  const H = 120
  const PL = 36, PR = 10, PT = 10, PB = 28

  const minE = Math.min(...data.map((d) => d.e1rm))
  const maxE = Math.max(...data.map((d) => d.e1rm))
  const eRange = maxE - minE || 1
  const minT = new Date(data[0].date).getTime()
  const maxT = new Date(data[data.length - 1].date).getTime()
  const tRange = maxT - minT || 1

  const toX = (d: string) => PL + ((new Date(d).getTime() - minT) / tRange) * (W - PL - PR)
  const toY = (e: number) => PT + (1 - (e - minE) / eRange) * (H - PT - PB)

  const pts = data.map((d) => `${toX(d.date).toFixed(1)},${toY(d.e1rm).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
      <line x1={PL} y1={toY(minE)} x2={W - PR} y2={toY(minE)} stroke="var(--vl-border)" strokeWidth={1} />
      {maxE !== minE && (
        <line x1={PL} y1={toY(maxE)} x2={W - PR} y2={toY(maxE)} stroke="var(--vl-border)" strokeWidth={1} strokeDasharray="3 3" />
      )}
      <text x={PL - 4} y={toY(minE)} fontSize={9} fill="var(--vl-text-3)" textAnchor="end" dominantBaseline="middle">{minE}</text>
      <text x={PL - 4} y={toY(maxE)} fontSize={9} fill="var(--vl-text-3)" textAnchor="end" dominantBaseline="middle">{maxE}</text>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={toX(d.date)} cy={toY(d.e1rm)} r={3} fill={color} />
      ))}
      <text x={toX(data[0].date)} y={H - 4} fontSize={9} fill="var(--vl-text-3)" textAnchor="middle">
        {data[0].date.slice(5)}
      </text>
      <text x={toX(data[data.length - 1].date)} y={H - 4} fontSize={9} fill="var(--vl-text-3)" textAnchor="middle">
        {data[data.length - 1].date.slice(5)}
      </text>
    </svg>
  )
}

export default function RenfoExerciseDetailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const { user } = useVLStore()

  const ex = RENFO_EXERCISES[exerciseId!]
  const color: string = RENFO_FOCUS_COLORS[ex?.category] ?? '#7c3aed'

  const { data: logs = [] } = useQuery<{ session_date: string; e1rm: number | null }[]>({
    queryKey: ['renfo-exercise-chart', exerciseId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('renfo_exercise_log')
        .select('session_date, e1rm')
        .eq('user_id', user!.id)
        .eq('exercise_id', exerciseId!)
        .gte('session_date', cutoff)
        .order('session_date', { ascending: true })
      return (data ?? []) as { session_date: string; e1rm: number | null }[]
    },
    enabled: !!user && !!exerciseId,
  })

  const chartData = useMemo<ChartPoint[]>(() => {
    const byDate: Record<string, number> = {}
    for (const l of logs) {
      if (!l.e1rm) continue
      if (!byDate[l.session_date] || l.e1rm > byDate[l.session_date])
        byDate[l.session_date] = l.e1rm
    }
    return Object.entries(byDate).map(([date, e1rm]) => ({ date, e1rm }))
  }, [logs])

  if (!ex) {
    return (
      <>
        <Link to="/renfo/library" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
          ← Bibliothèque
        </Link>
        <div className="mlabel">Exercice introuvable.</div>
      </>
    )
  }

  return (
    <>
      <Link to="/renfo/library" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
        ← Bibliothèque
      </Link>

      <div className="clabel" style={{ marginBottom: '0.25rem', color }}>{ex.name_fr}</div>
      {ex.name_tech && (
        <div className="mlabel" style={{ color: 'var(--vl-text-3)', marginBottom: '1.5rem', textTransform: 'none', letterSpacing: 0 }}>
          {ex.name_tech}
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl" style={{ marginBottom: 4 }}>Muscles principaux</div>
        <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {ex.primary_muscles?.join(', ')}
        </div>
      </div>

      {chartData.length >= 2 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="fl" style={{ marginBottom: '0.75rem' }}>Progression 1RM estimé — 90 jours</div>
          <E1rmChart data={chartData} color={color} />
        </div>
      )}
      {chartData.length === 1 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="fl">1RM estimé</div>
          <div className="sval" style={{ color }}>{chartData[0].e1rm} kg</div>
          <div className="slbl">{chartData[0].date}</div>
        </div>
      )}

      {ex.position && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="fl" style={{ marginBottom: 4 }}>Position de départ</div>
          <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, lineHeight: 1.6 }}>{ex.position}</div>
        </div>
      )}
      {ex.movement && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="fl" style={{ marginBottom: 4 }}>Exécution</div>
          <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, lineHeight: 1.6 }}>{ex.movement}</div>
        </div>
      )}
      {ex.common_errors && (
        <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--vl-amber)' }}>
          <div className="fl" style={{ marginBottom: 4, color: 'var(--vl-amber)' }}>Erreurs fréquentes</div>
          <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, lineHeight: 1.6 }}>{ex.common_errors}</div>
        </div>
      )}

      {ex.variants?.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="fl" style={{ marginBottom: '0.5rem' }}>Variantes disponibles</div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {ex.variants.map((v: any) => (
            <div key={v.id} style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--vl-border)', marginBottom: '0.75rem' }}>
              <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 2 }}>{v.name}</div>
              <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
                {v.default_sets}×{v.default_reps} · RPE {v.target_rpe} · repos {v.rest_seconds}s
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to={`/renfo/session/${ex.category}`} style={{ textDecoration: 'none' }}>
        <button className="btn-primary">LANCER UNE SÉANCE →</button>
      </Link>
    </>
  )
}
