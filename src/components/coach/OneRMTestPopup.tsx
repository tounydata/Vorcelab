import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'
import { estimate1RM, workingLoad, ONE_RM_WARMUP, FORCE_MAX_SCHEME } from '../../lib/oneRepMax'

// Test de force (1RM) SÛR : jamais un vrai 1RM brut (risque de blessure) — on fait
// une série sous-maximale (3-6 reps propres) après échauffement en rampe, et on
// ESTIME le 1RM (Brzycki ≤6 / Epley ≥7). Sert à prescrire en % de 1RM (force max,
// pas hypertrophie). Enregistré dans renfo_max_lifts (mêmes données que le logging).

// Gros mouvements chargés pertinents pour un coureur.
const KEY_LIFTS: { id: string; label: string }[] = [
  { id: 'squat_lourd', label: 'Squat' },
  { id: 'deadlift', label: 'Soulevé de terre' },
  { id: 'hip_thrust', label: 'Hip thrust' },
  { id: 'rdl', label: 'Soulevé roumain' },
  { id: 'soleus_raise', label: 'Mollet (soléaire)' },
]

export default function OneRMTestPopup({ open, onClose, onSaved }: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const { user } = useVLStore()
  const qc = useQueryClient()
  const [exId, setExId] = useState(KEY_LIFTS[0].id)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('5')
  const [savedFor, setSavedFor] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: async ({ exercise_id, oneRm }: { exercise_id: string; oneRm: number }) => {
      const { error } = await supabase.from('renfo_max_lifts').upsert({
        user_id: user!.id, exercise_id, one_rm: oneRm,
        is_estimated: true, recorded_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      setSavedFor(v.exercise_id)
      setWeight('')
      qc.invalidateQueries({ queryKey: ['renfo-max-lifts'] })
      onSaved?.()
    },
  })

  if (!open) return null

  const w = parseFloat(weight.replace(',', '.'))
  const r = parseInt(reps, 10)
  const valid = Number.isFinite(w) && w > 0 && Number.isFinite(r) && r >= 1 && r <= 12
  const oneRm = valid ? estimate1RM(w, r) : null
  const lift = KEY_LIFTS.find((l) => l.id === exId)!

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Test de force 1RM"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="card" style={{ maxWidth: 440, width: '100%', padding: '18px 20px', borderLeft: '4px solid var(--vl-ember)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--vl-display)', fontWeight: 700, fontSize: '1.15rem', marginBottom: 6 }}>Calibrer ta force — test 1RM</div>
        <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.55, marginBottom: 12 }}>
          On ne teste <strong>jamais</strong> un vrai 1RM brut (risque de blessure). Échauffe-toi en rampe,
          puis fais une <strong>série de 3-6 reps propres</strong> sur un gros mouvement : on estime ton 1RM
          (±5 %). Ça permet de prescrire en <strong>force max</strong> (lourd, peu de reps) plutôt qu'en
          hypertrophie. Re-test toutes les 6-12 semaines.
        </div>

        {/* Échauffement en rampe */}
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
          <div className="mlabel" style={{ marginBottom: 4 }}>Échauffement (avant le test)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)' }}>
            {ONE_RM_WARMUP.map((s, i) => <span key={i}>{s.pctLabel} · {s.reps}</span>)}
          </div>
        </div>

        {/* Saisie */}
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--vl-text-2)' }}>
            Mouvement
            <select value={exId} onChange={(e) => { setExId(e.target.value); setSavedFor(null) }}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontSize: 13 }}>
              {KEY_LIFTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--vl-text-2)', flex: 1 }}>
              Charge (kg)
              <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="ex. 80"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontFamily: 'var(--vl-mono)', fontSize: 13 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--vl-text-2)', width: 110 }}>
              Reps (3-6)
              <input type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontFamily: 'var(--vl-mono)', fontSize: 13 }} />
            </label>
          </div>
        </div>

        {/* Estimation + charges de travail */}
        {oneRm != null && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, border: '1px solid var(--vl-line)' }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)' }}>1RM estimé</div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-ember)' }}>{oneRm} kg</div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {FORCE_MAX_SCHEME.map((s) => (
                <div key={s.label} style={{ fontFamily: 'var(--vl-mono)', fontSize: 11.5, color: 'var(--vl-text-2)' }}>
                  {s.label} · {s.sets}×{s.reps} @ <strong>{workingLoad(oneRm, s.pct)} kg</strong> <span style={{ color: 'var(--vl-text-3)' }}>({Math.round(s.pct * 100)} %)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {savedFor === exId && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--vl-growth)' }}>✓ {lift.label} enregistré.</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="hbtn" onClick={onClose} style={{ fontSize: '.82rem' }}>Plus tard</button>
          <button className="hbtn" disabled={!valid || mut.isPending} onClick={() => valid && oneRm != null && mut.mutate({ exercise_id: exId, oneRm })}
            style={{ background: valid ? 'var(--vl-ember)' : 'var(--vl-surf-2)', color: valid ? 'var(--vl-ink)' : 'var(--vl-text-3)', border: 'none', opacity: mut.isPending ? 0.6 : 1 }}>
            {mut.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
