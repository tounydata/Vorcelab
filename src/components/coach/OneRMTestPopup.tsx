import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'
import { estimate1RM, workingLoad, FORCE_MAX_SCHEME } from '../../lib/oneRepMax'

// Test de force 1RM GUIDÉ et SÛR : jamais un vrai 1RM brut. On guide l'athlète pas
// à pas — échauffement en rampe (avec minuteur de repos) puis UNE série test de 3-6
// reps propres — et on ESTIME le 1RM (Brzycki ≤6 / Epley ≥7). Sert à prescrire en
// % de 1RM. Enregistré dans renfo_max_lifts.

const KEY_LIFTS: { id: string; label: string }[] = [
  { id: 'squat_lourd', label: 'Squat' },
  { id: 'deadlift', label: 'Soulevé de terre' },
  { id: 'hip_thrust', label: 'Hip thrust' },
  { id: 'rdl', label: 'Soulevé roumain' },
  { id: 'soleus_raise', label: 'Mollet (soléaire)' },
]

// Échauffement en rampe (charges RELATIVES : le 1RM est encore inconnu).
const WARMUP: { label: string; sub: string; rest: number }[] = [
  { label: 'Barre à vide / léger', sub: '8-10 reps faciles', rest: 60 },
  { label: 'Charge modérée', sub: '5 reps', rest: 75 },
  { label: 'Charge lourde', sub: '2-3 reps (prépa nerveuse)', rest: 120 },
]

type Step = 'setup' | 'warmup' | 'test' | 'result'

