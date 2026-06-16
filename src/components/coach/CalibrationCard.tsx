import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'
import { vmaFromHalfCooperM, CS_TO_VMA } from '../../lib/criticalSpeed'

// Carte de calibrage VMA (test demi-Cooper) — endroit PERMANENT (Profil › LABO) où
// l'athlète peut faire/refaire le test quand il veut. Le pop-up de la page Coach ne
// le propose qu'une fois par objectif ; ici il reste accessible à tout moment.

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CalibrationCard() {
  const user = useVLStore((s) => s.user)
  const qc = useQueryClient()
  const [dist, setDist] = useState('')

  const { data: demi } = useQuery({
    queryKey: ['profile-demi-cooper', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('demi_cooper').eq('id', user!.id).maybeSingle()
      return (data?.demi_cooper ?? null) as { distanceM?: number | null; dateISO?: string | null } | null
    },
  })

  const mut = useMutation({
    mutationFn: async (distanceM: number) => {
      const { error } = await supabase.from('profiles')
        .update({ demi_cooper: { distanceM, dateISO: new Date().toISOString().slice(0, 10) } })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      setDist('')
      qc.invalidateQueries({ queryKey: ['profile-demi-cooper', user?.id] })
      qc.invalidateQueries({ queryKey: ['profile-sessions'] })
      qc.invalidateQueries({ queryKey: ['profile-full', user?.id] })
    },
  })

  const m = parseInt(dist, 10)
  const valid = Number.isFinite(m) && m >= 800 && m <= 3000
  const vmaKmh = valid ? +(vmaFromHalfCooperM(m) * 3.6).toFixed(1) : null
  const csKmh = vmaKmh != null ? +(vmaKmh * CS_TO_VMA).toFixed(1) : null
  const savedM = demi?.distanceM ?? null

  return (
    <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid var(--vl-status-peak)' }}>
      <div className="clabel" style={{ marginBottom: 6 }}>TEST VMA · DEMI-COOPER</div>
      <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.5, marginBottom: 10 }}>
        6 min à fond après échauffement, puis entre la distance couverte. Ça cale ta VMA / vitesse seuil
        et fiabilise toutes tes allures. À refaire quand ta forme évolue.
      </div>
      {savedM ? (
        <div className="mono" style={{ fontSize: 11.5, color: 'var(--vl-growth)', marginBottom: 10 }}>
          Dernier test : <strong>{savedM} m</strong>{demi?.dateISO ? ` · ${fmtDate(demi.dateISO)}` : ''} — ≈ VMA {(vmaFromHalfCooperM(savedM) * 3.6).toFixed(1)} km/h
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="number" inputMode="numeric" value={dist} onChange={(e) => setDist(e.target.value)}
          placeholder="Distance en 6 min (m)"
          style={{ width: 170, padding: '7px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontFamily: 'var(--vl-mono)', fontSize: 13 }}
        />
        <button className="hbtn" disabled={!valid || mut.isPending} onClick={() => valid && mut.mutate(m)}
          style={{ background: valid ? 'var(--vl-ember)' : 'var(--vl-surf-2)', color: valid ? 'var(--vl-ink)' : 'var(--vl-text-3)', border: 'none', opacity: mut.isPending ? 0.6 : 1 }}>
          {mut.isPending ? 'Enregistrement…' : savedM ? 'Mettre à jour' : 'Enregistrer le test'}
        </button>
      </div>
      {csKmh != null && (
        <div className="mono" style={{ fontSize: 11.5, color: 'var(--vl-text-3)', marginTop: 8 }}>
          ≈ VMA {vmaKmh} km/h · CS (allure ~60 min) {csKmh} km/h
        </div>
      )}
    </div>
  )
}
