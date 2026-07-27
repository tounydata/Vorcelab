import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { generateTrainingPlan } from './planGenerator'
import { courseDemandsFromPoints, type GpxDemandPoint } from './courseDemands'
import { type CoachMotivation } from './motivation'
import { levelFromVdot, weaknessesFromRunnerProfile } from './profileSignals'
import { applyReplan } from './replan'
import { fuseRenfoIntoWeek } from './renfoFusion'
import { computeCoPerioWarnings } from '../renfoUtils'
import type { RunnerProfileComputed } from '../runnerProfile'
import { deriveRunnerPaces, deriveAutoPrs } from '../runnerPaces'
import { buildFitnessAnchor } from '../criticalSpeed'
import { computeDailyPMC, computeACWR } from '../trainingLoad'
import type { LinkActivity } from '@/components/SessionFeedback'

// ─── Source de vérité UNIQUE du plan coach (CoachPage + dashboard). ───────────
// Portage mobile : mêmes calculs que le web (../../src/lib/coach/useCoachPlan),
// mais les requêtes TanStack Query sont remplacées par des loaders Supabase
// directs (pattern de l'app native). La logique métier est identique.

export interface CoachRace {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
  priority?: string | null
}

export interface CoachProfileRow {
  prs?: Record<string, unknown> | null
  vo2max?: number | null
  fc_max?: number | null
  runner_profile?: RunnerProfileComputed | null
  coach_days_per_week?: number | null
  coach_motivation?: string | null
  renfo_weekly_target?: number | null
  demi_cooper?: { distanceM?: number | null; dateISO?: string | null; skipped?: boolean } | null
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useCoachPlan(selectedRaceId: string | null = null) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null

  const [isLoading, setIsLoading] = useState(true)
  const [races, setRaces] = useState<CoachRace[]>([])
  const [profile, setProfile] = useState<CoachProfileRow | null>(null)
  const [activities, setActivities] = useState<LinkActivity[]>([])
  const [renfoProfile, setRenfoProfile] = useState<{ sessions_per_week?: number | null } | null>(null)

  const loadRaces = useCallback(async () => {
    const { data } = await supabase
      .from('race_calendar')
      .select('id,name,date,distance,elevation,type,priority')
      .order('date', { ascending: true })
    setRaces((data ?? []) as CoachRace[])
  }, [])

