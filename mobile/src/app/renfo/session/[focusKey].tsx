import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, TextInput, Vibration, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useRunningDUPOverride } from '@/lib/coach/useRunningDUPOverride'
import { buildSession, applyDUP } from '@/lib/renfoProgram'
import ExerciseMedia, { HomeIcon, GymIcon } from '@/components/ExerciseMedia'
import { RENFO_EXERCISES as _RENFO_EXERCISES, FOCUS_META as _FOCUS_META, RENFO_FOCUS_COLORS as _RENFO_FOCUS_COLORS } from '@/lib/renfoData'
import {
  get4WeekPhase, applyDeloadModifiers,
  computeNextLoad, computeNextReps, calcE1rm, fmtRestTimer, todayStr,
  type ExerciseLog,
} from '@/lib/renfoUtils'
import BrandedLoader from '@/components/BrandedLoader'
import OneRMTestPopup from '@/components/coach/OneRMTestPopup'
import { Card, CLabel, MLabel, FL, SVal, SLbl, HButton, PrimaryButton, BackLink, colors, radius, space } from '@/components/coach/ui'

 
const RENFO_EXERCISES = _RENFO_EXERCISES as Record<string, any>
 
const FOCUS_META = _FOCUS_META as Record<string, any>
const RENFO_FOCUS_COLORS = _RENFO_FOCUS_COLORS as Record<string, string>

type Stage =
  | { stage: 'warmup' }
  | { stage: 'active'; exoIdx: number; setIdx: number }
  | { stage: 'rest'; nextExo: number; nextSet: number; secondsLeft: number; totalSeconds: number }
  | { stage: 'done' }

interface SetLog {
  exercise_id: string
  variant_id: string
  load_kg: number | null
  reps: number
  rpe: number
  e1rm: number | null
}

const DEFAULT_PROFILE = {
  objective_weight: 50,
  sessions_per_week: 3,
  has_gym_access: false,
  location_pref: 'maison',
  equipment: {},
}

const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
function fmtShortFr(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}

