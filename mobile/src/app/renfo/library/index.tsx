import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import ExerciseMedia from '@/components/ExerciseMedia'
import {
  RENFO_EXERCISES as _RENFO_EXERCISES,
  SESSION_EXERCISES as _SESSION_EXERCISES,
  FOCUS_META as _FOCUS_META,
  RENFO_FOCUS_COLORS as _RENFO_FOCUS_COLORS,
} from '@/lib/renfoData'
import { cardStyle, CLabel, MLabel, SVal, SLbl, BackLink, colors, space } from '@/components/coach/ui'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RENFO_EXERCISES = _RENFO_EXERCISES as Record<string, any>
const SESSION_EXERCISES = _SESSION_EXERCISES as Record<string, string[]>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FOCUS_META = _FOCUS_META as Record<string, any>
const RENFO_FOCUS_COLORS = _RENFO_FOCUS_COLORS as Record<string, string>

const GROUP_ORDER = [
  'force_lourde', 'pliometrie', 'excentrique', 'tronc',
  'haut_corps', 'yoga_coureur', 'pilates_coureur', 'stretching',
]

export default function RenfoLibraryScreen() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const router = useRouter()
  const go = (path: string) => router.push(path as never)

  const [maxByExo, setMaxByExo] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!userId) return
    supabase
      .from('renfo_max_lifts')
      .select('exercise_id, one_rm')
      .eq('user_id', userId)
      .then(({ data }) => {
        const m: Record<string, number> = {}
        for (const l of (data ?? []) as { exercise_id: string; one_rm: number }[]) m[l.exercise_id] = l.one_rm
        setMaxByExo(m)
      })
  }, [userId])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        <BackLink label="← Renfo" onPress={() => go('/coach')} />
        <CLabel style={{ marginBottom: 24 }}>BIBLIOTHÈQUE</CLabel>

        {GROUP_ORDER.map((focusKey) => {
          const exoIds: string[] = SESSION_EXERCISES[focusKey] ?? []
          const meta = FOCUS_META[focusKey] ?? {}
          const color: string = RENFO_FOCUS_COLORS[focusKey] ?? '#7c3aed'
          return (
            <View key={focusKey} style={{ marginBottom: 24 }}>
              <MLabel style={{ color, marginBottom: 8, letterSpacing: 1 }}>{meta.label ?? focusKey}</MLabel>
              {exoIds.map((exoId) => {
                const ex = RENFO_EXERCISES[exoId]
                if (!ex) return null
                const e1rm = maxByExo[exoId]
                return (
                  <Pressable
                    key={exoId}
                    onPress={() => go(`/renfo/library/${exoId}`)}
                    style={[cardStyle, { borderLeftWidth: 3, borderLeftColor: color, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
                      <ExerciseMedia exerciseId={exoId} category={focusKey} variant="thumb" />
                      <View style={{ flexShrink: 1 }}>
                        <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.47, fontWeight: '600' }}>{ex.name_fr}</Text>
                        <Text style={{ fontSize: 10.5, color: colors.text3 }}>{ex.primary_muscles?.join(', ')}</Text>
                      </View>
                    </View>
                    {e1rm ? (
                      <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                        <SVal style={{ fontSize: 16 }}>{e1rm} kg</SVal>
                        <SLbl>1RM est.</SLbl>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 10.5, color: colors.text3 }}>→</Text>
                    )}
                  </Pressable>
                )
              })}
            </View>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}
