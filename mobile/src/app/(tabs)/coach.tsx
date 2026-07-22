import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { allocatePhases, PHASE_LABELS } from '@/lib/coach/planGenerator'
import { getWorkout, type Phase } from '@/lib/coach/workouts'
import { computeAdjustment, scaleWorkout, nextQualityWorkoutId, type ModulationDir } from '@/lib/coach/sessionModulation'
import { structureWorkout } from '@/lib/coach/structureWorkout'
import { listSessionLog, type SessionLogRow } from '@/lib/coach/sessionLog'
import { useCoachPlan } from '@/lib/coach/useCoachPlan'
import CalibrationPopup from '@/components/coach/CalibrationPopup'
import WeekProgram, { type HistoryWeek } from '@/components/WeekProgram'
import SessionAdaptationSplash from '@/components/SessionAdaptationSplash'
import BrandedLoader from '@/components/BrandedLoader'
import { Card } from '@/components/coach/ui'
import { colors, font, radius, space } from '@/lib/theme'

const PHASE_COLORS: Record<Phase, string> = {
  base: colors.growth,
  build: colors.amber,
  specific: colors.ember,
  taper: colors.status.rest, // audit 21/07 : bleu hors-thème → ton rest du thème
  race: colors.text,
}

/** rgba à partir d'un hex (#rgb/#rrggbb) — pour les fonds translucides (color-mix web). */
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Lundi (ISO) de la semaine contenant une date donnée. */
function mondayOfISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const day = (d.getDay() + 6) % 7 // 0 = lundi
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

/** Durée de prépa « pleine » de référence selon la distance. */
function standardPrepWeeks(distanceKm: number): number {
  if (distanceKm >= 42) return 16
  if (distanceKm >= 21) return 12
  if (distanceKm >= 10) return 10
  return 8
}

/** Forme de la charge par phase (0..1). */
function phaseShape(phase: Phase, k: number, len: number): number {
  const f = len > 1 ? k / (len - 1) : 0.5
  switch (phase) {
    case 'base': return 0.50 + 0.25 * f
    case 'build': return 0.78 + 0.18 * f
    case 'specific': return 0.97 + 0.03 * f
    case 'taper': return 0.72 - 0.32 * f
    case 'race': return 0.20
  }
}

/** Graphe de périodisation : prépa complète (passé → en cours → à venir),
 *  arc de charge + dégradé, comme la maquette. */
