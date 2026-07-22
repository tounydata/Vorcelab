import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { MountainIcon, PlusRingIcon } from '@/components/coach/CoachIcons'
import { colors, font, radius, space } from '@/lib/theme'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
}
interface Activity {
  id: string
  distance: number
  start_date: string
  start_date_local: string | null
  type: string
  sport_type: string | null
}
interface RenfoLog {
  session_date: string
}

const isRunning = (a: { type: string; sport_type?: string | null }) =>
  ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(a.type) ||
  ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(a.sport_type ?? '')

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const DAY_HEADERS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']
const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export default function RaceCalendar() {
  const { session } = useAuth()
  const uid = session?.user.id
  const router = useRouter()
  const [cursor, setCursor] = useState(new Date())
  const [races, setRaces] = useState<Race[]>([])
  const [acts, setActs] = useState<Activity[]>([])
  const [renfo, setRenfo] = useState<RenfoLog[]>([])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const loadRaces = useCallback(() => {
    supabase
      .from('race_calendar')
      .select('id,name,date,distance,elevation,type')
      .order('date', { ascending: true })
      .then(({ data }) => setRaces((data as Race[]) ?? []))
  }, [])

  // Recharge à chaque retour sur l'onglet → une course ajoutée apparaît aussitôt.
  useFocusEffect(loadRaces)

  const loadMonth = useCallback(async () => {
    const start = new Date(year, month, 1).toISOString()
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase
        .from('strava_activities')
        .select('id,distance,start_date,start_date_local,type,sport_type')
        .is('deleted_at', null)
        .gte('start_date', start)
        .lte('start_date', end),
      uid
        ? supabase.from('renfo_session_log').select('session_date').eq('user_id', uid).gte('session_date', startStr).lte('session_date', endStr)
        : Promise.resolve({ data: [] as RenfoLog[] }),
    ])
    setActs((a as Activity[]) ?? [])
    setRenfo((r as RenfoLog[]) ?? [])
  }, [year, month, uid])

  useEffect(() => {
    loadMonth()
  }, [loadMonth])

  // Grille
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = toDateStr(new Date())
  const cells = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - startOffset + 1
    const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth
    const date = new Date(year, month, dayNum)
    const dateStr = toDateStr(date)
    return { dayNum: date.getDate(), isCurrentMonth, dateStr, isToday: dateStr === todayStr }
  })

  const actsByDate = useMemo(() => {
    const m: Record<string, Activity[]> = {}
    for (const a of acts) {
      const d = (a.start_date_local ?? a.start_date).slice(0, 10)
      ;(m[d] ??= []).push(a)
    }
    return m
  }, [acts])
  const renfoByDate = useMemo(() => {
    const m: Record<string, boolean> = {}
    for (const r of renfo) m[r.session_date] = true
    return m
  }, [renfo])
  const raceByDate = useMemo(() => {
    const m: Record<string, Race> = {}
    for (const r of races) m[r.date.slice(0, 10)] = r
    return m
  }, [races])

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const upcoming = races.filter((r) => new Date(r.date) >= now)
  const past = races.filter((r) => new Date(r.date) < now).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const daysLeft = (iso: string) => {
    const d = new Date(iso)
    d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - now.getTime()) / 86400000)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        {/* En-tête */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg }}>
          <Text style={{ color: colors.text, fontSize: 28, fontFamily: font.display, letterSpacing: 0.5 }}>CALENDRIER</Text>
          <Pressable onPress={() => router.push('/race/add')} style={{ backgroundColor: colors.ember, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={{ color: colors.bg, fontWeight: '800', fontSize: 12 }}>+ Ajouter</Text>
          </Pressable>
        </View>

        {/* Navigation mois */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: space.md }}>
          <Pressable onPress={() => setCursor(new Date(year, month - 1, 1))} hitSlop={10}>
            <Text style={{ color: colors.text2, fontSize: 20 }}>←</Text>
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', minWidth: 140, textAlign: 'center' }}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <Pressable onPress={() => setCursor(new Date(year, month + 1, 1))} hitSlop={10}>
            <Text style={{ color: colors.text2, fontSize: 20 }}>→</Text>
          </Pressable>
        </View>

        {/* En-têtes jours */}
        <View style={{ flexDirection: 'row' }}>
          {DAY_HEADERS.map((d) => (
            <View key={d} style={{ width: `${100 / 7}%`, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <Text style={{ color: colors.text3, fontSize: 9, textAlign: 'center', letterSpacing: 0.5 }}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Cellules */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.xl }}>
          {cells.map((c, i) => {
            const dayRuns = (actsByDate[c.dateStr] ?? []).filter(isRunning)
            const dayRace = raceByDate[c.dateStr]
            return (
              <View
                key={i}
                style={{
                  width: `${100 / 7}%`,
                  minHeight: 62,
                  borderWidth: 1,
                  padding: 3,
                  opacity: c.isCurrentMonth ? 1 : 0.3,
                  backgroundColor: c.isToday ? colors.surf2 : 'transparent',
                  borderColor: c.isToday ? colors.ember : colors.line,
                }}
              >
                <Text style={{ color: colors.text3, fontSize: 10, marginBottom: 1 }}>{c.dayNum}</Text>
                {dayRuns.map((a) => (
                  <Text key={a.id} style={{ color: colors.ember, fontSize: 8.5 }} numberOfLines={1}>
                    → {(a.distance / 1000).toFixed(1)}k
                  </Text>
                ))}
                {renfoByDate[c.dateStr] && <View style={{ flexDirection: 'row', gap: 1 }}><PlusRingIcon size={8} color={colors.violet} /><PlusRingIcon size={8} color={colors.violet} /></View>}
                {dayRace && (
                  <View style={{ backgroundColor: colors.ember, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, marginTop: 1 }}>
                    <Text style={{ color: colors.bg, fontSize: 8 }} numberOfLines={1}>
                      {dayRace.name.replace(/^\[DEV\]\s*/, '')}
                    </Text>
                  </View>
                )}
              </View>
            )
          })}
        </View>

        {/* Prochaines courses */}
        {upcoming.length > 0 && (
          <View style={{ marginBottom: space.lg }}>
            <Text style={mlabel}>PROCHAINES COURSES</Text>
            {upcoming.map((race) => (
              <Pressable key={race.id} onPress={() => router.push(`/race/${race.id}` as never)} style={row}>
                {race.type === 'trail'
                  ? <MountainIcon size={16} color={colors.ember} />
                  : <Text style={{ color: colors.growth, fontSize: 16 }}>→</Text>}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{race.name}</Text>
                  <Text style={{ color: colors.text3, fontSize: 10, marginTop: 2 }}>
                    {formatDate(race.date)}
                    {race.distance ? ` · ${race.distance}km` : ''}
                    {race.elevation ? ` · ${race.elevation}m D+` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.ember, fontSize: 16, fontFamily: font.display }}>
                  {daysLeft(race.date) === 0 ? "Auj." : `${daysLeft(race.date)}j`}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Courses passées */}
        {past.length > 0 && (
          <View>
            <Text style={mlabel}>COURSES PASSÉES</Text>
            {past.map((race) => (
              <Pressable key={race.id} onPress={() => router.push(`/race/${race.id}` as never)} style={row}>
                {race.type === 'trail' ? <MountainIcon size={16} color={colors.text3} /> : <Text style={{ color: colors.text3, fontSize: 16 }}>→</Text>}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text2, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{race.name}</Text>
                  <Text style={{ color: colors.text3, fontSize: 10, marginTop: 2 }}>
                    {formatDate(race.date)}
                    {race.distance ? ` · ${race.distance}km` : ''}
                    {race.elevation ? ` · ${race.elevation}m D+` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {upcoming.length === 0 && races.length === 0 && (
          <Text style={[mlabel, { color: colors.text3 }]}>Aucune course planifiée</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const mlabel = { color: colors.text3, fontSize: 11, fontFamily: font.monoSemiBold, letterSpacing: 1.4, marginBottom: space.sm } as const
const row = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 10,
  paddingVertical: 10,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
}
