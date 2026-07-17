import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { computeRaceProjection, type GpxPoint, type ProjectionResult } from './computeRaceProjection'
import { fetchRaceForecast } from './raceWeather'

// ─── Projection de course PARTAGÉE (page Stratégie ↔ dashboard). ──────────────
// Reproduit À L'IDENTIQUE le pipeline de RaceStrategyPage — mêmes queryKeys
// (cache TanStack commun), mêmes entrées, même ordre de passes :
//   1. projection de base (GPX + activités + profil)
//   2. re-projection avec surfaces (cache base) + précipitations (prévision)
// → le dashboard affiche EXACTEMENT le même chiffre que la stratégie.
// ⚠ Si le pipeline de RaceStrategyPage évolue (entrées, passes), répercuter ici.

export interface RaceForProjection {
  id: string
  date: string
  type: string | null
  goal_time: string | null
  start_time?: string | null
  gpx_data: GpxPoint[] | null
  surfaces?: unknown | null
}

export function useRaceProjection(race: RaceForProjection | null | undefined): ProjectionResult | null {
  const pts = Array.isArray(race?.gpx_data) && (race!.gpx_data as GpxPoint[]).length >= 2
    ? (race!.gpx_data as GpxPoint[])
    : null

  // Mêmes clés que la page Stratégie → une seule source de données pour les deux.
  const { data: activitiesData } = useQuery<Record<string, unknown>[]>({
    queryKey: ['activities-strategy'],
    enabled: !!pts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('*')
        .order('start_date', { ascending: false })
        .limit(150)
      if (error) throw error
      return (data ?? []) as Record<string, unknown>[]
    },
  })

  const { data: profileData } = useQuery<Record<string, unknown>>({
    queryKey: ['profile-strategy'],
    enabled: !!pts,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (error) return {}
      return (data ?? {}) as Record<string, unknown>
    },
  })

  // Passe 1 : projection de base (sans terrain) — sert aussi à borner la fenêtre météo.
  const baseProjection = useMemo<ProjectionResult | null>(() => {
    if (!pts || !activitiesData || !profileData || !race) return null
    try {
      return computeRaceProjection(pts, activitiesData, profileData, { type: race.type, goal_time: race.goal_time }, null, { smoothElevation: true })
    } catch {
      return null
    }
  }, [pts, activitiesData, profileData, race])

  const startPt = baseProjection?.points?.[0]
  const { data: forecast } = useQuery({
    queryKey: ['race-forecast', race?.id, race?.date, race?.start_time, baseProjection?.estTimeS, startPt?.lat, startPt?.lon],
    enabled: !!startPt && !!race?.date && !!baseProjection,
    staleTime: 30 * 60 * 1000,
    queryFn: () => fetchRaceForecast({
      lat: startPt!.lat, lon: startPt!.lon,
      dateISO: race!.date.slice(0, 10),
      startTime: race!.start_time ?? null,
      estDurationS: baseProjection!.estTimeS,
    }),
  })

  // Passe 2 : surfaces en cache (persistées par la stratégie) + précipitations.
  return useMemo<ProjectionResult | null>(() => {
    if (!baseProjection || !pts || !race) return null
    const cached = race.surfaces
    if (Array.isArray(cached) && cached.length === baseProjection.sections.length && (cached as (string | null)[]).some((s) => s != null)) {
      const weather = forecast?.available && forecast.precipMm != null ? { precip: forecast.precipMm } : undefined
      try {
        return computeRaceProjection(
          pts, activitiesData ?? [], profileData ?? {},
          { type: race.type, goal_time: race.goal_time },
          { surfaces: cached as (string | null)[], weather },
          { smoothElevation: true },
        )
      } catch {
        return baseProjection
      }
    }
    return baseProjection
  }, [baseProjection, pts, race, forecast, activitiesData, profileData])
}
