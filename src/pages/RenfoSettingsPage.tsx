import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'

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
  /** Ancien jeu unique (lecture seule, rétro-compat). */
  equipment?: Equipment
  /** Matériel disponible à la maison. */
  equipment_home: Equipment
  /** Matériel disponible à la salle. */
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

export default function RenfoSettingsPage() {
  const { user } = useVLStore()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<RenfoProfile>(DEFAULT_PROFILE)
  const [weeklyTarget, setWeeklyTarget] = useState(3)
  const [targetSaved, setTargetSaved] = useState(false)
  const [coachDays, setCoachDays] = useState(5)
  const [coachDaysSaved, setCoachDaysSaved] = useState(false)

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

  const { data: profileTarget } = useQuery<{ renfo_weekly_target?: number; coach_days_per_week?: number } | null>({
    queryKey: ['profile-renfo-target', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('renfo_weekly_target,coach_days_per_week')
        .eq('id', user!.id)
        .single()
      return data as { renfo_weekly_target?: number; coach_days_per_week?: number } | null
    },
    enabled: !!user,
  })

  useEffect(() => {
    if (profileTarget?.renfo_weekly_target != null) {
      setWeeklyTarget(profileTarget.renfo_weekly_target)
    }
    if (profileTarget?.coach_days_per_week != null) {
      setCoachDays(profileTarget.coach_days_per_week)
    }
  }, [profileTarget])

  useEffect(() => {
    if (!profile) return
    // Rétro-compat : si pas encore de jeux maison/salle, l'ancien `equipment` devient le maison.
    const home = profile.equipment_home ?? profile.equipment ?? {}
    const gym = profile.equipment_gym ?? { ...FULL_GYM }
    setForm({ ...DEFAULT_PROFILE, ...profile, equipment_home: home, equipment_gym: gym })
  }, [profile])

  const mutation = useMutation({
    mutationFn: async (p: RenfoProfile) => {
      // On n'écrit QUE des colonnes réelles (avant : location_pref / onboarding_done
      // inexistantes faisaient échouer la sauvegarde en silence).
      const { error } = await supabase
        .from('renfo_profile')
        .upsert({
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
            <input
              type="checkbox"
              checked={!!(eq as Record<string, unknown>)[key]}
              onChange={(e) => toggleEq(setKey, key, e.target.checked)}
            />
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</span>
          </label>
        ))}
        <div style={{ marginTop: '0.75rem' }}>
          <div className="fl">Haltères (poids max disponible)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={0} max={50} step={2}
              value={eq.dumbbells_max_kg ?? 0}
              onChange={(e) => setEqNum(setKey, 'dumbbells_max_kg', +e.target.value)}
              style={{ flex: 1 }}
            />
            <span className="mlabel">{eq.dumbbells_max_kg ?? 0} kg</span>
          </div>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <div className="fl">Kettlebell (poids max)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={0} max={40} step={2}
              value={eq.kettlebell_max_kg ?? 0}
              onChange={(e) => setEqNum(setKey, 'kettlebell_max_kg', +e.target.value)}
              style={{ flex: 1 }}
            />
            <span className="mlabel">{eq.kettlebell_max_kg ?? 0} kg</span>
          </div>
        </div>
      </div>
    )
  }

  async function saveWeeklyTarget(val: number) {
    setWeeklyTarget(val)
    await supabase.from('profiles').update({ renfo_weekly_target: val }).eq('id', user!.id)
    queryClient.invalidateQueries({ queryKey: ['profile-renfo-target'] })
    queryClient.invalidateQueries({ queryKey: ['profile-fcmax-dash'] })
    setTargetSaved(true)
    setTimeout(() => setTargetSaved(false), 2000)
  }

  async function saveCoachDays(val: number) {
    setCoachDays(val)
    await supabase.from('profiles').update({ coach_days_per_week: val }).eq('id', user!.id)
    queryClient.invalidateQueries({ queryKey: ['profile-renfo-target'] })
    queryClient.invalidateQueries({ queryKey: ['profile-coach-days'] })
    setCoachDaysSaved(true)
    setTimeout(() => setCoachDaysSaved(false), 2000)
  }

  if (isLoading) return <div className="loading"><div className="spinner" /></div>

  return (
    <>
      <Link to="/renfo" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
        ← Renfo
      </Link>
      <div className="clabel" style={{ marginBottom: '1.5rem' }}>RÉGLAGES</div>

      {/* ── COURSE ── */}
      <div className="mlabel" style={{ color: 'var(--vl-ember)', marginBottom: '0.6rem', letterSpacing: '.12em' }}>COURSE</div>

      {/* Jours de course / semaine (stocké dans profiles, consommé par le Coach) */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl" style={{ marginBottom: '0.5rem' }}>Jours de course / semaine</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[3, 4, 5, 6].map((n) => (
            <button key={n}
              className="hbtn"
              style={coachDays === n
                ? { background: 'var(--vl-ember)', borderColor: 'var(--vl-ember)', color: 'var(--vl-ink)', minWidth: 36 }
                : { minWidth: 36 }}
              onClick={() => saveCoachDays(n)}>
              {n}
            </button>
          ))}
        </div>
        <div className="mlabel" style={{ marginTop: 6, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          {coachDays} jour{coachDays > 1 ? 's' : ''} de course/semaine · structure le plan du Coach
        </div>
        {coachDaysSaved && <div className="mlabel" style={{ color: 'var(--vl-growth)', marginTop: 4 }}>Sauvegardé</div>}
      </div>

      {/* ── RENFO ── */}
      <div className="mlabel" style={{ color: '#a78bfa', margin: '1.25rem 0 0.6rem', letterSpacing: '.12em' }}>RENFO</div>

      {/* Objectif hebdomadaire (stocké dans profiles) */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl" style={{ marginBottom: '0.5rem' }}>Objectif séances / semaine</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[2, 3, 4, 5, 6].map((n) => (
            <button key={n}
              className="hbtn"
              style={weeklyTarget === n
                ? { background: 'var(--vl-ember)', borderColor: 'var(--vl-ember)', color: 'var(--vl-ink)', minWidth: 36 }
                : { minWidth: 36 }}
              onClick={() => saveWeeklyTarget(n)}>
              {n}
            </button>
          ))}
        </div>
        <div className="mlabel" style={{ marginTop: 6, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Objectif : {weeklyTarget} séance{weeklyTarget > 1 ? 's' : ''}/semaine · affiché sur le dashboard
        </div>
        {targetSaved && <div className="mlabel" style={{ color: 'var(--vl-growth)', marginTop: 4 }}>Sauvegardé</div>}
      </div>

      {/* Séances par semaine */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="fl" style={{ marginBottom: '0.5rem' }}>Séances par semaine</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n}
              className="hbtn"
              style={form.sessions_per_week === n
                ? { background: 'var(--vl-ember)', borderColor: 'var(--vl-ember)', color: 'var(--vl-ink)', minWidth: 36 }
                : { minWidth: 36 }}
              onClick={() => setForm((f) => ({ ...f, sessions_per_week: n }))}>
              {n}
            </button>
          ))}
        </div>
        <div className="mlabel" style={{ marginTop: 6, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Actuellement : {form.sessions_per_week} séance{form.sessions_per_week > 1 ? 's' : ''}/semaine
        </div>
      </div>

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

      {/* Matériel par lieu — détermine les variantes proposées selon le lieu choisi en séance */}
      {equipmentBlock('equipment_home', 'Mon matériel — Maison', 'Ce que tu as chez toi. Sélectionné quand tu lances une séance « Maison ».')}
      {equipmentBlock('equipment_gym', 'Mon matériel — Salle', 'Ce que ta salle propose (pré-rempli salle complète — décoche ce qui manque).')}

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
