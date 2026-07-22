// Co-périodisation renfo ↔ course : déduit la phase DUP renfo à partir de la
// phase du plan course (prochaine course cible). Renvoie undefined s'il n'y a pas
// de course → le renfo retombe sur sa rotation 4 semaines autonome.
// Portage mobile : loader Supabase direct au lieu de TanStack Query (calcul identique).
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { currentPlanPhase } from './planGenerator'
import { runningPhaseToDUP, type DUPPhase4 } from '../renfoUtils'

export function useRunningDUPOverride(): DUPPhase4 | undefined {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const today = new Date().toISOString().slice(0, 10)
  const [data, setData] = useState<{ date: string; distance: number } | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effet de chargement/reset/timer légitime (Expo, aucun data-loader framework) ; règle conservée en erreur pour le reste du code
    if (!userId) { setData(null); return }
    let alive = true
    supabase
      .from('race_calendar')
      .select('date,distance')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data: row }) => {
        if (!alive) return
        if (!row?.date) { setData(null); return }
        setData({ date: String(row.date).slice(0, 10), distance: (row.distance as number | null) ?? 0 })
      })
    return () => { alive = false }
  }, [userId, today])

  if (!data) return undefined
  return runningPhaseToDUP(currentPlanPhase(data.date, data.distance, today))
}
