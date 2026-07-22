import { useEffect, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import OneRMTestPopup from '@/components/coach/OneRMTestPopup'
import { Card, FL, HButton, colors } from '@/components/coach/ui'

// Vue + saisie des 1RM (force) dans les Réglages — porté de
// `src/components/coach/OneRMSettingsCard.tsx`. Saisie directe (is_estimated=false)
// ou test guidé (OneRMTestPopup). Stocké dans renfo_max_lifts (partagé avec la séance).

const KEY_LIFTS: { id: string; label: string }[] = [
  { id: 'squat_lourd', label: 'Squat' },
  { id: 'deadlift', label: 'Soulevé de terre' },
  { id: 'hip_thrust', label: 'Hip thrust' },
  { id: 'rdl', label: 'Soulevé roumain' },
]

interface MaxLift { exercise_id: string; one_rm: number; is_estimated?: boolean }

export default function OneRMSettingsCard() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [testOpen, setTestOpen] = useState(false)
  const [lifts, setLifts] = useState<MaxLift[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})

  function load() {
    if (!userId) return
    supabase.from('renfo_max_lifts').select('exercise_id,one_rm,is_estimated').eq('user_id', userId)
      .then(({ data }) => setLifts((data ?? []) as MaxLift[]))
  }
  useEffect(() => { load() }, [userId])

  const byId = Object.fromEntries(lifts.map((l) => [l.exercise_id, l]))

  async function commit(id: string) {
    const raw = edits[id]
    if (raw == null || !userId) return
    const v = parseFloat(raw.replace(',', '.'))
    setEdits((e) => { const n = { ...e }; delete n[id]; return n })
    if (!Number.isFinite(v) || v <= 0) return
    if (v === byId[id]?.one_rm) return
    const { error } = await supabase.from('renfo_max_lifts').upsert({
      user_id: userId, exercise_id: id, one_rm: Math.round(v * 2) / 2,
      is_estimated: false, recorded_at: new Date().toISOString(),
    })
    if (!error) load()
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <FL style={{ marginBottom: 4 }}>Mes 1RM · Force</FL>
      <Text style={{ fontSize: 12, color: colors.text3, lineHeight: 18, marginBottom: 12 }}>
        Ta charge max sur 1 répétition par mouvement — elle sert à prescrire en force max
        (% de 1RM). Entre une valeur connue, ou lance le test guidé (sans risque).
      </Text>

      <View style={{ gap: 8 }}>
        {KEY_LIFTS.map((lift) => {
          const cur = byId[lift.id]
          const val = edits[lift.id] ?? (cur ? String(cur.one_rm) : '')
          return (
            <View key={lift.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 13, color: colors.text }}>{lift.label}</Text>
              {cur?.is_estimated ? (
                <Text style={{ fontSize: 9, color: colors.text3, letterSpacing: 0.5 }}>estimé</Text>
              ) : null}
              <TextInput
                value={val}
                onChangeText={(t) => setEdits((s) => ({ ...s, [lift.id]: t }))}
                onBlur={() => commit(lift.id)}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.text3}
                style={{
                  width: 90, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.surf2,
                  color: colors.text, borderWidth: 1, borderColor: colors.line2, borderRadius: 6,
                  fontSize: 13, textAlign: 'right',
                }}
              />
              <Text style={{ fontSize: 11, color: colors.text3, width: 18 }}>kg</Text>
            </View>
          )
        })}
      </View>

      <HButton label="🏋 Faire le test de force guidé" onPress={() => setTestOpen(true)} style={{ marginTop: 14 }} />
      <OneRMTestPopup open={testOpen} onClose={() => setTestOpen(false)} onSaved={load} />
    </Card>
  )
}
