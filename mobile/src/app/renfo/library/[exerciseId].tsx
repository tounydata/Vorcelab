import { useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import ExerciseMedia from '@/components/ExerciseMedia'
import { RENFO_EXERCISES as _RENFO_EXERCISES, RENFO_FOCUS_COLORS as _RENFO_FOCUS_COLORS } from '@/lib/renfoData'
import { Card, CLabel, MLabel, FL, SVal, SLbl, PrimaryButton, BackLink, colors, space } from '@/components/coach/ui'

 
const RENFO_EXERCISES = _RENFO_EXERCISES as Record<string, any>
const RENFO_FOCUS_COLORS = _RENFO_FOCUS_COLORS as Record<string, string>

interface ChartPoint { date: string; e1rm: number }

function E1rmChart({ data, color }: { data: ChartPoint[]; color: string }) {
  const W = 300, H = 120
  const PL = 36, PR = 10, PT = 10, PB = 28

  const minE = Math.min(...data.map((d) => d.e1rm))
  const maxE = Math.max(...data.map((d) => d.e1rm))
  const eRange = maxE - minE || 1
  const minT = new Date(data[0].date).getTime()
  const maxT = new Date(data[data.length - 1].date).getTime()
  const tRange = maxT - minT || 1

  const toX = (d: string) => PL + ((new Date(d).getTime() - minT) / tRange) * (W - PL - PR)
  const toY = (e: number) => PT + (1 - (e - minE) / eRange) * (H - PT - PB)
  const pts = data.map((d) => `${toX(d.date).toFixed(1)},${toY(d.e1rm).toFixed(1)}`).join(' ')

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', aspectRatio: W / H }}>
      <Line x1={PL} y1={toY(minE)} x2={W - PR} y2={toY(minE)} stroke={colors.line} strokeWidth={1} />
      {maxE !== minE ? (
        <Line x1={PL} y1={toY(maxE)} x2={W - PR} y2={toY(maxE)} stroke={colors.line} strokeWidth={1} strokeDasharray="3 3" />
      ) : null}
      <SvgText x={PL - 4} y={toY(minE)} fontSize={9} fill={colors.text3} textAnchor="end">{String(minE)}</SvgText>
      <SvgText x={PL - 4} y={toY(maxE)} fontSize={9} fill={colors.text3} textAnchor="end">{String(maxE)}</SvgText>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => (
        <Circle key={i} cx={toX(d.date)} cy={toY(d.e1rm)} r={3} fill={color} />
      ))}
      <SvgText x={toX(data[0].date)} y={H - 4} fontSize={9} fill={colors.text3} textAnchor="middle">{data[0].date.slice(5)}</SvgText>
      <SvgText x={toX(data[data.length - 1].date)} y={H - 4} fontSize={9} fill={colors.text3} textAnchor="middle">{data[data.length - 1].date.slice(5)}</SvgText>
    </Svg>
  )
}

export default function RenfoExerciseDetailScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const router = useRouter()
  const go = (path: string) => router.push(path as never)

  const ex = RENFO_EXERCISES[exerciseId!]
  const color: string = RENFO_FOCUS_COLORS[ex?.category] ?? '#7c3aed'

  const [logs, setLogs] = useState<{ session_date: string; e1rm: number | null }[]>([])
  useEffect(() => {
    if (!userId || !exerciseId) return
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    supabase
      .from('renfo_exercise_log')
      .select('session_date, e1rm')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .gte('session_date', cutoff)
      .order('session_date', { ascending: true })
      .then(({ data }) => setLogs((data ?? []) as { session_date: string; e1rm: number | null }[]))
  }, [userId, exerciseId])

  const chartData = useMemo<ChartPoint[]>(() => {
    const byDate: Record<string, number> = {}
    for (const l of logs) {
      if (!l.e1rm) continue
      if (!byDate[l.session_date] || l.e1rm > byDate[l.session_date]) byDate[l.session_date] = l.e1rm
    }
    return Object.entries(byDate).map(([date, e1rm]) => ({ date, e1rm }))
  }, [logs])

  if (!ex) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          <BackLink label="← Bibliothèque" onPress={() => go('/renfo/library')} />
          <MLabel>Exercice introuvable.</MLabel>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        <BackLink label="← Bibliothèque" onPress={() => go('/renfo/library')} />

        <CLabel style={{ marginBottom: 4, color }}>{ex.name_fr}</CLabel>
        {ex.name_tech ? (
          <Text style={{ fontSize: 10.5, color: colors.text3, marginBottom: 16 }}>{ex.name_tech}</Text>
        ) : null}

        <View style={{ marginBottom: 16 }}>
          <ExerciseMedia exerciseId={exerciseId!} category={ex.category} variant="full" />
        </View>

        <Card style={{ marginBottom: 16 }}>
          <FL>Muscles principaux</FL>
          <Text style={{ fontSize: 10.5, color: colors.text3 }}>{ex.primary_muscles?.join(', ')}</Text>
        </Card>

        {chartData.length >= 2 ? (
          <Card style={{ marginBottom: 16 }}>
            <FL style={{ marginBottom: 12 }}>Progression 1RM estimé — 90 jours</FL>
            <E1rmChart data={chartData} color={color} />
          </Card>
        ) : null}
        {chartData.length === 1 ? (
          <Card style={{ marginBottom: 16 }}>
            <FL>1RM estimé</FL>
            <SVal style={{ color, fontSize: 24 }}>{chartData[0].e1rm} kg</SVal>
            <SLbl>{chartData[0].date}</SLbl>
          </Card>
        ) : null}

        {ex.position ? (
          <Card style={{ marginBottom: 16 }}>
            <FL>Position de départ</FL>
            <Text style={{ fontSize: 10.5, color: colors.text3, lineHeight: 17 }}>{ex.position}</Text>
          </Card>
        ) : null}
        {ex.movement ? (
          <Card style={{ marginBottom: 16 }}>
            <FL>Exécution</FL>
            <Text style={{ fontSize: 10.5, color: colors.text3, lineHeight: 17 }}>{ex.movement}</Text>
          </Card>
        ) : null}
        {ex.common_errors ? (
          <Card style={{ marginBottom: 16, borderLeftWidth: 3, borderLeftColor: colors.amber }}>
            <FL style={{ color: colors.amber }}>Erreurs fréquentes</FL>
            <Text style={{ fontSize: 10.5, color: colors.text3, lineHeight: 17 }}>{ex.common_errors}</Text>
          </Card>
        ) : null}

        {ex.variants?.length > 0 ? (
          <Card style={{ marginBottom: 24 }}>
            <FL style={{ marginBottom: 8 }}>Variantes disponibles</FL>
            { }
            {ex.variants.map((v: any) => (
              <View key={v.id} style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 12 }}>
                <Text style={{ fontSize: 10.5, color: colors.text3, marginBottom: 2 }}>{v.name}</Text>
                <Text style={{ fontSize: 10.5, color: colors.text3 }}>
                  {v.default_sets}×{v.default_reps} · RPE {v.target_rpe} · repos {v.rest_seconds}s
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <PrimaryButton label="LANCER UNE SÉANCE →" onPress={() => go(`/renfo/session/${ex.category}`)} />
      </ScrollView>
    </SafeAreaView>
  )
}