function PeriodizationArc({ weeks, weeksToRace, distanceKm }: {
  weeks: { phase: Phase }[]
  weeksToRace: number
  distanceKm: number
}) {
  if (weeks.length === 0) return null

  const fullWeeks = Math.max(weeksToRace, standardPrepWeeks(distanceKm))
  const weeksDone = Math.max(0, fullWeeks - weeksToRace)
  const pastPhases: Phase[] = allocatePhases(fullWeeks, distanceKm).slice(0, weeksDone)
  const fullPhases: Phase[] = [...pastPhases, ...weeks.map((x) => x.phase)]
  const boundary = pastPhases.length

  type Run = { phase: Phase; start: number; len: number; isPast: boolean; isCurrent: boolean }
  const runs: Run[] = []
  fullPhases.forEach((ph, i) => {
    const last = runs[runs.length - 1]
    if (last && last.phase === ph) last.len += 1
    else runs.push({ phase: ph, start: i, len: 1, isPast: false, isCurrent: false })
  })
  runs.forEach((r) => {
    const end = r.start + r.len - 1
    r.isCurrent = r.start <= boundary && boundary <= end
    r.isPast = end < boundary
  })

  const vols: number[] = []
  runs.forEach((r) => { for (let k = 0; k < r.len; k++) vols.push(phaseShape(r.phase, k, r.len)) })
  const n = vols.length
  const W = 900, H = 92, PAD = 8
  const xAt = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W)
  const yAt = (v: number) => H - PAD - v * (H - PAD * 2)
  const pts = vols.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
  const line = `M${pts.join(' L')}`
  const area = `${line} L${xAt(n - 1).toFixed(1)},${H} L${xAt(0).toFixed(1)},${H} Z`

  return (
    <View style={{ marginBottom: 20 }}>
      <Svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 92 }}>
        <Defs>
          <LinearGradient id="periG" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={colors.ember} stopOpacity={0.34} />
            <Stop offset="1" stopColor={colors.ember} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#periG)" />
        <Path d={line} fill="none" stroke={colors.ember} strokeWidth={2} strokeLinejoin="round" />
        {boundary > 0 && boundary < n ? (
          <>
            <Line x1={xAt(boundary)} y1={0} x2={xAt(boundary)} y2={H} stroke={colors.text} strokeWidth={0.7} strokeDasharray="3 3" opacity={0.55} />
            <Circle cx={xAt(boundary)} cy={yAt(vols[boundary])} r={4} fill={colors.text} />
          </>
        ) : null}
        <Circle cx={xAt(n - 1)} cy={yAt(vols[n - 1])} r={4} fill={colors.growth2} />
      </Svg>
      {/* Légende = barre connectée colorée par phase */}
      <View style={{ flexDirection: 'row', marginTop: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 8, overflow: 'hidden' }}>
        {runs.map((r, i) => {
          const color = PHASE_COLORS[r.phase]
          const sub = r.phase === 'race' ? 'jour J' : `${r.len} sem.${r.isCurrent ? ' · en cours' : r.isPast ? ' · faite' : ''}`
          return (
            <View key={i} style={{
              flex: r.len, minWidth: 0, paddingVertical: 8, paddingHorizontal: 10,
              borderRightWidth: i < runs.length - 1 ? 1 : 0, borderRightColor: colors.line,
              backgroundColor: r.isCurrent ? hexToRgba(color, 0.14) : 'transparent',
              opacity: r.isPast ? 0.78 : 1,
            }}>
              <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.54, color }}>
                {PHASE_LABELS[r.phase]}{r.isCurrent ? ' ◂ ici' : ''}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 9, color: colors.text3, marginTop: 2 }}>{sub}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function fmtRaceDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${FR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export default function CoachScreen() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const router = useRouter()
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null)
  const [racePickerOpen, setRacePickerOpen] = useState(false)

  // Source de vérité unique du plan (partagée avec le dashboard).
  const {
    isLoading, upcoming, targetRace,
    profile, activities,
    vdot,
    plan, replan, displayWeeks, renfoSessionsPerWeek,
    reloadRaces, reloadProfile,
  } = useCoachPlan(selectedRaceId)

  const [savingPriority, setSavingPriority] = useState(false)
  const [savingDemiCooper, setSavingDemiCooper] = useState(false)

  // Priorité de la course cible (A = principal, B = secondaire, C = rodage).
  async function setPriority(id: string, p: string) {
    setSavingPriority(true)
    await supabase.from('race_calendar').update({ priority: p }).eq('id', id)
    await reloadRaces()
    setSavingPriority(false)
  }

  // Test demi-Cooper (6 min) → calibre la VMA/CS.
  async function saveDemiCooper(distanceM: number) {
    if (!userId) return
    setSavingDemiCooper(true)
    await supabase.from('profiles')
      .update({ demi_cooper: { distanceM, dateISO: new Date().toISOString().slice(0, 10) } })
      .eq('id', userId)
    await reloadProfile()
    setSavingDemiCooper(false)
  }

  // « Plus tard » → on persiste le report CÔTÉ SERVEUR (refaisable en LABO).
  async function skipDemiCooper() {
    if (!userId) return
    await supabase.from('profiles')
      .update({ demi_cooper: { skipped: true, dateISO: new Date().toISOString().slice(0, 10) } })
      .eq('id', userId)
    await reloadProfile()
  }

  // ── Journal des séances + dernier verdict (modulation v3) ──
  const [sessionLogs, setSessionLogs] = useState<SessionLogRow[]>([])
  const latestVerdict = useMemo(
    () => (sessionLogs[0] ? { id: sessionLogs[0].id, verdict: sessionLogs[0].verdict } : null),
    [sessionLogs],
  )

  const loadLogs = useCallback(async () => {
    if (!userId) { setSessionLogs([]); return }
    setSessionLogs(await listSessionLog(120))
  }, [userId])

  useEffect(() => { loadLogs() }, [loadLogs])

  function onSessionSaved() { loadLogs() }

  // Semaines passées reconstruites depuis le journal (navigation arrière).
  const pastWeeks = useMemo<HistoryWeek[]>(() => {
    const currentStart = plan?.weeks[0]?.weekStartISO
    if (!currentStart) return []
    const byWeek = new Map<string, HistoryWeek['done']>()
    for (const l of sessionLogs) {
      const wk = mondayOfISO(l.planned_date)
      if (wk >= currentStart) continue
      const arr = byWeek.get(wk) ?? []
      arr.push({
        workoutId: l.planned_workout_id,
        workoutName: getWorkout(l.planned_workout_id)?.name ?? l.planned_workout_id,
        date: l.planned_date,
        verdict: l.verdict,
      })
      byWeek.set(wk, arr)
    }
    return [...byWeek.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStartISO, done]) => ({ weekStartISO, done: done.sort((x, y) => x.date.localeCompare(y.date)) }))
  }, [plan, sessionLogs])

  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (!latestVerdict) { setDismissed(false); return }
    AsyncStorage.getItem('vl-modul-dismiss').then((v) => setDismissed(v === latestVerdict.id))
  }, [latestVerdict])

  // Cible : la 1re séance qualité de la semaine courante est adaptée selon le verdict.
  const modulation = useMemo(() => {
    if (!plan || !latestVerdict || dismissed) return null
    if (replan?.trigger) return null
    const adj = computeAdjustment(latestVerdict.verdict)
    if (adj.direction === 'none') return null
    const week0 = plan.weeks[0]
    if (!week0 || week0.phase === 'taper' || week0.phase === 'race') return null
    const workoutId = nextQualityWorkoutId(week0.sessions)
    const t = workoutId ? getWorkout(workoutId) : null
    if (!workoutId || !t) return null
    const { summary } = scaleWorkout(structureWorkout(t, vdot), adj.direction)
    return { workoutId, dir: adj.direction as ModulationDir, reason: adj.reason, summary, title: t.name }
  }, [plan, latestVerdict, dismissed, vdot, replan?.trigger])

  const [splash, setSplash] = useState(false)
  useEffect(() => {
    if (!modulation || !latestVerdict) return
    AsyncStorage.getItem('vl-modul-splash').then((v) => {
      if (v !== latestVerdict.id) {
        AsyncStorage.setItem('vl-modul-splash', latestVerdict.id)
        setSplash(true)
      }
    })
  }, [modulation, latestVerdict])

  // Splash « régénération » quand la replanif réactive change la semaine.
  const [replanSplash, setReplanSplash] = useState(false)
  useEffect(() => {
    const wk = plan?.weeks[0]?.weekStartISO
    if (!replan?.trigger || !wk) return
    const key = `${wk}:${replan.trigger}`
    AsyncStorage.getItem('vl-replan-splash').then((v) => {
      if (v !== key) {
        AsyncStorage.setItem('vl-replan-splash', key)
        setReplanSplash(true)
      }
    })
  }, [replan?.trigger, plan])

  function cancelModulation() {
    if (latestVerdict) AsyncStorage.setItem('vl-modul-dismiss', latestVerdict.id)
    setDismissed(true)
  }

  if (isLoading) {
    return <BrandedLoader />
  }

  if (!targetRace || !plan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
          <Text style={{ fontSize: 30, fontFamily: font.display, letterSpacing: 0.5, color: colors.text, marginBottom: 16 }}>COACH</Text>
          <Card style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.68, fontWeight: '600', marginBottom: 12 }}>Aucune course à venir</Text>
            <Text style={{ color: colors.text2, fontSize: 14, marginBottom: 16, textAlign: 'center', lineHeight: 20 }}>
              Ajoute une course cible dans ton calendrier et le Coach construira ton plan vers le jour J.
            </Text>
            <Pressable
              onPress={() => router.push('/race')}
              style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.surf2 }}
            >
              <Text style={{ color: colors.text2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>→ Calendrier</Text>
            </Pressable>
          </Card>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Cap sur le jour J (héros) ──
  const raceDate = new Date(plan.race.dateISO + 'T00:00:00')
  const daysLeft = Math.max(0, Math.ceil((raceDate.getTime() - Date.now()) / 86_400_000))
  const currentPhase: Phase = plan.weeks[0]?.phase ?? 'base'
  const isPostRaceRecov = !!plan.weeks[0]?.isPostRaceRecovery
  const currentPhaseLabel = isPostRaceRecov ? 'RÉCUP' : PHASE_LABELS[currentPhase]
  const currentPhaseColor = isPostRaceRecov ? colors.status.rest : PHASE_COLORS[currentPhase]

  const metaLine =
    `${fmtRaceDate(plan.race.dateISO)}` +
    `${plan.race.distanceKm > 0 ? ` · ${plan.race.distanceKm} km` : ''}` +
    `${plan.race.elevationM > 0 ? ` · ${plan.race.elevationM} m D+` : ''}` +
    ` · ${plan.race.isTrail ? 'TRAIL' : 'ROUTE'}` +
    ` · ${plan.daysPerWeek} j/sem.`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }}>
        {splash ? <SessionAdaptationSplash message="J'ajuste ta prochaine séance selon ton dernier ressenti." onDone={() => setSplash(false)} /> : null}
        {replanSplash ? <SessionAdaptationSplash message="Je régénère ton plan selon ta charge réelle…" onDone={() => setReplanSplash(false)} /> : null}

        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <Text style={{ fontSize: 30, fontFamily: font.display, letterSpacing: 0.5, color: colors.text }}>COACH</Text>
          <Text style={{ fontSize: 10, color: colors.text3 }}>
            {plan.weeksToRace} semaine{plan.weeksToRace > 1 ? 's' : ''} avant le jour J
          </Text>
        </View>

        {/* ── 1 · HÉROS : cap sur le jour J ── */}
        <View style={{
          borderWidth: 1, borderColor: colors.line2, borderRadius: radius.lg,
          backgroundColor: colors.surf, paddingVertical: 22, paddingHorizontal: 24, marginBottom: 24, overflow: 'hidden',
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 22, flexWrap: 'wrap' }}>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: colors.ember, fontWeight: '600' }}>Course visée · cap sur le jour J</Text>
              {upcoming.length > 1 ? (
                <Pressable
                  onPress={() => setRacePickerOpen(true)}
                  style={{ marginVertical: 6, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line2, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                >
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 22, fontFamily: font.display, letterSpacing: 0.2, textTransform: 'uppercase', color: colors.text }}>{targetRace.name}</Text>
                  <Text style={{ color: colors.text2, fontSize: 16 }}>▾</Text>
                </Pressable>
              ) : (
                <Text style={{ fontSize: 34, fontFamily: font.displayBlack, textTransform: 'uppercase', letterSpacing: 0.34, marginVertical: 8, color: colors.text }}>{targetRace.name}</Text>
              )}
              <Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 0.33 }}>{metaLine}</Text>

              {/* Priorité A/B/C de la course */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 9, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.text3 }}>Objectif</Text>
                <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, overflow: 'hidden' }}>
                  {(['A', 'B', 'C'] as const).map((p) => {
                    const on = (targetRace.priority ?? 'A') === p
                    const lbl = p === 'A' ? 'Principal' : p === 'B' ? 'Secondaire' : 'Rodage'
                    return (
                      <Pressable
                        key={p}
                        onPress={() => { if (!on && !savingPriority) setPriority(targetRace.id, p) }}
                        hitSlop={6}
                        style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 12, backgroundColor: on ? colors.ember : colors.surf2 }}
                      >
                        <Text style={{ color: on ? colors.bg : colors.text2, fontFamily: font.monoSemiBold, fontSize: 10, letterSpacing: 0.57 }}>{p} · {lbl}</Text>
                      </Pressable>
                    )
                  })}
                </View>
                <Text style={{ fontSize: 10, color: colors.text2, lineHeight: 15, marginTop: 4, maxWidth: 300 }}>
                  A = objectif majeur (le plan vise cette course) · B = test en conditions réelles · C = entraînement déguisé.
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 56, fontFamily: font.displayBlack, color: colors.ember }}>{daysLeft}</Text>
              <Text style={{ fontSize: 9.5, fontFamily: font.monoSemiBold, letterSpacing: 1.7, textTransform: 'uppercase', color: colors.text3, marginTop: 2 }}>jours</Text>
              <Text style={{ fontSize: 10, fontFamily: font.monoSemiBold, letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, color: currentPhaseColor }}>▸ {currentPhaseLabel}</Text>
            </View>
          </View>

          {/* Frise de périodisation */}
          <View style={{ marginTop: 16 }}>
            <PeriodizationArc weeks={plan.weeks} weeksToRace={plan.weeksToRace} distanceKm={plan.race.distanceKm} />
          </View>
        </View>

        {/* Calibrage VMA (demi-Cooper) proposé une fois par objectif. */}
        <CalibrationPopup show={!!profile && !profile.demi_cooper} saving={savingDemiCooper} onSave={saveDemiCooper} onSkip={skipDemiCooper} />

        {/* ── CETTE SEMAINE ── */}
        <View style={{ marginTop: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 19, fontWeight: '800', letterSpacing: 0.38, textTransform: 'uppercase', color: colors.text }}>Cette semaine</Text>
        </View>

        {replan?.trigger ? (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: replan.trigger === 'surcharge' ? colors.ember : colors.status.watch, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16 }}>
            <Text style={{ fontSize: 9, letterSpacing: 0.72, textTransform: 'uppercase', color: replan.trigger === 'surcharge' ? colors.ember : colors.status.watch, fontWeight: '700', marginBottom: 4 }}>{replan.badge}</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.text2 }}>{replan.reason}</Text>
          </Card>
        ) : null}

        {modulation ? (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.ember, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.text2 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{modulation.dir === 'lighten' ? `${modulation.title} allégée` : `${modulation.title} renforcée`}</Text>
              {' — '}{modulation.reason}.{' '}
              <Text style={{ fontSize: 11, color: colors.text }}>{modulation.summary}</Text>
            </Text>
            <Pressable onPress={cancelModulation} hitSlop={12} style={{ minHeight: 32, justifyContent: 'center', paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.surf2 }}>
              <Text style={{ color: colors.text2, fontSize: 10, fontWeight: '600', letterSpacing: 0.8 }}>Annuler</Text>
            </Pressable>
          </Card>
        ) : null}

        <WeekProgram
          weeks={displayWeeks}
          vdot={vdot}
          activities={activities}
          fcMax={profile?.fc_max}
          scale={modulation ? { workoutId: modulation.workoutId, dir: modulation.dir } : undefined}
          logs={sessionLogs}
          onSaved={onSessionSaved}
          pastWeeks={pastWeeks}
          renfoSessionsPerWeek={renfoSessionsPerWeek}
        />

        <Text style={{ fontSize: 10, color: colors.text3, marginTop: 16, lineHeight: 16 }}>
          Les séances sont une <Text style={{ fontWeight: '700' }}>proposition</Text> : tu restes libre de ton calendrier et de ton choix.
          Le renforcement est <Text style={{ fontWeight: '700' }}>intégré à ta semaine</Text> et co-périodisé avec ta course.
        </Text>
      </ScrollView>

      {/* Sélecteur de course cible (≥ 2 courses à venir) */}
      <Modal transparent visible={racePickerOpen} animationType="fade" onRequestClose={() => setRacePickerOpen(false)}>
        <Pressable onPress={() => setRacePickerOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={() => {}}>
            <Card>
              <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.68, fontWeight: '600', marginBottom: 12 }}>Choisir la course visée</Text>
              {upcoming.map((r) => {
                const on = r.id === targetRace.id
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => { setSelectedRaceId(r.id); setRacePickerOpen(false) }}
                    style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}
                  >
                    <Text style={{ color: on ? colors.ember : colors.text, fontSize: 15, fontWeight: on ? '800' : '600' }} numberOfLines={1}>{r.name}</Text>
                    <Text style={{ color: colors.text3, fontSize: 11, marginTop: 2 }}>{fmtRaceDate(r.date.slice(0, 10))}</Text>
                  </Pressable>
                )
              })}
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
