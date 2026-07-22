import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { colors, font, radius, space } from '@/lib/theme'

interface Activity {
  id: string
  name: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  start_date: string
  type: string
  sport_type: string | null
}

const RUN_TYPES = ['Run', 'TrailRun', 'Trail Run', 'Running', 'VirtualRun']
const isRunOrTrail = (a: Activity) => RUN_TYPES.includes(a.type) || RUN_TYPES.includes(a.sport_type ?? '')
const runBadge = (a: Activity) => (a.sport_type === 'TrailRun' || a.sport_type === 'Trail Run' ? 'Trail' : 'Course')

const formatKm = (m: number) => (m / 1000).toFixed(1)
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}

type TypeFilter = 'tout' | 'trail' | 'route'
interface PeriodStats {
  label: string
  count: number
  km: number
  dplus: number
  timeS: number
  deltaKmPct: number | null
}

function aggregate(acts: Activity[], from: Date, to: Date) {
  const inRange = acts.filter((a) => {
    const d = new Date(a.start_date)
    return d >= from && d < to
  })
  return {
    count: inRange.length,
    km: inRange.reduce((s, a) => s + a.distance, 0) / 1000,
    dplus: inRange.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0),
    timeS: inRange.reduce((s, a) => s + a.moving_time, 0),
  }
}

function computePeriods(acts: Activity[]): PeriodStats[] {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const prevYearStart = new Date(now.getFullYear() - 1, 0, 1)
  const prevYearSameDay = new Date(now)
  prevYearSameDay.setFullYear(now.getFullYear() - 1)
  const future = new Date(now.getTime() + 86_400_000)

  const defs = [
    { label: 'CETTE SEMAINE', from: weekStart, to: future, prevFrom: prevWeekStart, prevTo: weekStart },
    { label: 'CE MOIS', from: monthStart, to: future, prevFrom: prevMonthStart, prevTo: monthStart },
    { label: 'CETTE ANNÉE', from: yearStart, to: future, prevFrom: prevYearStart, prevTo: prevYearSameDay },
  ]
  return defs.map(({ label, from, to, prevFrom, prevTo }) => {
    const cur = aggregate(acts, from, to)
    const prev = aggregate(acts, prevFrom, prevTo)
    return {
      label,
      ...cur,
      deltaKmPct: prev.km > 0.1 ? Math.round(((cur.km - prev.km) / prev.km) * 100) : null,
    }
  })
}

export default function Activities() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [all, setAll] = useState<Activity[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tout')

  useEffect(() => {
    supabase
      .from('strava_activities')
      .select('id,name,distance,total_elevation_gain,moving_time,start_date,type,sport_type')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        setAll((data as Activity[]) ?? [])
        setLoading(false)
      })
  }, [])

  const runs = useMemo(() => all.filter(isRunOrTrail), [all])
  const typeFiltered = useMemo(
    () =>
      runs.filter((a) =>
        typeFilter === 'tout' ? true : typeFilter === 'trail' ? runBadge(a) === 'Trail' : runBadge(a) === 'Course',
      ),
    [runs, typeFilter],
  )
  const filtered = useMemo(
    () => typeFiltered.filter((a) => a.name.toLowerCase().includes(search.toLowerCase())),
    [typeFiltered, search],
  )
  const periods = useMemo(() => computePeriods(typeFiltered), [typeFiltered])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        <Text style={title}>ACTIVITÉS</Text>

        {/* Volumes par période (suivent le filtre) */}
        {!loading && runs.length > 0 && (
          <View style={{ gap: space.sm, marginBottom: space.lg }}>
            {periods.map((p) => (
              <View key={p.label} style={card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <Text style={mlabel}>{p.label}</Text>
                  {p.deltaKmPct != null && (
                    <Text style={{ fontSize: 10, color: p.deltaKmPct >= 0 ? colors.growth : colors.ember }}>
                      {p.deltaKmPct >= 0 ? '+' : ''}
                      {p.deltaKmPct}% · vs préc.
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 24, fontFamily: font.display, color: colors.ember }}>
                    {p.km.toFixed(p.km >= 100 ? 0 : 1)}
                    <Text style={{ fontSize: 13, color: colors.text3 }}> km</Text>
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.growth }}>↑{Math.round(p.dplus)} m</Text>
                  <Text style={{ fontSize: 11, color: colors.text3 }}>
                    {formatTime(p.timeS)} · {p.count} sortie{p.count > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recherche + filtre */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher une sortie…"
          placeholderTextColor={colors.text3}
          style={{
            backgroundColor: colors.surf2,
            borderWidth: 1,
            borderColor: colors.line2,
            borderRadius: radius.sm,
            paddingHorizontal: space.md,
            paddingVertical: 10,
            color: colors.text,
            marginBottom: space.md,
          }}
        />
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderRadius: radius.sm, overflow: 'hidden', marginBottom: space.lg }}>
          {(['tout', 'trail', 'route'] as TypeFilter[]).map((t) => {
            const active = typeFilter === t
            return (
              <Pressable
                key={t}
                onPress={() => setTypeFilter(t)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: active ? colors.ember : colors.surf2 }}
              >
                <Text style={{ color: active ? colors.bg : colors.text2, fontWeight: '700', fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  {t}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Liste */}
        {loading ? (
          <ActivityIndicator color={colors.ember} style={{ marginTop: space.xl }} />
        ) : filtered.length === 0 ? (
          <Text style={mlabel}>{search ? 'Aucun résultat' : 'Aucune sortie'}</Text>
        ) : (
          <>
            <Text style={[mlabel, { marginBottom: space.sm }]}>
              {filtered.length} sortie{filtered.length > 1 ? 's' : ''}
            </Text>
            {filtered.map((a) => (
              <Pressable key={a.id} onPress={() => router.push(`/activities/${a.id}` as never)} style={[card, { marginBottom: space.sm, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ flex: 1, paddingRight: space.md }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text style={{ color: colors.text3, fontSize: 12, marginTop: 3 }}>
                    {formatDate(a.start_date)} · {formatKm(a.distance)} km · {formatTime(a.moving_time)} · ↑
                    {Math.round(a.total_elevation_gain ?? 0)} m
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.surf3, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: colors.text2, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>{runBadge(a)}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const title = {
  color: colors.text,
  fontSize: 26,
  fontWeight: '800',
  letterSpacing: 1,
  marginBottom: space.lg,
} as const
const card = {
  backgroundColor: colors.surf2,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.md,
  padding: space.md,
} as const
const mlabel = { color: colors.text3, fontSize: 11, fontFamily: font.monoSemiBold, letterSpacing: 1 } as const
