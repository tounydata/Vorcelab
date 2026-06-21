import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/lib/auth'
import { duration, isRunning, km, pace, shortDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { colors, radius, space } from '@/lib/theme'

type Activity = {
  id: string
  name: string | null
  type: string | null
  start_date: string
  distance: number
  total_elevation_gain: number | null
  moving_time: number | null
  average_speed: number | null
  average_heartrate: number | null
}

export default function Dashboard() {
  const { session } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [acts, setActs] = useState<Activity[]>([])

  const load = useCallback(async () => {
    const [{ data: profile }, { data: activities }] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', session?.user.id).single(),
      supabase
        .from('strava_activities')
        .select('id,name,type,start_date,distance,total_elevation_gain,moving_time,average_speed,average_heartrate')
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(60),
    ])
    setName((profile as { name?: string } | null)?.name ?? null)
    setActs((activities as Activity[]) ?? [])
  }, [session?.user.id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load().finally(() => setRefreshing(false))
  }, [load])

  // « Ce mois » (mêmes règles que le web).
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const runs = acts.filter((a) => isRunning(a.type))
  const monthRuns = runs.filter((a) => new Date(a.start_date) >= startOfMonth)
  const kmMonth = monthRuns.reduce((s, a) => s + (a.distance ?? 0), 0)
  const elevMonth = monthRuns.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)
  const recent = runs.slice(0, 5)

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ember} />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ember} />}
      >
        {/* En-tête */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Logo size={26} />
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 1 }}>VORCELAB</Text>
          </View>
          <Pressable onPress={() => supabase.auth.signOut()} hitSlop={10}>
            <Text style={{ color: colors.text3, fontSize: 13 }}>Déconnexion</Text>
          </Pressable>
        </View>

        <Text style={{ color: colors.text2, fontSize: 13 }}>
          Salut{name ? ` ${name.split(' ')[0]}` : ''} 👋
        </Text>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 1, marginBottom: space.xl }}>
          DASHBOARD
        </Text>

        {/* Carte « ce mois » */}
        <View style={card}>
          <Text style={cardLabel}>CE MOIS</Text>
          <View style={{ flexDirection: 'row', marginTop: space.md }}>
            <Stat value={km(kmMonth)} unit="km course" color={colors.ember} />
            <Stat value={String(Math.round(elevMonth))} unit="m D+" color={colors.growth2} />
            <Stat value={String(monthRuns.length)} unit="sorties" color={colors.violet} />
          </View>
        </View>

        {/* Dernières sorties */}
        <Text style={[cardLabel, { marginTop: space.xl, marginBottom: space.md }]}>DERNIÈRES SORTIES</Text>
        {recent.length === 0 ? (
          <Text style={{ color: colors.text3, fontSize: 13 }}>Aucune activité enregistrée.</Text>
        ) : (
          recent.map((a) => (
            <Pressable key={a.id} onPress={() => router.push(`/activities/${a.id}` as never)} style={[card, { marginBottom: space.sm }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: space.md }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                    {a.name || 'Sortie'}
                  </Text>
                  <Text style={{ color: colors.text3, fontSize: 12, marginTop: 2 }}>
                    {shortDate(a.start_date)} · {km(a.distance)} km · D+ {Math.round(a.total_elevation_gain ?? 0)} m
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.ember, fontSize: 15, fontWeight: '700' }}>{pace(a.average_speed)}</Text>
                  <Text style={{ color: colors.text3, fontSize: 12, marginTop: 2 }}>{duration(a.moving_time)}</Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Stat({ value, unit, color }: { value: string; unit: string; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color, fontSize: 26, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.text3, fontSize: 11, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {unit}
      </Text>
    </View>
  )
}

const card = {
  backgroundColor: colors.surf2,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.md,
  padding: space.lg,
} as const

const cardLabel = {
  color: colors.text3,
  fontSize: 11,
  fontWeight: '700',
  letterSpacing: 1,
} as const
