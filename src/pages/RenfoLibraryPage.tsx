import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
// @ts-ignore
import { RENFO_EXERCISES as _RENFO_EXERCISES, SESSION_EXERCISES as _SESSION_EXERCISES, FOCUS_META as _FOCUS_META, RENFO_FOCUS_COLORS as _RENFO_FOCUS_COLORS } from '../../renfo-data.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RENFO_EXERCISES = _RENFO_EXERCISES as Record<string, any>
const SESSION_EXERCISES = _SESSION_EXERCISES as Record<string, string[]>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FOCUS_META = _FOCUS_META as Record<string, any>
const RENFO_FOCUS_COLORS = _RENFO_FOCUS_COLORS as Record<string, string>

const GROUP_ORDER = [
  'force_lourde', 'pliometrie', 'excentrique', 'tronc',
  'haut_corps', 'yoga_coureur', 'pilates_coureur', 'stretching',
]

export default function RenfoLibraryPage() {
  const { user } = useVLStore()

  const { data: maxLifts = [] } = useQuery<{ exercise_id: string; one_rm: number }[]>({
    queryKey: ['renfo-max-lifts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('renfo_max_lifts')
        .select('exercise_id, one_rm')
        .eq('user_id', user!.id)
      return (data ?? []) as { exercise_id: string; one_rm: number }[]
    },
    enabled: !!user,
  })

  const maxByExo: Record<string, number> = {}
  for (const l of maxLifts) maxByExo[l.exercise_id] = l.one_rm

  return (
    <>
      <Link to="/renfo" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
        ← Renfo
      </Link>
      <div className="clabel" style={{ marginBottom: '1.5rem' }}>BIBLIOTHÈQUE</div>

      {GROUP_ORDER.map((focusKey) => {
        const exoIds: string[] = SESSION_EXERCISES[focusKey] ?? []
        const meta = FOCUS_META[focusKey] ?? {}
        const color: string = RENFO_FOCUS_COLORS[focusKey] ?? '#7c3aed'
        return (
          <div key={focusKey} style={{ marginBottom: '1.5rem' }}>
            <div className="mlabel" style={{ color, marginBottom: '0.5rem', letterSpacing: '0.1em' }}>
              {meta.label ?? focusKey}
            </div>
            {exoIds.map((exoId) => {
              const ex = RENFO_EXERCISES[exoId]
              if (!ex) return null
              const e1rm = maxByExo[exoId]
              return (
                <Link key={exoId} to={`/renfo/library/${exoId}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{
                    borderLeft: `3px solid ${color}`,
                    marginBottom: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div className="fl">{ex.name_fr}</div>
                      <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
                        {ex.primary_muscles?.join(', ')}
                      </div>
                    </div>
                    {e1rm ? (
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                        <div className="sval" style={{ fontSize: '1rem' }}>{e1rm} kg</div>
                        <div className="slbl">1RM est.</div>
                      </div>
                    ) : (
                      <div className="mlabel" style={{ color: 'var(--vl-text-3)', flexShrink: 0 }}>→</div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
