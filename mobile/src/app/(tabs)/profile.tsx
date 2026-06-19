import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { colors, radius, space } from '@/lib/theme'

interface Profile {
  name: string | null
  sex: string | null
  age: number | null
  weight: number | null
  height: number | null
  fc_max: number | null
  vo2max: number | null
  runner_profile: { verdict?: string } | null
}

export default function ProfileScreen() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [p, setP] = useState<Profile | null>(null)

  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('name,sex,age,weight,height,fc_max,vo2max,runner_profile')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setP((data as Profile) ?? null)
        setLoading(false)
      })
  }, [session])

  const metrics: { label: string; value: string }[] = [
    { label: 'Poids', value: p?.weight ? `${p.weight} kg` : '—' },
    { label: 'Taille', value: p?.height ? `${p.height} cm` : '—' },
    { label: 'FCmax', value: p?.fc_max ? `${p.fc_max}` : '—' },
    { label: 'VO₂max', value: p?.vo2max ? `${p.vo2max}` : '—' },
    { label: 'Âge', value: p?.age ? `${p.age}` : '—' },
    { label: 'Sexe', value: p?.sex ? (p.sex === 'M' ? 'H' : p.sex) : '—' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 1, marginBottom: space.lg }}>
          RÉGLAGES
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.ember} style={{ marginTop: space.xl }} />
        ) : (
          <>
            {/* Identité */}
            <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: space.md }]}>
              <View style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: colors.surf3, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.ember, fontSize: 22, fontWeight: '800' }}>
                  {(p?.name ?? '?').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>
                  {p?.name ?? 'Coureur'}
                </Text>
                <Text style={{ color: colors.text3, fontSize: 12 }} numberOfLines={1}>
                  {session?.user.email}
                </Text>
              </View>
            </View>

            {/* Verdict profil coureur */}
            {p?.runner_profile?.verdict && (
              <View style={[card, { marginTop: space.sm }]}>
                <Text style={mlabel}>PROFIL COUREUR</Text>
                <Text style={{ color: colors.text2, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
                  {p.runner_profile.verdict}
                </Text>
              </View>
            )}

            {/* Métriques */}
            <View style={[card, { marginTop: space.sm }]}>
              <Text style={mlabel}>MES DONNÉES</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm }}>
                {metrics.map((m) => (
                  <View key={m.label} style={{ width: '33.33%', paddingVertical: space.sm }}>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{m.value}</Text>
                    <Text style={{ color: colors.text3, fontSize: 11, marginTop: 2 }}>{m.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Déconnexion */}
            <Pressable
              onPress={() => supabase.auth.signOut()}
              style={({ pressed }) => ({
                marginTop: space.xl,
                borderWidth: 1,
                borderColor: colors.ember,
                borderRadius: radius.md,
                paddingVertical: 13,
                alignItems: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: colors.ember, fontWeight: '700', letterSpacing: 0.5 }}>Déconnexion</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const card = {
  backgroundColor: colors.surf2,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.md,
  padding: space.lg,
} as const
const mlabel = { color: colors.text3, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 } as const