  const loadProfile = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('profiles')
      .select('prs,vo2max,fc_max,runner_profile,coach_days_per_week,coach_motivation,renfo_weekly_target,demi_cooper')
      .eq('id', userId)
      .maybeSingle()
    setProfile((data ?? null) as CoachProfileRow | null)
  }, [userId])

  const load = useCallback(async () => {
    const [, , { data: acts }, { data: renfo }] = await Promise.all([
      loadRaces(),
      loadProfile(),
      supabase
        .from('strava_activities')
        .select('id,strava_activity_id,name,moving_time,average_heartrate,sport_type,type,distance,total_elevation_gain,start_date,is_race,workout_type:raw_data->workout_type')
        .order('start_date', { ascending: false })
        .limit(100),
      userId
        ? supabase.from('renfo_profile').select('sessions_per_week').eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setActivities((acts ?? []) as LinkActivity[])
    setRenfoProfile((renfo ?? null) as { sessions_per_week?: number | null } | null)
  }, [loadRaces, loadProfile, userId])

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effet de chargement/reset/timer légitime (Expo, aucun data-loader framework) ; règle conservée en erreur pour le reste du code
    setIsLoading(true)
    load().finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [load])

  const today = todayISO()
  const upcoming = useMemo(
    () => races.filter((r) => r.date.slice(0, 10) >= today),
    [races, today],
  )
  // Dernière course TERMINÉE récente (≤ 35 j) avec une distance connue → bloc de
  // récupération post-course en début de plan (cf. postRaceRecovery).
  const recentRace = useMemo(() => {
    const past = races
      .filter((r) => r.date.slice(0, 10) < today && (r.distance ?? 0) > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
    const last = past[0]
    if (!last) return undefined
    const days = (Date.parse(today) - Date.parse(last.date.slice(0, 10))) / 86_400_000
    if (days > 35) return undefined
    return { dateISO: last.date.slice(0, 10), distanceKm: last.distance ?? 0, elevationM: last.elevation ?? 0 }
  }, [races, today])
  // Cible = choix manuel, sinon la prochaine course A, sinon la prochaine tout court.
  const targetRace = useMemo(
    () => upcoming.find((r) => r.id === selectedRaceId)
      ?? upcoming.find((r) => (r.priority ?? 'A') === 'A')
      ?? upcoming[0] ?? null,
    [upcoming, selectedRaceId],
  )
  // GPX de la course CIBLE → exigences du parcours (forme réelle : grande ascension,
  // descente technique, verticalité…). Chargé à part (le GPX peut être volumineux et
  // n'est pas dans la liste des courses). Absent → plan basé sur distance + D+ total.
  const [targetGpx, setTargetGpx] = useState<GpxDemandPoint[] | null>(null)
  useEffect(() => {
    let alive = true
    const id = targetRace?.id
    // Reset au changement de cible pour ne pas appliquer le GPX d'une autre course.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader natif (aucun data-loader framework) ; règle conservée en erreur ailleurs
    if (!id) { setTargetGpx(null); return }
    supabase.from('race_calendar').select('gpx_data').eq('id', id).maybeSingle()
      .then(({ data }) => { if (alive) setTargetGpx((data?.gpx_data ?? null) as GpxDemandPoint[] | null) })
    return () => { alive = false }
  }, [targetRace?.id])
  const courseDemands = useMemo(() => courseDemandsFromPoints(targetGpx), [targetGpx])

  // Courses secondaires (B/C) entre aujourd'hui et la cible → intégrées au plan.
  const secondaryRaces = useMemo(() => {
    if (!targetRace) return []
    return upcoming
      .filter((r) => r.id !== targetRace.id && r.date.slice(0, 10) < targetRace.date.slice(0, 10)
        && (r.priority === 'B' || r.priority === 'C'))
      .map((r) => ({ name: r.name, dateISO: r.date.slice(0, 10), priority: r.priority as 'B' | 'C' }))
  }, [upcoming, targetRace])

  // Profil réel → signaux d'adaptation : niveau (VDOT) + points faibles.
  const autoPrs = useMemo(() => deriveAutoPrs(activities as unknown as Parameters<typeof deriveAutoPrs>[0]), [activities])
  const runnerPaces = useMemo(
    () => deriveRunnerPaces({ ...(autoPrs ?? {}), ...((profile?.prs as Record<string, unknown>) ?? {}) }, profile?.vo2max),
    [autoPrs, profile?.prs, profile?.vo2max],
  )
  const vdot = runnerPaces?.vdot ?? 45

  // Ancre de forme consolidée (VMA + CS).
  const fitnessAnchor = useMemo(() => {
    const merged = { ...(autoPrs ?? {}), ...((profile?.prs as Record<string, unknown>) ?? {}) }
    const efforts = Object.values(merged)
      .map((v) => v as { timeS?: number | null; dist?: number | null })
      .filter((v) => typeof v?.timeS === 'number' && typeof v?.dist === 'number' && v.timeS! > 0 && v.dist! >= 1000)
      .map((v) => ({ timeSec: v.timeS as number, distM: v.dist as number }))
    const halfCooperDistanceM = profile?.demi_cooper?.distanceM ?? null
    return buildFitnessAnchor({ halfCooperDistanceM, efforts, vdotThresholdSecPerKm: runnerPaces?.thresholdSecPerKm ?? null })
  }, [autoPrs, profile?.prs, profile?.demi_cooper, runnerPaces])
  const level = useMemo(() => levelFromVdot(vdot), [vdot])
  const weaknesses = useMemo(
    () => weaknessesFromRunnerProfile(profile?.runner_profile ?? null),
    [profile?.runner_profile],
  )

  // Charge chronique réelle (CTL/PMC) depuis les activités → calibre volume & prudence.
  const loadSignals = useMemo(() => {
    if (!activities.length) return { today: null, acwrRatio: null as number | null }
    const pmc = computeDailyPMC(activities, profile?.fc_max ?? null)
    const tdy = pmc.length ? pmc[pmc.length - 1] : null
    return { today: tdy, acwrRatio: computeACWR(pmc).ratio }
  }, [activities, profile?.fc_max])
  const pmcToday = loadSignals.today
  const currentCTL = pmcToday?.ctl ?? null

  const daysPerWeek = profile?.coach_days_per_week ?? 5
  const motivation = (profile?.coach_motivation ?? 'mix') as CoachMotivation

  const plan = useMemo(() => {
    if (!targetRace) return null
    return generateTrainingPlan({
      raceName: targetRace.name,
      raceDateISO: targetRace.date.slice(0, 10),
      raceDistanceKm: targetRace.distance ?? 0,
      raceElevationM: targetRace.elevation ?? 0,
      raceType: targetRace.type,
      todayISO: today,
      daysPerWeek,
      currentCTL,
      level,
      weaknesses,
      motivation,
      secondaryRaces,
      recentRace,
      courseDemands,
    })
  }, [targetRace, daysPerWeek, today, level, weaknesses, currentCTL, motivation, secondaryRaces, recentRace, courseDemands])

  // Replanification RÉACTIVE : la charge RÉELLE (ACWR/forme) ajuste la semaine courante.
  const replan = useMemo(
    () => (plan ? applyReplan(plan.weeks, { acwrRatio: loadSignals.acwrRatio, tsb: pmcToday?.tsb ?? null }) : null),
    [plan, loadSignals.acwrRatio, pmcToday?.tsb],
  )
  const displayWeeks = useMemo(() => replan?.weeks ?? plan?.weeks ?? [], [replan, plan])

  // Nombre de renfo/sem. = objectif RÉGLAGES → repli profil renfo → défaut 3.
  const renfoSessionsPerWeek = profile?.renfo_weekly_target ?? renfoProfile?.sessions_per_week ?? 3
  // Co-périodisation (fatigue récente) → focus à éviter cette semaine.
  const renfoAvoid = useMemo(
    () => new Set(computeCoPerioWarnings(activities as Parameters<typeof computeCoPerioWarnings>[0]).flatMap((w) => w.avoid)),
    [activities],
  )
  const renfoFusion = useMemo(
    () => (displayWeeks[0] ? fuseRenfoIntoWeek(displayWeeks[0], renfoSessionsPerWeek, renfoAvoid) : null),
    [displayWeeks, renfoSessionsPerWeek, renfoAvoid],
  )

  return {
    isLoading,
    races, upcoming, targetRace, secondaryRaces,
    profile, activities,
    vdot, level, weaknesses, fitnessAnchor,
    loadSignals, pmcToday, currentCTL,
    daysPerWeek, motivation, courseDemands,
    plan, replan, displayWeeks, renfoFusion, renfoSessionsPerWeek,
    reload: load, reloadRaces: loadRaces, reloadProfile: loadProfile,
  }
}
