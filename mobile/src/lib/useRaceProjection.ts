import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { computeRaceProjection, type GpxPoint, type ProjectionResult } from './computeRaceProjection'
import { fetchRaceForecast } from './raceWeather'

// ─── Projection de course PARTAGÉE (page Stratégie ↔ dashboard). ──────────────
// Portage mobile : mêmes entrées et mêmes 2 passes que le web (loaders Supabase
// directs au lieu de TanStack Query) → le dashboard affiche le même chiffre que
// la stratégie.

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
  const pts = Array.isArray(race?.gpx_data) && (race!.gpx_data as GpxPoint[]).length >= 2 ? (race!.gpx_data as GpxPoint[]) : null

  const [activitiesData, setActivitiesData] = useState<Record<string, unknown>[] | null>(null)
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null)
  const [forecast, setForecast] = useState<Awaited<ReturnType<typeof fetchRaceForecast>> | null>(null)

  useEffect(() => {
    if (!pts) return
    supabase.from('strava_activities').select('*').order('start_date', { ascending: false }).limit(150).then(({ data }) => setActivitiesData((data ?? []) as Record<string, unknown>[]))
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setProfileData({}); return }
      supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => setProfileData((data ?? {}) as Record<string, unknown>))
    })
  }, [pts])

  const baseProjection = useMemo<ProjectionResult | null>(() => {
    if (!pts || !activitiesData || !profileData || !race) return null
    try { return computeRaceProjection(pts, activitiesData, profileData, { type: race.type, goal_time: race.goal_time }, null, { smoothElevation: true }) } catch { return null }
  }, [pts, activitiesData, profileData, race])

  const startPt = baseProjection?.points?.[0]
  useEffect(() => {
    if (!startPt || !race?.date || !baseProjection) return
    fetchRaceForecast({ lat: startPt.lat, lon: startPt.lon, dateISO: race.date.slice(0, 10), startTime: race.start_time ?? null, estDurationS: baseProjection.estTimeS }).then(setForecast).catch(() => {})
  }, [startPt, race?.date, race?.start_time, baseProjection])

  return useMemo<ProjectionResult | null>(() => {
    if (!baseProjection || !pts || !race) return null
    const cached = race.surfaces
    if (Array.isArray(cached) && cached.length === baseProjection.sections.length && (cached as (string | null)[]).some((s) => s != null)) {
      const weather = forecast?.available && forecast.precipMm != null ? { precip: forecast.precipMm } : undefined
      try {
        return computeRaceProjection(pts, activitiesData ?? [], profileData ?? {}, { type: race.type, goal_time: race.goal_time }, { surfaces: cached as (string | null)[], weather }, { smoothElevation: true })
      } catch { return baseProjection }
    }
    return baseProjection
  }, [baseProjection, pts, race, forecast, activitiesData, profileData])
}
