import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'
import { computeHydrationHabits, type HydrationHabits, type LoggedFueling } from './hydrationHabits'

// Charge les journaux de ravito du coureur (joints à la durée réelle de chaque
// sortie) et en dérive ses habitudes (débits mL/h, g/h). Source UNIQUE pour la
// stratégie de course et tout écran qui voudrait afficher les habitudes.
// Le calcul est le module PUR hydrationHabits (partagé web/mobile) ; seul le
// chargement (TanStack Query ici) est spécifique à la plateforme.

interface LogRow {
  fluid_ml: number | null
  carbs_g: number | null
  electrolytes: boolean | null
  activity: { moving_time: number | null } | { moving_time: number | null }[] | null
}

export function useHydrationHabits(): HydrationHabits {
  const user = useVLStore((s) => s.user)

  const { data: logs = [] } = useQuery<LoggedFueling[]>({
    queryKey: ['hydration-logs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_nutrition_log')
        .select('fluid_ml,carbs_g,electrolytes,activity:strava_activities(moving_time)')
      if (error) throw error
      return ((data ?? []) as LogRow[]).map((r) => {
        // La relation peut être renvoyée en objet ou en tableau selon la version.
        const act = Array.isArray(r.activity) ? r.activity[0] : r.activity
        return {
          durationS: act?.moving_time ?? 0,
          fluidMl: r.fluid_ml,
          carbsG: r.carbs_g,
          electrolytes: r.electrolytes,
        } as LoggedFueling
      })
    },
  })

  return useMemo(() => computeHydrationHabits(logs), [logs])
}
