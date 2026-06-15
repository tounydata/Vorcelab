import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useVLStore } from '../../store/vlStore'
import { generateTrainingPlan } from './planGenerator'
import { type CoachMotivation } from './motivation'
import { levelFromVdot, weaknessesFromRunnerProfile } from './profileSignals'
import { applyReplan } from './replan'
import { fuseRenfoIntoWeek } from './renfoFusion'
import type { RunnerProfileComputed } from '../runnerProfile'
import { deriveRunnerPaces, deriveAutoPrs } from '../runnerPaces'
import { buildFitnessAnchor } from '../criticalSpeed'
import { computeDailyPMC, computeACWR } from '../trainingLoad'
import type { LinkActivity } from '../../components/SessionFeedback'

// ─── Source de vérité UNIQUE du plan coach (CoachPage + dashboard). ───────────
// Toutes les queries partagent leurs clés : TanStack Query déduplique, le plan
// est identique partout, et chaque page n'affiche que ce qui la concerne.

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
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useCoachPlan(selectedRaceId: string | null = null) {
  const user = useVLStore((s) => s.user)

  const { data: races = [], isLoading } = useQuery<CoachRace[]>({
    queryKey: ['races'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id,name,date,distance,elevation,type,priority')
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as CoachRace[]
    },
  })

  const { data: profile = null } = useQuery<CoachProfileRow | null>({
    queryKey: ['profile-sessions'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('prs,vo2max,fc_max,runner_profile,coach_days_per_week,coach_motivation').eq('id', user!.id).maybeSingle()
      return (data ?? null) as CoachProfileRow | null
    },
  })

  const { data: activities = [] } = useQuery<LinkActivity[]>({
    queryKey: ['activities'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,strava_activity_id,name,moving_time,average_heartrate,sport_type,type,distance,total_elevation_gain,start_date,is_race,workout_type:raw_data->workout_type')
        .order('start_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as LinkActivity[]
    },
  })

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
  // Cible = choix manuel, sinon la prochaine course A (objectif principal),
  // sinon la prochaine course tout court.
  const targetRace = useMemo(
    () => upcoming.find((r) => r.id === selectedRaceId)
      ?? upcoming.find((r) => (r.priority ?? 'A') === 'A')
      ?? upcoming[0] ?? null,
    [upcoming, selectedRaceId],
  )
  // Courses secondaires (B/C) entre aujourd'hui et la cible → intégrées au plan.
  const secondaryRaces = useMemo(() => {
    if (!targetRace) return []
    return upcoming
      .filter((r) => r.id !== targetRace.id && r.date.slice(0, 10) < targetRace.date.slice(0, 10)
        && (r.priority === 'B' || r.priority === 'C'))
      .map((r) => ({ name: r.name, dateISO: r.date.slice(0, 10), priority: r.priority as 'B' | 'C' }))
  }, [upcoming, targetRace])

  // Profil réel → signaux d'adaptation : niveau (VDOT) + points faibles (runner_profile).
  // VDOT : PR manuels d'abord, complétés par les PR AUTO dérivés des courses étiquetées.
  const autoPrs = useMemo(() => deriveAutoPrs(activities as unknown as Parameters<typeof deriveAutoPrs>[0]), [activities])
  const runnerPaces = useMemo(
    () => deriveRunnerPaces({ ...(autoPrs ?? {}), ...((profile?.prs as Record<string, unknown>) ?? {}) }, profile?.vo2max),
    [autoPrs, profile?.prs, profile?.vo2max],
  )
  const vdot = runnerPaces?.vdot ?? 45

  // Ancre de forme consolidée (VMA + CS) : calibrage déterministe depuis l'historique,
  // réconcilié avec le seuil VDOT. (Le test demi-Cooper viendra l'affiner.)
  const fitnessAnchor = useMemo(() => {
    const merged = { ...(autoPrs ?? {}), ...((profile?.prs as Record<string, unknown>) ?? {}) }
    const efforts = Object.values(merged)
      .map((v) => v as { timeS?: number | null; dist?: number | null })
      .filter((v) => typeof v?.timeS === 'number' && typeof v?.dist === 'number' && v.timeS! > 0 && v.dist! >= 1000)
      .map((v) => ({ timeSec: v.timeS as number, distM: v.dist as number }))
    return buildFitnessAnchor({ efforts, vdotThresholdSecPerKm: runnerPaces?.thresholdSecPerKm ?? null })
  }, [autoPrs, profile?.prs, runnerPaces])
  const level = useMemo(() => levelFromVdot(vdot), [vdot])
  const weaknesses = useMemo(
    () => weaknessesFromRunnerProfile(profile?.runner_profile ?? null),
    [profile?.runner_profile],
  )

  // Charge chronique réelle (CTL/PMC) depuis les activités → calibre volume & prudence.
  const loadSignals = useMemo(() => {
    if (!activities.length) return { today: null, acwrRatio: null as number | null }
    const pmc = computeDailyPMC(activities, profile?.fc_max ?? null)
    const today = pmc.length ? pmc[pmc.length - 1] : null
    return { today, acwrRatio: computeACWR(pmc).ratio }
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
    })
  }, [targetRace, daysPerWeek, today, level, weaknesses, currentCTL, motivation, secondaryRaces, recentRace])

  // Replanification RÉACTIVE : la charge RÉELLE (ACWR/forme) ajuste la semaine courante.
  const replan = useMemo(
    () => (plan ? applyReplan(plan.weeks, { acwrRatio: loadSignals.acwrRatio, tsb: pmcToday?.tsb ?? null }) : null),
    [plan, loadSignals.acwrRatio, pmcToday?.tsb],
  )
  const displayWeeks = useMemo(() => replan?.weeks ?? plan?.weeks ?? [], [replan, plan])

  // Profil renfo (séances/sem.) → fusion du renforcement dans la semaine course.
  const { data: renfoProfile } = useQuery({
    queryKey: ['renfo-profile-coach', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('renfo_profile').select('sessions_per_week').eq('user_id', user!.id).maybeSingle()
      return data as { sessions_per_week?: number | null } | null
    },
  })
  const renfoFusion = useMemo(
    () => (displayWeeks[0] ? fuseRenfoIntoWeek(displayWeeks[0], renfoProfile?.sessions_per_week ?? null) : null),
    [displayWeeks, renfoProfile?.sessions_per_week],
  )

  return {
    isLoading,
    races, upcoming, targetRace, secondaryRaces,
    profile, activities,
    vdot, level, weaknesses, fitnessAnchor,
    loadSignals, pmcToday, currentCTL,
    daysPerWeek, motivation,
    plan, replan, displayWeeks, renfoFusion,
  }
}
