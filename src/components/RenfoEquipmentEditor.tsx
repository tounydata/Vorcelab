import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'

// Éditeur du profil renfo (matériel maison/salle, intensité, cadence) — intégré dans
// l'onglet Paramètres. Détermine les variantes proposées selon le lieu choisi en séance.

interface Equipment {
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

interface RenfoProfile {
  objective_weight: number
  sessions_per_week: number
  has_gym_access?: boolean
  equipment?: Equipment
  equipment_home: Equipment
  equipment_gym: Equipment
}

// Salle complète par défaut : l'utilisateur décoche ce que sa salle n'a pas.
const FULL_GYM: Equipment = {
  barbell: true, bench: true, pullup_bar: true, step: true,
  anchor_point: true, leg_press: true, dumbbells_max_kg: 40, kettlebell_max_kg: 32,
}

const DEFAULT_PROFILE: RenfoProfile = {
  objective_weight: 50,
  sessions_per_week: 3,
  equipment_home: {},
  equipment_gym: { ...FULL_GYM },
}

const EQUIP_KEYS: { key: keyof Equipment; label: string }[] = [
  { key: 'barbell', label: 'Barre + disques' },
  { key: 'bench', label: 'Banc de musculation' },
  { key: 'pullup_bar', label: 'Barre de traction' },
  { key: 'step', label: 'Marche / Step' },
  { key: 'anchor_point', label: "Point d'ancrage (TRX, bandes)" },
  { key: 'leg_press', label: 'Presse à cuisses' },
]

export default function RenfoEquipmentEditor() {
  const { user } = useVLStore()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<RenfoProfile>(DEFAULT_PROFILE)

  const { data: profile } = useQuery<RenfoProfile | null>({
    queryKey: ['renfo-profile'],
    queryFn: async () => {
      const { data } = await supabase.from('renfo_profile').select('*').eq('user_id', user!.id).maybeSingle()
      return data as RenfoProfile | null
    },
    enabled: !!user,
  })

  useEffect(() => {
    if (!profile) return
    const home = profile.equipment_home ?? profile.equipment ?? {}
    const gym = profile.equipment_gym ?? { ...FULL_GYM }
    setForm({ ...DEFAULT_PROFILE, ...profile, equipment_home: home, equipment_gym: gym })
  }, [profile])

  const mutation = useMutation({
    mutationFn: async (p: RenfoProfile) => {
      const { error } = await supabase.from('renfo_profile').upsert({
        user_id: user!.id,
        objective_weight: p.objective_weight,
        sessions_per_week: p.sessions_per_week,
        equipment_home: p.equipment_home,
        equipment_gym: p.equipment_gym,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renfo-profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  function toggleEq(set: 'equipment_home' | 'equipment_gym', field: keyof Equipment, val: boolean) {
    setForm((f) => ({ ...f, [set]: { ...f[set], [field]: val } }))
  }
  function setEqNum(set: 'equipment_home' | 'equipment_gym', field: keyof Equipment, val: number) {
    setForm((f) => ({ ...f, [set]: { ...f[set], [field]: val } }))
  }

  function equipmentBlock(setKey: 'equipment_home' | 'equipment_gym', title: string, subtitle: string) {
    const eq = form[setKey]
    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl" style={{ marginBottom: 4 }}>{title}</div>
        <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0, marginBottom: '0.75rem' }}>{subtitle}</div>
        {EQUIP_KEYS.map(({ key, label }) => (
          <label key={key} className="fg" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!(eq as Record<string, unknown>)[key]} onChange={(e) => toggleEq(setKey, key, e.target.checked)} />
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</span>
          </label>
        ))}
        <div style={{ marginTop: '0.75rem' }}>
          <div className="fl">Haltères (poids max disponible)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={0} max={50} step={2} value={eq.dumbbells_max_kg ?? 0}
              onChange={(e) => setEqNum(setKey, 'dumbbells_max_kg', +e.target.value)} style={{ flex: 1 }} />
            <span className="mlabel">{eq.dumbbells_max_kg ?? 0} kg</span>
          </div>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <div className="fl">Kettlebell (poids max)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={0} max={40} step={2} value={eq.kettlebell_max_kg ?? 0}
              onChange={(e) => setEqNum(setKey, 'kettlebell_max_kg', +e.target.value)} style={{ flex: 1 }} />
            <span className="mlabel">{eq.kettlebell_max_kg ?? 0} kg</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Intensité renfo */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl" style={{ marginBottom: '0.5rem' }}>Intensité du renfo</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ v: 25, l: 'Prévention' }, { v: 50, l: 'Équilibré' }, { v: 75, l: 'Performance' }].map(({ v, l }) => (
            <button key={v} className="hbtn"
              style={form.objective_weight === v ? { background: 'var(--vl-ember)', borderColor: 'var(--vl-ember)', color: 'var(--vl-ink)' } : {}}
              onClick={() => setForm((f) => ({ ...f, objective_weight: v }))}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Matériel par lieu — détermine les variantes proposées selon le lieu choisi en séance */}
      {equipmentBlock('equipment_home', 'Mon matériel — Maison', 'Ce que tu as chez toi. Sélectionné quand tu lances une séance « Maison ».')}
      {equipmentBlock('equipment_gym', 'Mon matériel — Salle', 'Ce que ta salle propose (pré-rempli salle complète — décoche ce qui manque).')}

      <button className="btn-primary" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
        {mutation.isPending ? 'Sauvegarde…' : 'ENREGISTRER LE MATÉRIEL'}
      </button>
      {saved && <div className="mlabel" style={{ color: 'var(--vl-growth)', marginTop: 6 }}>Matériel sauvegardé</div>}
    </>
  )
}
