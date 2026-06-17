import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'
import OneRMTestPopup from './OneRMTestPopup'

// Vue + saisie des 1RM (force) dans les Réglages. L'utilisateur peut entrer
// directement une charge connue (is_estimated = false) OU lancer le test guidé
// (estimation sous-maximale). Stocké dans renfo_max_lifts (partagé avec la séance).

const KEY_LIFTS: { id: string; label: string }[] = [
  { id: 'squat_lourd', label: 'Squat' },
  { id: 'deadlift', label: 'Soulevé de terre' },
  { id: 'hip_thrust', label: 'Hip thrust' },
  { id: 'rdl', label: 'Soulevé roumain' },
  { id: 'soleus_raise', label: 'Mollet (soléaire)' },
]

interface MaxLift { exercise_id: string; one_rm: number; is_estimated?: boolean }

export default function OneRMSettingsCard() {
  const user = useVLStore((s) => s.user)
  const qc = useQueryClient()
  const [testOpen, setTestOpen] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})

  const { data: lifts = [] } = useQuery<MaxLift[]>({
    queryKey: ['renfo-max-lifts'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('renfo_max_lifts').select('exercise_id,one_rm,is_estimated').eq('user_id', user!.id)
      return (data ?? []) as MaxLift[]
    },
  })
  const byId = Object.fromEntries(lifts.map((l) => [l.exercise_id, l]))

  const saveMut = useMutation({
    mutationFn: async ({ exercise_id, oneRm }: { exercise_id: string; oneRm: number }) => {
      const { error } = await supabase.from('renfo_max_lifts').upsert({
        user_id: user!.id, exercise_id, one_rm: oneRm,
        is_estimated: false, recorded_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      setEdits((e) => { const n = { ...e }; delete n[v.exercise_id]; return n })
      qc.invalidateQueries({ queryKey: ['renfo-max-lifts'] })
    },
  })

  function commit(id: string) {
    const raw = edits[id]
    if (raw == null) return
    const v = parseFloat(raw.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return
    if (v === byId[id]?.one_rm) return
    saveMut.mutate({ exercise_id: id, oneRm: Math.round(v * 2) / 2 })
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="clabel" style={{ marginBottom: 4 }}>MES 1RM · FORCE</div>
      <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Ta charge max sur 1 répétition par mouvement — elle sert à prescrire en force max
        (% de 1RM). Entre une valeur connue, ou lance le test guidé (sans risque).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {KEY_LIFTS.map((lift) => {
          const cur = byId[lift.id]
          const val = edits[lift.id] ?? (cur ? String(cur.one_rm) : '')
          return (
            <div key={lift.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--vl-text)' }}>{lift.label}</span>
              {cur?.is_estimated && (
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.05em' }}>estimé</span>
              )}
              <input
                type="number" inputMode="decimal" value={val}
                onChange={(e) => setEdits((s) => ({ ...s, [lift.id]: e.target.value }))}
                onBlur={() => commit(lift.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                placeholder="—"
                style={{ width: 90, padding: '6px 9px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontFamily: 'var(--vl-mono)', fontSize: 13, textAlign: 'right' }}
              />
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)', width: 18 }}>kg</span>
            </div>
          )
        })}
      </div>

      <button className="hbtn" onClick={() => setTestOpen(true)} style={{ marginTop: 14, fontSize: '.82rem' }}>
        🏋 Faire le test de force guidé
      </button>

      <OneRMTestPopup open={testOpen} onClose={() => setTestOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['renfo-max-lifts'] })} />
    </div>
  )
}
