import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'

interface RenfoProfile {
  objective_weight: number
  sessions_per_week: number
  has_gym_access: boolean
  location_pref: string
  equipment: {
    barbell?: boolean
    leg_press?: boolean
    bench?: boolean
    pullup_bar?: boolean
    step?: boolean
    anchor_point?: boolean
    bands?: string[]
    dumbbells_max_kg?: number
    kettlebell_max_kg?: number
  }
}

const DEFAULT_PROFILE: RenfoProfile = {
  objective_weight: 50,
  sessions_per_week: 3,
  has_gym_access: false,
  location_pref: 'maison',
  equipment: {},
}

export default function RenfoSettingsPage() {
  const { user } = useVLStore()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<RenfoProfile>(DEFAULT_PROFILE)

  const { data: profile, isLoading } = useQuery<RenfoProfile | null>({
    queryKey: ['renfo-profile'],
    queryFn: async () => {
      const { data } = await supabase
        .from('renfo_profile')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle()
      return data as RenfoProfile | null
    },
    enabled: !!user,
  })

  useEffect(() => {
    if (profile) setForm({ ...DEFAULT_PROFILE, ...profile })
  }, [profile])

  const mutation = useMutation({
    mutationFn: async (p: RenfoProfile) => {
      const { error } = await supabase
        .from('renfo_profile')
        .upsert({ user_id: user!.id, ...p, onboarding_done: true, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renfo-profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  function toggle(field: keyof RenfoProfile['equipment'], val: boolean) {
    setForm((f) => ({ ...f, equipment: { ...f.equipment, [field]: val } }))
  }

  if (isLoading) return <div className="loading"><div className="spinner" /></div>

  return (
    <>
      <Link to="/renfo" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
        ← Renfo
      </Link>
      <div className="clabel" style={{ marginBottom: '1.5rem' }}>RÉGLAGES RENFO</div>

      {/* Objectif */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl">Objectif</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: 25, l: 'Prévention' },
            { v: 50, l: 'Équilibré' },
            { v: 75, l: 'Performance' },
          ].map(({ v, l }) => (
            <button key={v} className={`hbtn${form.objective_weight === v ? ' strava' : ''}`}
              style={form.objective_weight === v ? { background: 'var(--vl-ember)', borderColor: 'var(--vl-ember)', color: 'var(--vl-ink)' } : {}}
              onClick={() => setForm((f) => ({ ...f, objective_weight: v }))}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Localisation */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl">Où t'entraînes-tu ?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['maison', 'salle'].map((loc) => (
            <button key={loc} className="hbtn"
              style={form.location_pref === loc ? { background: 'var(--vl-ember)', borderColor: 'var(--vl-ember)', color: 'var(--vl-ink)' } : {}}
              onClick={() => setForm((f) => ({ ...f, location_pref: loc, has_gym_access: loc === 'salle' }))}>
              {loc === 'maison' ? 'Maison' : 'Salle'}
            </button>
          ))}
        </div>
      </div>

      {/* Équipement */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl" style={{ marginBottom: '0.75rem' }}>Équipement disponible</div>
        {[
          { key: 'barbell', label: 'Barre + disques' },
          { key: 'bench', label: 'Banc de musculation' },
          { key: 'pullup_bar', label: 'Barre de traction' },
          { key: 'step', label: 'Marche / Step' },
          { key: 'anchor_point', label: "Point d'ancrage (TRX, bandes)" },
          { key: 'leg_press', label: 'Presse à cuisses' },
        ].map(({ key, label }) => (
          <label key={key} className="fg" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!(form.equipment as Record<string, unknown>)[key]}
              onChange={(e) => toggle(key as keyof RenfoProfile['equipment'], e.target.checked)}
            />
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</span>
          </label>
        ))}

        <div style={{ marginTop: '0.75rem' }}>
          <div className="fl">Haltères (poids max disponible)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={0} max={50} step={2}
              value={form.equipment.dumbbells_max_kg ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, equipment: { ...f.equipment, dumbbells_max_kg: +e.target.value } }))}
              style={{ flex: 1 }}
            />
            <span className="mlabel">{form.equipment.dumbbells_max_kg ?? 0} kg</span>
          </div>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <div className="fl">Kettlebell (poids max)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={0} max={40} step={2}
              value={form.equipment.kettlebell_max_kg ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, equipment: { ...f.equipment, kettlebell_max_kg: +e.target.value } }))}
              style={{ flex: 1 }}
            />
            <span className="mlabel">{form.equipment.kettlebell_max_kg ?? 0} kg</span>
          </div>
        </div>
      </div>

      <button
        className="btn-primary"
        style={{ marginBottom: '0.5rem' }}
        onClick={() => mutation.mutate(form)}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Sauvegarde…' : 'ENREGISTRER'}
      </button>
      {saved && <div className="mlabel" style={{ color: 'var(--vl-growth)', marginTop: 6 }}>Profil sauvegardé</div>}
    </>
  )
}
