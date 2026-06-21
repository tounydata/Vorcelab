import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { colors, radius, space } from '@/lib/theme'

// Création d'une course (objectif) → insertion dans race_calendar. Porté de
// AddRacePage.tsx. Date/heure saisies en texte (AAAA-MM-JJ / HH:MM) faute de
// date-picker natif sans dépendance supplémentaire — même donnée, même résultat.

type RaceType = 'Route' | 'Trail'
type Priority = 'A' | 'B' | 'C'

const PRIORITIES: { value: Priority; label: string; note: string }[] = [
  { value: 'A', label: 'A — Objectif majeur', note: 'la prépa s’oriente entièrement vers cette course' },
  { value: 'B', label: 'B — Important', note: 'mini-affûtage, sans casser le bloc' },
  { value: 'C', label: 'C — Préparation', note: 'course-test, intégrée à l’entraînement' },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default function AddRaceScreen() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const router = useRouter()

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [type, setType] = useState<RaceType>('Trail')
  const [distance, setDistance] = useState('')
  const [elevation, setElevation] = useState('')
  const [startTime, setStartTime] = useState('')
  const [priority, setPriority] = useState<Priority>('A')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const km = parseFloat(distance.replace(',', '.'))
  const valid = !!name.trim() && DATE_RE.test(date) && km > 0

  async function submit() {
    if (!userId || !valid) return
    setSaving(true); setError(false)
    const { error: err } = await supabase.from('race_calendar').insert({
      user_id: userId,
      name: name.trim(),
      date,
      distance: km,
      elevation: elevation ? parseInt(elevation, 10) : 0,
      type,
      priority,
      start_time: startTime || null,
    })
    setSaving(false)
    if (err) { setError(true); return }
    router.push('/race')
  }

  const input = {
    width: '100%' as const, backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, color: colors.text, fontSize: 15,
  }
  const Label = ({ children }: { children: React.ReactNode }) => (
    <Text style={{ fontSize: 10, letterSpacing: 0.8, color: colors.text3, textTransform: 'uppercase', marginBottom: 6 }}>{children}</Text>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, maxWidth: 540, width: '100%', alignSelf: 'center' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Pressable onPress={() => router.push('/race')} hitSlop={8}>
            <Text style={{ color: colors.text2, fontSize: 22 }}>←</Text>
          </Pressable>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text }}>Ajouter une course</Text>
        </View>

        <View style={{ gap: 18 }}>
          <View>
            <Label>Nom de la course</Label>
            <TextInput style={input} value={name} onChangeText={setName} placeholder="Ex. Trail des Cimes" placeholderTextColor={colors.text3} />
          </View>

          <View>
            <Label>Date (AAAA-MM-JJ)</Label>
            <TextInput style={input} value={date} onChangeText={setDate} placeholder="2026-09-12" placeholderTextColor={colors.text3} keyboardType="numbers-and-punctuation" autoCapitalize="none" />
          </View>

          <View>
            <Label>Type</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['Trail', 'Route'] as RaceType[]).map((t) => {
                const on = type === t
                return (
                  <Pressable key={t} onPress={() => setType(t)}
                    style={{ flex: 1, padding: 10, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center',
                      borderColor: on ? colors.ember : colors.line, backgroundColor: on ? colors.ember : colors.surf2 }}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: on ? colors.bg : colors.text2 }}>{t === 'Trail' ? '⛰ Trail' : '→ Route'}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Label>Distance (km)</Label>
              <TextInput style={input} value={distance} onChangeText={setDistance} placeholder="42.2" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Dénivelé D+ (m)</Label>
              <TextInput style={input} value={elevation} onChangeText={setElevation} placeholder="0" placeholderTextColor={colors.text3} keyboardType="number-pad" />
            </View>
          </View>

          <View>
            <Label>Heure de départ (optionnel)</Label>
            <TextInput style={input} value={startTime} onChangeText={setStartTime} placeholder="08:00" placeholderTextColor={colors.text3} keyboardType="numbers-and-punctuation" />
            <Text style={{ fontSize: 12, color: colors.text3, marginTop: 4 }}>Affine la météo à J-10 (chaleur, nuit, vent).</Text>
          </View>

          <View>
            <Label>Priorité</Label>
            <View style={{ gap: 8 }}>
              {PRIORITIES.map((p) => {
                const on = priority === p.value
                return (
                  <Pressable key={p.value} onPress={() => setPriority(p.value)}
                    style={{ padding: 12, borderRadius: radius.sm, borderWidth: 1,
                      borderColor: on ? colors.ember : colors.line, backgroundColor: on ? colors.surf2 : 'transparent' }}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: on ? colors.ember : colors.text }}>{p.label}</Text>
                    <Text style={{ fontSize: 12.5, color: colors.text3, marginTop: 2 }}>{p.note}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {error ? (
            <Text style={{ color: colors.ember2, fontSize: 13 }}>Impossible d’enregistrer la course. Réessaie.</Text>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={!valid || saving}
            style={{ marginTop: 4, padding: 12, borderRadius: radius.sm, alignItems: 'center',
              backgroundColor: valid ? colors.ember : colors.line, opacity: saving ? 0.7 : 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 16, letterSpacing: 0.48, color: valid ? colors.bg : colors.text3 }}>
              {saving ? 'Enregistrement…' : 'Ajouter la course'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
