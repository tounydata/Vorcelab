import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Card, FL, CLabel, MLabel, HButton, PrimaryButton, BackLink, colors, radius, space } from '@/components/coach/ui'

// Éditeur du profil renfo (matériel maison/salle, intensité) — porté à l'identique
// de `src/components/RenfoEquipmentEditor.tsx`. Détermine les variantes proposées
// selon le lieu choisi en séance (cf. app/renfo/session/[focusKey]).
// Limite physique native : les <input type="range"> du web → steppers − / + (mêmes
// plages/pas : haltères 0–50 kg pas 2, kettlebell 0–40 kg pas 2).

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

function Check({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
        borderColor: on ? colors.ember : colors.line2,
        backgroundColor: on ? colors.ember : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {on ? (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.bg} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 6L9 17l-5-5" />
        </Svg>
      ) : null}
    </View>
  )
}

function Stepper({ value, min, max, step, unit, onChange }: {
  value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) {
  const btn = (label: string, delta: number, disabled: boolean) => (
    <Pressable
      onPress={disabled ? undefined : () => onChange(Math.min(max, Math.max(min, value + delta)))}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2,
        alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
        backgroundColor: colors.surf2,
      })}
    >
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', lineHeight: 22 }}>{label}</Text>
    </Pressable>
  )
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {btn('−', -step, value <= min)}
      <Text style={{ minWidth: 64, textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: '700' }}>
        {value} {unit}
      </Text>
      {btn('+', step, value >= max)}
    </View>
  )
}

export default function RenfoEquipmentScreen() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const router = useRouter()

  const [form, setForm] = useState<RenfoProfile>(DEFAULT_PROFILE)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase.from('renfo_profile').select('*').eq('user_id', userId).maybeSingle().then(({ data }) => {
      const profile = data as RenfoProfile | null
      if (!profile) return
      const home = profile.equipment_home ?? profile.equipment ?? {}
      const gym = profile.equipment_gym ?? { ...FULL_GYM }
      setForm({ ...DEFAULT_PROFILE, ...profile, equipment_home: home, equipment_gym: gym })
    })
  }, [userId])

  function toggleEq(set: 'equipment_home' | 'equipment_gym', field: keyof Equipment, val: boolean) {
    setForm((f) => ({ ...f, [set]: { ...f[set], [field]: val } }))
  }
  function setEqNum(set: 'equipment_home' | 'equipment_gym', field: keyof Equipment, val: number) {
    setForm((f) => ({ ...f, [set]: { ...f[set], [field]: val } }))
  }

  async function save() {
    if (!userId || saving) return
    setSaving(true)
    setSaved(false)
    const { error } = await supabase.from('renfo_profile').upsert({
      user_id: userId,
      objective_weight: form.objective_weight,
      sessions_per_week: form.sessions_per_week,
      equipment_home: form.equipment_home,
      equipment_gym: form.equipment_gym,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  function EquipmentBlock({ setKey, title, subtitle }: {
    setKey: 'equipment_home' | 'equipment_gym'; title: string; subtitle: string
  }) {
    const eq = form[setKey]
    return (
      <Card style={{ marginBottom: space.lg }}>
        <FL style={{ marginBottom: 4 }}>{title}</FL>
        <Text style={{ color: colors.text3, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>{subtitle}</Text>
        {EQUIP_KEYS.map(({ key, label }) => {
          const on = !!(eq as Record<string, unknown>)[key]
          return (
            <Pressable
              key={key}
              onPress={() => toggleEq(setKey, key, !on)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}
            >
              <Check on={on} />
              <Text style={{ color: colors.text2, fontSize: 14 }}>{label}</Text>
            </Pressable>
          )
        })}
        <View style={{ marginTop: 12 }}>
          <FL>Haltères (poids max disponible)</FL>
          <Stepper value={eq.dumbbells_max_kg ?? 0} min={0} max={50} step={2} unit="kg"
            onChange={(v) => setEqNum(setKey, 'dumbbells_max_kg', v)} />
        </View>
        <View style={{ marginTop: 12 }}>
          <FL>Kettlebell (poids max)</FL>
          <Stepper value={eq.kettlebell_max_kg ?? 0} min={0} max={40} step={2} unit="kg"
            onChange={(v) => setEqNum(setKey, 'kettlebell_max_kg', v)} />
        </View>
      </Card>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        <BackLink label="← Réglages" onPress={() => router.back()} />
        <CLabel style={{ marginBottom: 24 }}>MATÉRIEL RENFO</CLabel>

        {/* Intensité renfo */}
        <Card style={{ marginBottom: space.lg }}>
          <FL style={{ marginBottom: 8 }}>Intensité du renfo</FL>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[{ v: 25, l: 'Prévention' }, { v: 50, l: 'Équilibré' }, { v: 75, l: 'Performance' }].map(({ v, l }) => {
              const on = form.objective_weight === v
              return (
                <HButton
                  key={v}
                  label={l}
                  onPress={() => setForm((f) => ({ ...f, objective_weight: v }))}
                  style={[{ flex: 1 }, on ? { backgroundColor: colors.ember, borderColor: colors.ember } : null]}
                  textStyle={on ? { color: colors.bg } : undefined}
                />
              )
            })}
          </View>
        </Card>

        {/* Matériel par lieu */}
        <EquipmentBlock setKey="equipment_home" title="Mon matériel — Maison"
          subtitle="Ce que tu as chez toi. Sélectionné quand tu lances une séance « Maison »." />
        <EquipmentBlock setKey="equipment_gym" title="Mon matériel — Salle"
          subtitle="Ce que ta salle propose (pré-rempli salle complète — décoche ce qui manque)." />

        <PrimaryButton label={saving ? 'SAUVEGARDE…' : 'ENREGISTRER LE MATÉRIEL'} onPress={save} disabled={saving} />
        {saved ? <MLabel style={{ color: colors.growth, marginTop: 8, textAlign: 'center' }}>Matériel sauvegardé</MLabel> : null}
      </ScrollView>
    </SafeAreaView>
  )
}
