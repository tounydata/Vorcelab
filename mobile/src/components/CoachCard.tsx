import { Pressable, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useCoachPlan } from '@/lib/coach/useCoachPlan'
import { listSessionLog, type SessionLogRow } from '@/lib/coach/sessionLog'
import { PHASE_LABELS } from '@/lib/coach/planGenerator'
import type { Phase } from '@/lib/coach/workouts'
import { RENFO_FOCUS_SHORT } from '@/lib/coach/renfoFusion'
import { FOCUS_META } from '@/lib/renfoData'
import type { SessionLog } from '@/lib/renfoUtils'
import { colors, radius } from '@/lib/theme'

const PHASE_COLORS: Record<Phase, string> = { base: colors.growth, build: colors.amber, specific: colors.ember, taper: '#3B82F6', race: colors.ember }
const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const
const INTENSITY: Record<string, { label: string; color: string }> = {
  easy: { label: 'Facile', color: colors.growth }, moderate: { label: 'Modéré', color: colors.amber }, hard: { label: 'Soutenu', color: colors.ember },
}
const RENFO = colors.violet
type RenfoLogLite = Pick<SessionLog, 'focus' | 'session_date'>
function isoDate(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function CoachCard({ renfoLogs, renfoWeeklyTarget }: { renfoLogs: RenfoLogLite[]; renfoWeeklyTarget: number }) {
  const router = useRouter()
  const go = (p: string) => router.push(p as never)
  const { isLoading, targetRace, plan, displayWeeks, renfoFusion } = useCoachPlan()
  const [sessionLogs, setSessionLogs] = useState<SessionLogRow[]>([])
  useEffect(() => { listSessionLog(120).then(setSessionLogs) }, [])

  const now = new Date()
  const todayDow = ((now.getDay() + 6) % 7) + 1
  const FR_D = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
  const FR_M = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  const dateLabel = `${FR_D[now.getDay()]} ${now.getDate()} ${FR_M[now.getMonth()]}`.toUpperCase()

  const week0 = displayWeeks[0]
  const todayRun = week0?.sessions.find((s) => s.dayOfWeek === todayDow) ?? null
  const todayRenfo = renfoFusion?.slots.find((sl) => sl.dayOfWeek === todayDow) ?? null
  const phase = week0?.phase
  const isRaceDay = todayRun?.system === 'race'
  const intensity = todayRun && !isRaceDay ? INTENSITY[todayRun.intensity] ?? null : null

  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const todayStr = isoDate(now)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    const ds = isoDate(d)
    return { letter: WEEK_LETTERS[i], ds, doneRun: sessionLogs.some((l) => l.planned_date === ds), doneRenfo: renfoLogs.some((r) => r.session_date === ds), isToday: ds === todayStr, isPast: ds < todayStr }
  })
  const weekStartStr = isoDate(weekStart)
  const renfoWeekCount = [...new Set(renfoLogs.filter((r) => r.session_date && r.session_date >= weekStartStr).map((r) => r.session_date))].length
  const planSessions = (week0?.sessions ?? []).filter((s) => s.system !== 'race').map((s) => {
    const ds = weekDays[s.dayOfWeek - 1]?.ds
    return { dayOfWeek: s.dayOfWeek, title: s.title, done: sessionLogs.some((l) => l.planned_workout_id === s.workoutId && l.planned_date === ds) }
  }).sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  const planDoneCount = planSessions.filter((s) => s.done).length
  const accent = phase ? PHASE_COLORS[phase] : colors.line

  function dayVisual(d: typeof weekDays[number]): { bg: string; border: string; dot: string | null } {
    if (d.doneRun) return { bg: colors.ember, border: 'transparent', dot: d.doneRenfo ? RENFO : null }
    if (d.doneRenfo) return { bg: RENFO, border: 'transparent', dot: null }
    return { bg: colors.surf2, border: colors.line, dot: null }
  }

  return (
    <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: accent, borderRadius: radius.lg, padding: 16, marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.76, color: colors.text2 }}>COACH</Text>
          {phase ? <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.95, color: accent, backgroundColor: `${accent}24`, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 7, textTransform: 'uppercase', overflow: 'hidden' }}>{PHASE_LABELS[phase]?.toUpperCase?.() ?? phase}</Text> : null}
        </View>
        <Pressable onPress={() => go('/coach')}><Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.ember }}>MON PLAN →</Text></Pressable>
      </View>

      {isLoading ? (
        <Text style={{ color: colors.text3, fontSize: 13, paddingVertical: 8 }}>Chargement…</Text>
      ) : !targetRace || !plan ? (
        <Pressable onPress={() => go('/race/add')}>
          <Text style={{ fontSize: 22, fontWeight: '800', lineHeight: 25, marginBottom: 4, color: colors.text }}>Donne un cap à ton entraînement</Text>
          <Text style={{ fontSize: 13, color: colors.text2, lineHeight: 19, marginBottom: 8 }}>Ajoute ta course cible : le Coach construit ton plan jusqu'au jour J.</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.ember }}>DÉFINIR MA COURSE CIBLE →</Text>
        </Pressable>
      ) : isRaceDay ? (
        <Pressable onPress={() => go(`/race/${targetRace.id}`)}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.ember, marginBottom: 6 }}>JOUR J · {dateLabel}</Text>
          <Text style={{ fontSize: 27, fontWeight: '800', lineHeight: 28, marginBottom: 4, color: colors.text }}>C'est aujourd'hui.</Text>
          <Text style={{ fontSize: 13.5, color: colors.text, lineHeight: 20, marginBottom: 10 }}>{targetRace.name} — fais-toi confiance, le plan est derrière toi.</Text>
          <Text style={{ alignSelf: 'flex-start', backgroundColor: colors.ember, color: colors.bg, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 14, fontSize: 13, fontWeight: '700', letterSpacing: 0.78, overflow: 'hidden' }}>VOIR MA STRATÉGIE →</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => go('/coach')}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.text3, marginBottom: 7 }}>SÉANCES SUGGÉRÉES · {dateLabel}</Text>
          {todayRun ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                {intensity ? <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: intensity.color }} /> : null}
                <Text style={{ fontSize: 24, fontWeight: '800', lineHeight: 26, color: colors.text, flex: 1 }}>{todayRun.title}</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.text2, marginTop: 5 }}>{[intensity?.label, `${todayRun.targetDurationMin} min`, todayRun.climbing ? 'côtes' : null].filter(Boolean).join('  ·  ')}</Text>
            </>
          ) : (
            <Text style={{ fontSize: 24, fontWeight: '800', lineHeight: 26, color: colors.status.rest }}>{todayRenfo ? "Pas de course aujourd'hui" : 'Repos'}</Text>
          )}
          {todayRenfo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, color: RENFO, backgroundColor: `${RENFO}28`, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8, overflow: 'hidden' }}>+ RENFO</Text>
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }}>{RENFO_FOCUS_SHORT[todayRenfo.focus] ?? todayRenfo.focus}</Text>
              {FOCUS_META[todayRenfo.focus]?.duration_min ? <Text style={{ fontSize: 11, color: colors.text3 }}>{FOCUS_META[todayRenfo.focus].duration_min} min</Text> : null}
              {todayRenfo.heavy ? <Text style={{ fontSize: 9, color: colors.ember, letterSpacing: 0.45 }}>LOURD</Text> : null}
            </View>
          ) : null}
        </Pressable>
      )}

      {targetRace && plan ? (
        <View style={{ marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
            <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 1, color: colors.text3 }}>CETTE SEMAINE</Text>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <Text style={{ fontSize: 11, color: colors.text3 }}><Text style={{ color: colors.ember, fontSize: 13, fontWeight: '700' }}>{planDoneCount}/{planSessions.length}</Text> séance{planSessions.length > 1 ? 's' : ''}</Text>
              <Text style={{ fontSize: 11, color: colors.text3 }}><Text style={{ color: RENFO, fontSize: 13, fontWeight: '700' }}>{renfoWeekCount}/{renfoWeeklyTarget}</Text> renfo</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {weekDays.map((d, i) => {
              const v = dayVisual(d)
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View style={{ width: '100%', height: 22, borderRadius: 5, backgroundColor: v.bg, borderWidth: 1.5, borderColor: v.border === 'transparent' ? v.bg : v.border }}>
                    {v.dot ? <View style={{ position: 'absolute', right: 2, bottom: 2, width: 6, height: 6, borderRadius: 999, backgroundColor: v.dot, borderWidth: 1, borderColor: colors.surf }} /> : null}
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: d.isToday ? '700' : '400', color: d.isToday ? colors.ember : colors.text3 }}>{d.letter}</Text>
                </View>
              )
            })}
          </View>
        </View>
      ) : null}
    </View>
  )
}
