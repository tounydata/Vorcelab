import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NutritionIntakePlan } from '../../../lib/nutritionPlan'
import { buildPrepChecklist, type ChecklistItem } from '../../../lib/racePrepChecklist'

interface Props {
  plan: NutritionIntakePlan
  estTimeS: number
  /** Identifiant de course : isole les cases cochées d'une course à l'autre. */
  storageId?: string | null
}

const STORAGE_PREFIX = 'vl.prepChecklist.'

function loadChecked(storageId: string | null | undefined): Record<string, boolean> {
  if (!storageId) return {}
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageId)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    // Mode privé / quota / JSON corrompu : la checklist reste utilisable, non persistée.
    return {}
  }
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 20, height: 20, flex: '0 0 auto', borderRadius: 6,
        border: '1.5px solid ' + (on ? 'var(--vl-growth-2)' : 'var(--vl-line-2, var(--vl-line))'),
        background: on ? 'color-mix(in srgb, var(--vl-growth-2) 20%, transparent)' : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
      }}
    >
      {on && (
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--vl-growth-2)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5 L10 18 L20 5" />
        </svg>
      )}
    </span>
  )
}

export default function PrepChecklist({ plan, estTimeS, storageId }: Props) {
  const list = useMemo(() => buildPrepChecklist(plan, estTimeS), [plan, estTimeS])
  const [checked, setChecked] = useState<Record<string, boolean>>(() => loadChecked(storageId))

  // Changement de course → on repart des cases de CETTE course.
  useEffect(() => { setChecked(loadChecked(storageId)) }, [storageId])

  const persist = useCallback((next: Record<string, boolean>) => {
    if (!storageId) return
    try { localStorage.setItem(STORAGE_PREFIX + storageId, JSON.stringify(next)) } catch { /* stockage indisponible */ }
  }, [storageId])

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      persist(next)
      return next
    })
  }
  const reset = () => { setChecked({}); persist({}) }

  if (list.empty) return null

  const doneCount = list.items.filter((i) => checked[i.id]).length
  const total = list.items.length
  const pct = Math.round((doneCount / total) * 100)
  const allDone = doneCount === total

  const fuel = list.items.filter((i) => i.group === 'fuel')
  const hydration = list.items.filter((i) => i.group === 'hydration')

  const Row = ({ it }: { it: ChecklistItem }) => {
    const on = !!checked[it.id]
    return (
      <div
        role="checkbox"
        aria-checked={on}
        tabIndex={0}
        onClick={() => toggle(it.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(it.id) } }}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 4px',
          borderBottom: '1px solid var(--vl-line)', cursor: 'pointer', userSelect: 'none',
          opacity: on ? 0.55 : 1, transition: 'opacity .15s',
        }}
      >
        <span style={{ paddingTop: 1 }}><CheckBox on={on} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="display tnum" style={{ fontSize: 19, color: it.spare ? 'var(--vl-amber)' : 'var(--vl-ember)', lineHeight: 1 }}>×{it.qty}</span>
            <span style={{ fontSize: 13.5, color: 'var(--vl-text)', fontWeight: 600, textDecoration: on ? 'line-through' : 'none' }}>{it.label}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--vl-text-3)', letterSpacing: '.06em' }}>{it.unit.toUpperCase()}</span>
            {it.spare && <span className="mono" style={{ fontSize: 9.5, color: 'var(--vl-amber)', letterSpacing: '.08em' }}>SÉCURITÉ</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--vl-text-2)', marginTop: 3, lineHeight: 1.45 }}>{it.detail}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--vl-text-3)', fontWeight: 500 }}>À PRÉPARER LA VEILLE</div>
          <div className="display" style={{ fontSize: 24, color: 'var(--vl-text)', marginTop: 6, lineHeight: 1.1 }}>
            Checklist gels &amp; ravitaillement
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', marginTop: 5 }}>
            Ce que ton plan nutrition implique de mettre dans le sac — {list.totalCarbs} g de glucides embarqués.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="display tnum" style={{ fontSize: 30, color: allDone ? 'var(--vl-growth-2)' : 'var(--vl-text)', lineHeight: 1 }}>
            {doneCount}<span style={{ color: 'var(--vl-text-3)', fontSize: 20 }}>/{total}</span>
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--vl-text-3)', marginTop: 4, letterSpacing: '.1em' }}>PRÊT</div>
          {doneCount > 0 && (
            <button
              onClick={reset}
              className="no-print"
              style={{ marginTop: 8, background: 'none', border: '1px solid var(--vl-line)', borderRadius: 999, padding: '4px 10px', color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)', fontSize: 10, cursor: 'pointer' }}
            >
              TOUT DÉCOCHER
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 6, borderRadius: 999, background: 'var(--vl-surf-3, var(--vl-surf-2))', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: allDone ? 'var(--vl-growth-2)' : 'var(--vl-ember)', transition: 'width .25s' }} />
      </div>

      {fuel.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--vl-text-3)', marginBottom: 2 }}>NUTRITION</div>
          {fuel.map((it) => <Row key={it.id} it={it} />)}
        </div>
      )}

      {hydration.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--vl-text-3)', marginBottom: 2 }}>HYDRATATION</div>
          {hydration.map((it) => <Row key={it.id} it={it} />)}
        </div>
      )}

      {list.notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
          {list.notes.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.45 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--vl-text-3)', flex: 'none', alignSelf: 'center' }} />
              <span>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