function mmss(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export default function OneRMTestPopup({ open, onClose, onSaved }: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const { user } = useVLStore()
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('setup')
  const [exId, setExId] = useState(KEY_LIFTS[0].id)
  const [wuIdx, setWuIdx] = useState(0)
  const [rest, setRest] = useState<number | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('5')
  const [savedRm, setSavedRm] = useState<number | null>(null)
  const timer = useRef<number | null>(null)

  // Réinitialise à chaque ouverture.
  useEffect(() => {
    if (open) { setStep('setup'); setWuIdx(0); setRest(null); setWeight(''); setReps('5'); setSavedRm(null) }
  }, [open])

  // Minuteur de repos d'échauffement → auto-avance à la fin.
  useEffect(() => {
    if (rest == null) return
    if (rest <= 0) { setRest(null); advanceWarmup(); return }
    timer.current = window.setTimeout(() => setRest((r) => (r == null ? null : r - 1)), 1000)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [rest]) // eslint-disable-line react-hooks/exhaustive-deps

  function advanceWarmup() {
    if (wuIdx < WARMUP.length - 1) setWuIdx((i) => i + 1)
    else setStep('test')
  }

  const mut = useMutation({
    mutationFn: async ({ exercise_id, oneRm }: { exercise_id: string; oneRm: number }) => {
      const { error } = await supabase.from('renfo_max_lifts').upsert({
        user_id: user!.id, exercise_id, one_rm: oneRm,
        is_estimated: true, recorded_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      setSavedRm(v.oneRm)
      qc.invalidateQueries({ queryKey: ['renfo-max-lifts'] })
      onSaved?.()
    },
  })

  if (!open) return null

  const lift = KEY_LIFTS.find((l) => l.id === exId)!
  const w = parseFloat(weight.replace(',', '.'))
  const r = parseInt(reps, 10)
  const valid = Number.isFinite(w) && w > 0 && Number.isFinite(r) && r >= 1 && r <= 12
  const oneRm = valid ? estimate1RM(w, r) : null

  return (
    <div role="dialog" aria-modal="true" aria-label="Test de force guidé"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="card" style={{ maxWidth: 440, width: '100%', padding: '18px 20px', borderLeft: '4px solid var(--vl-ember)', maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontWeight: 700, fontSize: '1.15rem' }}>Test de force · {lift.label}</div>
          <button className="hbtn" onClick={onClose} style={{ fontSize: '.72rem', padding: '3px 8px' }}>Fermer</button>
        </div>

        {/* ── ÉTAPE 1 : choix du mouvement ── */}
        {step === 'setup' && (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.55, marginBottom: 12 }}>
              On <strong>ne teste jamais</strong> un 1RM brut (risque de blessure). Je te guide :
              échauffement en rampe, puis <strong>une série de 3-6 reps propres</strong> — on estime ton 1RM (±5 %).
            </div>
            <label style={{ fontSize: 12, color: 'var(--vl-text-2)' }}>
              Mouvement
              <select value={exId} onChange={(e) => setExId(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontSize: 13 }}>
                {KEY_LIFTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </label>
            <button className="hbtn" onClick={() => { setWuIdx(0); setStep('warmup') }}
              style={{ marginTop: 16, background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none', width: '100%' }}>
              Commencer l'échauffement →
            </button>
          </>
        )}

        {/* ── ÉTAPE 2 : échauffement guidé en rampe ── */}
        {step === 'warmup' && (
          <>
            <div className="mlabel" style={{ marginBottom: 8 }}>ÉCHAUFFEMENT · SÉRIE {wuIdx + 1}/{WARMUP.length}</div>
            <div style={{ padding: '14px 16px', borderRadius: 8, border: '1px solid var(--vl-line)', textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800 }}>{WARMUP[wuIdx].label}</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 13, color: 'var(--vl-text-2)', marginTop: 4 }}>{WARMUP[wuIdx].sub}</div>
            </div>

            {rest != null ? (
              <div style={{ textAlign: 'center' }}>
                <div className="mlabel" style={{ color: 'var(--vl-text-3)', marginBottom: 4 }}>REPOS</div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2.4rem', fontWeight: 800, color: 'var(--vl-ember)' }}>{mmss(rest)}</div>
                <button className="hbtn" onClick={() => { setRest(null); advanceWarmup() }} style={{ marginTop: 8, fontSize: '.82rem' }}>Passer le repos →</button>
              </div>
            ) : (
              <button className="hbtn" onClick={() => setRest(WARMUP[wuIdx].rest)}
                style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none', width: '100%' }}>
                Série faite · démarrer le repos ({WARMUP[wuIdx].rest}s)
              </button>
            )}
            <button className="hbtn" onClick={() => { setRest(null); setStep('test') }} style={{ marginTop: 10, fontSize: '.8rem', width: '100%' }}>
              Passer à la série test →
            </button>
          </>
        )}

        {/* ── ÉTAPE 3 : série test ── */}
        {step === 'test' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.55, marginBottom: 12 }}>
              <strong>Série test</strong> : prends une charge <strong>difficile mais propre</strong> et fais
              <strong> 3 à 6 reps à fond</strong>. <span style={{ color: 'var(--vl-ember)' }}>Arrête-toi si la technique casse</span> ou en cas de douleur.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--vl-text-2)', flex: 1 }}>
                Charge (kg)
                <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="ex. 80" autoFocus
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontFamily: 'var(--vl-mono)', fontSize: 14 }} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--vl-text-2)', width: 110 }}>
                Reps faites
                <input type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontFamily: 'var(--vl-mono)', fontSize: 14 }} />
              </label>
            </div>
            <button className="hbtn" disabled={!valid} onClick={() => setStep('result')}
              style={{ marginTop: 16, width: '100%', background: valid ? 'var(--vl-ember)' : 'var(--vl-surf-2)', color: valid ? 'var(--vl-ink)' : 'var(--vl-text-3)', border: 'none' }}>
              Voir mon 1RM →
            </button>
          </>
        )}

        {/* ── ÉTAPE 4 : résultat ── */}
        {step === 'result' && oneRm != null && (
          <>
            <div style={{ textAlign: 'center', padding: '6px 0 12px' }}>
              <div className="mlabel" style={{ color: 'var(--vl-text-3)' }}>1RM estimé · {lift.label}</div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2.4rem', fontWeight: 800, color: 'var(--vl-ember)' }}>{oneRm} kg</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 6, border: '1px solid var(--vl-line)' }}>
              <div className="mlabel" style={{ marginBottom: 2 }}>TES CHARGES DE TRAVAIL</div>
              {FORCE_MAX_SCHEME.map((s) => (
                <div key={s.label} style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-2)' }}>
                  {s.label} · {s.sets}×{s.reps} @ <strong>{workingLoad(oneRm, s.pct)} kg</strong> <span style={{ color: 'var(--vl-text-3)' }}>({Math.round(s.pct * 100)} %)</span>
                </div>
              ))}
            </div>
            {savedRm === oneRm ? (
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--vl-growth)' }}>✓ Enregistré. Tes séances de force lourde s'en serviront.</div>
            ) : (
              <button className="hbtn" disabled={mut.isPending} onClick={() => mut.mutate({ exercise_id: exId, oneRm })}
                style={{ marginTop: 14, width: '100%', background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none', opacity: mut.isPending ? 0.6 : 1 }}>
                {mut.isPending ? 'Enregistrement…' : 'Enregistrer ce 1RM'}
              </button>
            )}
            <button className="hbtn" onClick={() => { setStep('setup'); setSavedRm(null) }} style={{ marginTop: 10, fontSize: '.82rem', width: '100%' }}>
              Tester un autre mouvement
            </button>
          </>
        )}
      </div>
    </div>
  )
}
