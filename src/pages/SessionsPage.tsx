import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { deriveRunnerPaces } from '../lib/runnerPaces'
import { allocatePhases, weeksUntil, isTrailRace } from '../lib/coach/planGenerator'
import PaceZonesCard from '../components/PaceZonesCard'
import SessionBrowser from '../components/SessionBrowser'

interface ProfileRow {
  prs?: Record<string, unknown> | null
  vo2max?: number | null
  fc_max?: number | null
}

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const FALLBACK_VDOT = 45

export default function SessionsPage() {
  const user = useVLStore((s) => s.user)

  const { data: profile } = useQuery<ProfileRow | null>({
    queryKey: ['profile-sessions'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('prs,vo2max,fc_max')
        .eq('id', user!.id)
        .maybeSingle()
      return (data ?? null) as ProfileRow | null
    },
  })

  const { data: races = [] } = useQuery<Race[]>({
    queryKey: ['races'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id,name,date,distance,elevation,type')
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Race[]
    },
  })

  const today = todayISO()
  const targetRace = useMemo(
    () => races.find((r) => r.date.slice(0, 10) >= today) ?? null,
    [races, today],
  )

  const paces = deriveRunnerPaces(profile?.prs, profile?.vo2max)
  const vdot = paces?.vdot ?? FALLBACK_VDOT
  const phase = targetRace ? allocatePhases(weeksUntil(today, targetRace.date.slice(0, 10)))[0] : undefined
  const trail = targetRace ? isTrailRace(targetRace.type, targetRace.elevation ?? 0) : false

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', paddingBottom: '2rem' }}>
      <h1 style={{ fontFamily: 'var(--vl-display)', fontSize: 28, margin: '0 0 4px' }}>Séances</h1>
      <p style={{ fontSize: 13, color: 'var(--vl-text-3)', margin: '0 0 16px' }}>
        Choisis ta séance — les badges sont une suggestion, jamais une obligation
        {targetRace ? ` · phase « ${phase} » (objectif : ${targetRace.name})` : ''}.
      </p>

      <PaceZonesCard prs={profile?.prs} vo2max={profile?.vo2max} fcMax={profile?.fc_max} />

      <div className="clabel" style={{ margin: '8px 0 10px' }}>CATALOGUE — TU CHOISIS</div>
      <SessionBrowser vdot={vdot} ctx={{ phase }} trail={trail} />
    </div>
  )
}
