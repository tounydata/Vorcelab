// Co-périodisation renfo ↔ course : déduit la phase DUP renfo à partir de la
// phase du plan course (prochaine course cible). Renvoie undefined s'il n'y a pas
// de course → le renfo retombe sur sa rotation 4 semaines autonome.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useVLStore } from '../../store/vlStore'
import { currentPlanPhase } from './planGenerator'
import { runningPhaseToDUP, type DUPPhase4 } from '../renfoUtils'

export function useRunningDUPOverride(): DUPPhase4 | undefined {
  const user = useVLStore((s) => s.user)
  const today = new Date().toISOString().slice(0, 10)

  const { data } = useQuery({
    queryKey: ['next-race-for-renfo', user?.id, today],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('race_calendar')
        .select('date,distance')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!data?.date) return null
      return { date: String(data.date).slice(0, 10), distance: (data.distance as number | null) ?? 0 }
    },
  })

  if (!data) return undefined
  return runningPhaseToDUP(currentPlanPhase(data.date, data.distance, today))
}