export default function RenfoSessionScreen() {
  const { focusKey } = useLocalSearchParams<{ focusKey: string }>()
  const { session: authSession } = useAuth()
  const userId = authSession?.user.id ?? null
  const router = useRouter()
  const scrollRef = useRef<ScrollView | null>(null)

  // ── Données ───────────────────────────────────────────────────────────────
   
  const [renfoProfile, setRenfoProfile] = useState<any>(null)
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([])
  const [maxLifts, setMaxLifts] = useState<{ exercise_id: string; one_rm: number }[]>([])
  const [maxLiftsFetched, setMaxLiftsFetched] = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase.from('renfo_profile').select('*').eq('user_id', userId).maybeSingle()
      .then(({ data }) => setRenfoProfile(data))
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    supabase.from('renfo_exercise_log')
      .select('session_date,exercise_id,load_kg,reps_completed,rpe,e1rm,completed_all_reps')
      .eq('user_id', userId).gte('session_date', cutoff).order('session_date', { ascending: false })
      .then(({ data }) => setExerciseLogs((data ?? []) as ExerciseLog[]))
    supabase.from('renfo_max_lifts').select('exercise_id,one_rm').eq('user_id', userId)
      .then(({ data }) => { setMaxLifts((data ?? []) as { exercise_id: string; one_rm: number }[]); setMaxLiftsFetched(true) })
  }, [userId])

  // 1RM : proposer le test de force si la séance est chargée et qu'aucun 1RM n'est posé.
  const [show1rm, setShow1rm] = useState(false)
  const [oneRmSeen, setOneRmSeen] = useState(false)
  useEffect(() => {
    if (focusKey === 'force_lourde' && maxLiftsFetched && maxLifts.length === 0 && !oneRmSeen) {
      setShow1rm(true)
      setOneRmSeen(true)
    }
  }, [focusKey, maxLiftsFetched, maxLifts.length, oneRmSeen])

  const dupOverride = useRunningDUPOverride()
  const phase = get4WeekPhase(dupOverride)

  // Lieu choisi pour CETTE séance → matériel (maison vs salle) → variantes. Mémorisé.
  const [location, setLocation] = useState<'maison' | 'salle'>('maison')
  useEffect(() => {
    AsyncStorage.getItem('vl-renfo-location').then((v) => { if (v === 'maison' || v === 'salle') setLocation(v) })
  }, [])
  useEffect(() => { AsyncStorage.setItem('vl-renfo-location', location) }, [location])

   
  const effectiveProfile = useMemo<any>(() => {
     
    const p: any = renfoProfile ?? DEFAULT_PROFILE
    const eqHome = p.equipment_home ?? p.equipment ?? {}
    const eqGym = p.equipment_gym ?? p.equipment ?? {}
    return { ...p, equipment: location === 'salle' ? eqGym : eqHome, has_gym_access: location === 'salle' }
  }, [renfoProfile, location])

   
  const sessionPlan = useMemo<any>(() => {
    if (!focusKey) return null
    try {
       
      let s: any = buildSession(focusKey, effectiveProfile)
      if (phase === 'deload') s = { ...s, exercises: applyDeloadModifiers(s.exercises) }
      else s = applyDUP(s)
      if (!s || !Array.isArray(s.exercises)) return { ...s, exercises: [], _buildError: 'exercises manquants' }
      return s
    } catch (err) {
      console.error('[RenfoSession] buildSession error for', focusKey, err)
      return { exercises: [], focus: focusKey, label: focusKey, duration_min: 30, timing_notes: [], _buildError: String(err) }
    }
  }, [focusKey, phase, effectiveProfile])

  const logsByExo = useMemo(() => {
    const map: Record<string, ExerciseLog[]> = {}
    for (const l of exerciseLogs) {
      if (!map[l.exercise_id]) map[l.exercise_id] = []
      map[l.exercise_id].push(l)
    }
    return map
  }, [exerciseLogs])

  const [stageState, setStageState] = useState<Stage>({ stage: 'warmup' })
  const [setLogs, setSetLogs] = useState<SetLog[]>([])
  const [load, setLoad] = useState<number | ''>('')
  const [reps, setReps] = useState<number>(0)
  const [rpe, setRpe] = useState<number>(8)
  const [sessionDate, setSessionDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const exoIdx = stageState.stage === 'active' ? stageState.exoIdx : -1
  const secondsLeft = stageState.stage === 'rest' ? stageState.secondsLeft : null

  useEffect(() => {
    if (exoIdx < 0 || !sessionPlan) return
     
    const exo: any = sessionPlan.exercises[exoIdx]
    if (!exo) return
    const exoLogs = logsByExo[exo.exercise_id] ?? []
    const suggested = computeNextLoad(exoLogs)
    setLoad(suggested !== null ? suggested : '')
    // Exos chargés → reps = cible (la progression passe par la charge). Non chargés → reps/durée.
    const isLoadExo = exo.load_type === 'external_kg'
    setReps(isLoadExo ? exo.reps : computeNextReps(exoLogs, exo.reps, exo.unit === 's'))
    setRpe(exo.target_rpe ?? 8)
  }, [exoIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Vibration de décompte (équivalent natif des bips sport du web) : 3 ticks + GO long.
  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 3 && secondsLeft > 0) Vibration.vibrate(60)
  }, [secondsLeft])

  const prevIsRestingRef = useRef(false)
  useEffect(() => {
    const isResting = stageState.stage === 'rest'
    if (prevIsRestingRef.current && !isResting && stageState.stage === 'active') Vibration.vibrate(220)
    prevIsRestingRef.current = isResting
  }, [stageState.stage])

  // Remonte en haut dès que la récup commence.
  useEffect(() => {
    if (stageState.stage === 'rest') scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [stageState.stage])

  useEffect(() => {
    if (stageState.stage !== 'rest') {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      setStageState((prev) => {
        if (prev.stage !== 'rest') return prev
        if (prev.secondsLeft <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return { stage: 'active', exoIdx: prev.nextExo, setIdx: prev.nextSet }
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 }
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [stageState.stage])

  function completeSet() {
    if (!sessionPlan || stageState.stage !== 'active') return
    const { exoIdx: ei, setIdx: si } = stageState
     
    const exo: any = sessionPlan.exercises[ei]
    const loadKg = typeof load === 'number' && load > 0 ? load : null
    const e1rm = loadKg && reps > 0 ? calcE1rm(loadKg, reps) : null
    setSetLogs((prev) => [...prev, { exercise_id: exo.exercise_id, variant_id: exo.variant_id, load_kg: loadKg, reps, rpe, e1rm }])
    const isLastSet = si >= exo.sets - 1
    const isLastExo = ei >= sessionPlan.exercises.length - 1
    if (isLastSet && isLastExo) {
      setStageState({ stage: 'done' })
    } else {
      const nextExo = isLastSet ? ei + 1 : ei
      const nextSet = isLastSet ? 0 : si + 1
      setStageState({ stage: 'rest', nextExo, nextSet, secondsLeft: exo.rest_seconds, totalSeconds: exo.rest_seconds })
    }
  }

  async function saveSession() {
    if (!sessionPlan || !userId) return
    setSaving(true); setSaveError(null)
    try {
      const exerciseInserts = setLogs.map((l) => {
         
        const targetReps = sessionPlan.exercises.find((e: any) => e.exercise_id === l.exercise_id)?.reps ?? 0
        return {
          user_id: userId, session_date: sessionDate, exercise_id: l.exercise_id, variant_id: l.variant_id,
          load_kg: l.load_kg, reps_completed: l.reps, reps_target: targetReps, rpe: l.rpe, e1rm: l.e1rm,
          completed_all_reps: l.reps >= targetReps,
        }
      })
      const { error: eErr } = await supabase.from('renfo_exercise_log').insert(exerciseInserts)
      if (eErr) throw eErr

      const maxE1rm: Record<string, number> = {}
      for (const l of setLogs) {
        if (l.e1rm && (!maxE1rm[l.exercise_id] || l.e1rm > maxE1rm[l.exercise_id])) maxE1rm[l.exercise_id] = l.e1rm
      }
      for (const [exId, oneRm] of Object.entries(maxE1rm)) {
        await supabase.from('renfo_max_lifts').upsert({
          user_id: userId, exercise_id: exId, one_rm: oneRm, is_estimated: true, recorded_at: new Date().toISOString(),
        })
      }

       
      const completedMap = Object.fromEntries(sessionPlan.exercises.map((e: any) => [e.exercise_id, true]))
      const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const dayKey = DAY_KEYS[new Date(sessionDate + 'T12:00:00').getDay()]
      // On met à jour une séance MANUELLE existante de ce type ce jour, sans écraser un
      // import Strava ; sinon on insère une nouvelle ligne (doubles séances autorisées).
      const { data: existingManual } = await supabase
        .from('renfo_session_log').select('id')
        .eq('user_id', userId).eq('session_date', sessionDate).eq('focus', focusKey!).is('source', null).limit(1)
      const existingId = existingManual?.[0]?.id
      const payload = { day_key: dayKey, duration_min: sessionPlan.duration_min, completed_exercises: completedMap }
      const { error: sErr } = existingId
        ? await supabase.from('renfo_session_log').update(payload).eq('id', existingId)
        : await supabase.from('renfo_session_log').insert({ user_id: userId, session_date: sessionDate, focus: focusKey!, ...payload })
      if (sErr) throw sErr
      router.push('/coach')
    } catch (err) {
      setSaveError((err as Error)?.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!sessionPlan) return <BrandedLoader />

  const meta = FOCUS_META[focusKey!] ?? {}
  const color: string = RENFO_FOCUS_COLORS[focusKey!] ?? colors.ember

  const wrap = (children: React.ReactNode) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>{children}</ScrollView>
    </SafeAreaView>
  )

  // Sélecteur de lieu (intro de séance) — pilote le matériel → les variantes.
  const locationToggle = (
    <Card style={{ marginBottom: 16 }}>
      <FL style={{ marginBottom: 8 }}>Où t’entraînes-tu aujourd’hui ?</FL>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['maison', 'salle'] as const).map((loc) => {
          const on = location === loc
          return (
            <HButton key={loc} onPress={() => setLocation(loc)} style={{ flex: 1, backgroundColor: on ? colors.ember : colors.surf2, borderColor: on ? colors.ember : colors.line2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {loc === 'maison' ? <HomeIcon color={on ? colors.bg : colors.text2} /> : <GymIcon color={on ? colors.bg : colors.text2} />}
                <Text style={{ color: on ? colors.bg : colors.text2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>{loc === 'maison' ? 'Maison' : 'Salle'}</Text>
              </View>
            </HButton>
          )
        })}
      </View>
      <Text style={{ marginTop: 6, fontSize: 10.5, color: colors.text3 }}>
        Variantes adaptées à ton matériel {location === 'salle' ? 'de salle' : 'à la maison'}. Configurable dans{' '}
        <Text style={{ color: colors.ember, textDecorationLine: 'underline' }} onPress={() => router.push('/renfo/equipment')}>Réglages équipement</Text>.
      </Text>
    </Card>
  )

  // ── Warmup : aucun exercice ────────────────────────────────────────────────
  if (stageState.stage === 'warmup' && sessionPlan.exercises.length === 0) {
    return wrap(
      <>
        <BackLink label="← Renfo" onPress={() => router.push('/coach')} />
        <CLabel style={{ marginBottom: 16, color }}>{meta.label ?? focusKey}</CLabel>
        {locationToggle}
        <Card style={{ borderLeftWidth: 3, borderLeftColor: colors.ember }}>
          <MLabel style={{ color: colors.ember, marginBottom: 4 }}>Aucun exercice disponible</MLabel>
          <Text style={{ fontSize: 10.5, color: colors.text3, marginTop: 4 }}>
            Aucune variante ne correspond à ton matériel {location === 'salle' ? 'de salle' : 'à la maison'}. Essaie l’autre lieu, ou ajoute du matériel dans{' '}
            <Text style={{ color: colors.ember, textDecorationLine: 'underline' }} onPress={() => router.push('/renfo/equipment')}>Réglages équipement</Text>.
          </Text>
          {sessionPlan._buildError ? (
            <Text style={{ fontSize: 10, color: colors.text3, marginTop: 4 }}>{sessionPlan._buildError}</Text>
          ) : null}
        </Card>
      </>,
    )
  }

  // ── Warmup : programme du jour ─────────────────────────────────────────────
  if (stageState.stage === 'warmup') {
    return wrap(
      <>
        <BackLink label="← Renfo" onPress={() => router.push('/coach')} />
        <CLabel style={{ marginBottom: 24, color }}>{meta.label ?? focusKey}</CLabel>

        {locationToggle}

        {focusKey === 'force_lourde' ? (
          <HButton label={`Calibrer ma force (test 1RM)${maxLifts.length === 0 ? ' — recommandé' : ''}`} onPress={() => setShow1rm(true)} style={{ marginBottom: 16, alignSelf: 'flex-start' }} />
        ) : null}
        <OneRMTestPopup open={show1rm} onClose={() => setShow1rm(false)} onSaved={() => {
          if (userId) supabase.from('renfo_max_lifts').select('exercise_id,one_rm').eq('user_id', userId).then(({ data }) => setMaxLifts((data ?? []) as { exercise_id: string; one_rm: number }[]))
        }} />

        {meta.warmup_text ? (
          <Card style={{ marginBottom: 16, borderLeftWidth: 3, borderLeftColor: color }}>
            <MLabel style={{ color, marginBottom: 6 }}>ÉCHAUFFEMENT</MLabel>
            <Text style={{ fontSize: 10.5, color: colors.text, lineHeight: 16 }}>{meta.warmup_text}</Text>
          </Card>
        ) : null}

        <Card style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.line, marginBottom: 16 }}>
            <View style={{ flex: 1, backgroundColor: colors.surf, padding: 14, alignItems: 'center', marginRight: 1 }}>
              <SVal>{sessionPlan.exercises.length}</SVal>
              <SLbl>Exercices</SLbl>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.surf, padding: 14, alignItems: 'center' }}>
              <SVal>{sessionPlan.duration_min} min</SVal>
              <SLbl>Durée</SLbl>
            </View>
          </View>
          {(meta.timing_notes ?? []).map((note: string, i: number) => (
            <Text key={i} style={{ fontSize: 10.5, color: colors.text3, marginBottom: 4 }}>{note}</Text>
          ))}
        </Card>

        <Card style={{ marginBottom: 24 }}>
          <FL style={{ marginBottom: 8 }}>Programme du jour</FL>
          { }
          {sessionPlan.exercises.map((exo: any, i: number) => {
            const ex = RENFO_EXERCISES[exo.exercise_id]
            const isHold = exo.unit === 's'
            const repsLabel = isHold ? `${exo.sets} × ${exo.reps}s tenir` : `${exo.sets}×${exo.reps} · RPE ${exo.target_rpe}`
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <ExerciseMedia exerciseId={exo.exercise_id} category={ex?.category ?? focusKey} variant="thumb" location={location} />
                <Text style={{ fontSize: 10.5, color: colors.text3, flex: 1 }} numberOfLines={2}>{ex?.name_fr ?? exo.exercise_id}</Text>
                <Text style={{ fontSize: 10.5, color: colors.text3 }}>{repsLabel}</Text>
              </View>
            )
          })}
        </Card>

        <PrimaryButton label="LANCER LA SÉANCE →" onPress={() => setStageState({ stage: 'active', exoIdx: 0, setIdx: 0 })} />
      </>,
    )
  }

  // ── Active ─────────────────────────────────────────────────────────────────
  if (stageState.stage === 'active') {
    const { exoIdx: ei, setIdx: si } = stageState
    const exo = sessionPlan.exercises[ei]
    const ex = RENFO_EXERCISES[exo.exercise_id]
     
    const variant = ex?.variants?.find((v: any) => v.id === exo.variant_id) ?? ex?.variants?.[0]
    const isLoadExo = exo.load_type === 'external_kg'
    const isHold = exo.unit === 's'
    const last = (logsByExo[exo.exercise_id] ?? [])[0]
    const lastPerf = last ? [
      last.load_kg ? `${last.load_kg} kg` : null,
      `${last.reps_completed ?? '?'}${isHold ? 's' : ' reps'}`,
      last.rpe ? `RPE ${last.rpe}` : null,
    ].filter(Boolean).join(' · ') : null
    const lastWhen = last?.session_date ? fmtShortFr(last.session_date) : null

    return wrap(
      <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <HButton label="← Quitter" onPress={() => router.push('/coach')} />
          <MLabel style={{ color: colors.text3 }}>{ei + 1}/{sessionPlan.exercises.length} · série {si + 1}/{exo.sets}</MLabel>
        </View>

        <View style={{ marginBottom: 16 }}>
          <ExerciseMedia exerciseId={exo.exercise_id} category={ex?.category ?? focusKey} variant="full" location={location} />
        </View>

        <Card style={{ borderLeftWidth: 3, borderLeftColor: color, marginBottom: 16 }}>
          <Text style={{ fontSize: 17.6, color, marginBottom: 4, fontWeight: '700' }}>{ex?.name_fr ?? exo.exercise_id}</Text>
          {variant ? <Text style={{ fontSize: 10.5, color: colors.text3, marginBottom: 6 }}>{variant.name}</Text> : null}
          {ex?.primary_muscles ? <Text style={{ fontSize: 10.5, color: colors.text3 }}>{ex.primary_muscles.join(' · ')}</Text> : null}
          {isHold ? (
            <View style={{ marginTop: 10, flexDirection: 'row', gap: 24 }}>
              <View>
                <MLabel style={{ color: colors.text3, marginBottom: 2 }}>CIBLE</MLabel>
                <Text style={{ fontSize: 32, lineHeight: 32, color: colors.text, fontWeight: '700' }}>{exo.reps}s <Text style={{ fontSize: 12 }}>TENIR</Text></Text>
              </View>
              <View>
                <MLabel style={{ color: colors.text3, marginBottom: 2 }}>CÔTÉ SUIVANT</MLabel>
                <Text style={{ fontSize: 32, lineHeight: 32, color: colors.text, fontWeight: '700' }}>{exo.rest_seconds}s</Text>
              </View>
            </View>
          ) : null}
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {isLoadExo ? (
              <View style={{ flex: 1 }}>
                <FL>Charge (kg)</FL>
                <TextInput
                  keyboardType="decimal-pad"
                  value={load === '' ? '' : String(load)}
                  onChangeText={(t) => setLoad(t === '' ? '' : Number(t.replace(',', '.')))}
                  style={{ padding: 8, fontSize: 18, backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: 6, color: colors.text }}
                />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <FL>{isHold ? 'Durée réelle (s)' : 'Répétitions'}</FL>
              <TextInput
                keyboardType="number-pad"
                value={String(reps)}
                onChangeText={(t) => setReps(Number(t) || 0)}
                style={{ padding: 8, fontSize: 18, backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: 6, color: colors.text }}
              />
            </View>
          </View>
          {lastPerf ? (
            <Text style={{ fontSize: 10.5, marginTop: 10, color: colors.text3 }}>
              Dernière fois{lastWhen ? ` (${lastWhen})` : ''} : <Text style={{ color: colors.text2, fontWeight: '700' }}>{lastPerf}</Text>
              {isLoadExo && last?.completed_all_reps && (last?.rpe ?? 9) <= 7 ? " — c'était facile, vise plus lourd" : ''}
            </Text>
          ) : null}
        </Card>

        <Card style={{ marginBottom: 24 }}>
          <FL style={{ marginBottom: 8 }}>RPE ressenti</FL>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[6, 7, 8, 9, 10].map((rv) => {
              const on = rpe === rv
              return (
                <HButton key={rv} label={String(rv)} onPress={() => setRpe(rv)}
                  style={{ flex: 1, backgroundColor: on ? color : colors.surf2, borderColor: on ? color : colors.line2 }}
                  textStyle={{ color: on ? colors.bg : colors.text2 }} />
              )
            })}
          </View>
        </Card>

        <PrimaryButton label={`SÉRIE ${si + 1}/${exo.sets} TERMINÉE ✓`} onPress={completeSet} />
      </>,
    )
  }

  // ── Rest ───────────────────────────────────────────────────────────────────
  if (stageState.stage === 'rest') {
    const { secondsLeft: sl, nextExo, nextSet, totalSeconds } = stageState
    const pct = Math.round((1 - sl / totalSeconds) * 100)
    const nextExoData = sessionPlan.exercises[nextExo]
    const nextEx = nextExoData ? RENFO_EXERCISES[nextExoData.exercise_id] : null

    return wrap(
      <>
        <CLabel style={{ marginBottom: 24 }}>RÉCUPÉRATION</CLabel>
        <Card style={{ alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 56, color, marginBottom: 12, fontWeight: '800' }}>{fmtRestTimer(sl)}</Text>
          <View style={{ backgroundColor: colors.surf2, borderRadius: 4, height: 8, width: '100%', marginBottom: 16, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
          </View>
          <Text style={{ fontSize: 10.5, color: colors.text3 }}>
            {nextEx ? `Prochain : ${nextEx.name_fr} — série ${nextSet + 1}` : 'Dernière récupération'}
          </Text>
        </Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <HButton label="+30s" onPress={() => setStageState((s) => s.stage === 'rest' ? { ...s, secondsLeft: s.secondsLeft + 30, totalSeconds: s.totalSeconds + 30 } : s)} style={{ flex: 1 }} />
          <PrimaryButton label="PASSER →" onPress={() => { if (timerRef.current) clearInterval(timerRef.current); setStageState({ stage: 'active', exoIdx: nextExo, setIdx: nextSet }) }} style={{ flex: 2 }} />
        </View>
      </>,
    )
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  const uniqueExos = new Set(setLogs.map((l) => l.exercise_id)).size
  const dateChoices: string[] = []
  for (let i = 6; i >= 0; i--) dateChoices.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))

  return wrap(
    <>
      <CLabel style={{ marginBottom: 24, color }}>SÉANCE TERMINÉE</CLabel>
      <Card style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.line }}>
          <View style={{ flex: 1, backgroundColor: colors.surf, padding: 14, alignItems: 'center', marginRight: 1 }}>
            <SVal>{uniqueExos}</SVal>
            <SLbl>Exercices</SLbl>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.surf, padding: 14, alignItems: 'center' }}>
            <SVal>{setLogs.length}</SVal>
            <SLbl>Séries</SLbl>
          </View>
        </View>
      </Card>
      <Card style={{ marginBottom: 24 }}>
        <FL style={{ marginBottom: 8 }}>Date de la séance</FL>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {dateChoices.map((d) => {
            const on = d === sessionDate
            return (
              <HButton key={d} label={d === todayStr() ? "Aujourd'hui" : fmtShortFr(d)} onPress={() => setSessionDate(d)}
                style={{ backgroundColor: on ? colors.ember : colors.surf2, borderColor: on ? colors.ember : colors.line2 }}
                textStyle={{ color: on ? colors.bg : colors.text2 }} />
            )
          })}
        </View>
      </Card>
      <PrimaryButton label={saving ? 'Enregistrement…' : 'CONFIRMER ET ENREGISTRER'} disabled={saving} onPress={saveSession} style={{ marginBottom: 8 }} />
      {saveError ? <Text style={{ fontSize: 10.5, color: colors.ember, marginTop: 8 }}>Erreur : {saveError}</Text> : null}
    </>,
  )
}
