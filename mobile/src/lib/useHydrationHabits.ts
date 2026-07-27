import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { computeHydrationHabits, type HydrationHabits, type LoggedFueling } from './hydrationHabits'

// Portage mobile de useHydrationHabits : mêmes habitudes apprises (module PUR
// hydrationHabits partagé), chargement via loader Supabase natif (au lieu de
// TanStack Query web). Personnalise la stratégie de course à partir des ravitos
// loggés (débits mL/h, g/h).

interface LogRow {
  fluid_ml: number | null
  carbs_g: number | null
  electrolytes: boolean | null
  activity: { moving_time: number | null } | { moving_time: number | null }[] | null
}

export function useHydrationHabits(): HydrationHabits {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [logs, setLogs] = useState<LoggedFueling[]>([])

  useEffect(() => {
    let alive = true
    if (!userId) return
    supabase
      .from('activity_nutrition_log')
      .select('fluid_ml,carbs_g,electrolytes,activity:strava_activities(moving_time)')
      .then(({ data }) => {
        if (!alive) return
        const rows = (data ?? []) as LogRow[]
        setLogs(rows.map((r) => {
          const act = Array.isArray(r.activity) ? r.activity[0] : r.activity
          return {
            durationS: act?.moving_time ?? 0,
            fluidMl: r.fluid_ml,
            carbsG: r.carbs_g,
            electrolytes: r.electrolytes,
          } as LoggedFueling
        }))
      })
    return () => { alive = false }
  }, [userId])

  return useMemo(() => computeHydrationHabits(logs), [logs])
}
