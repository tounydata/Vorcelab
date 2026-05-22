import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import { isRun } from '../utils/formatters'
import { ActivityCard } from '../components/ActivityCard'

export function ActivitiesPage() {
  const user = useVLStore(s => s.user)
  const [search, setSearch] = useState('')

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activities', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data || []).filter(r => isRun(r.type as string)).map(mapDbActivity)
    },
    enabled: !!user,
  })

  const filtered = search
    ? activities.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : activities

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.04em' }}>
          ACTIVITÉS
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>
          {activities.length} sorties
        </div>
      </div>

      <input
        type="search"
        placeholder="Rechercher…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box', marginBottom: 16,
          background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)',
          borderRadius: 6, padding: '9px 14px',
          fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-1)',
          outline: 'none',
        }}
      />

      {isLoading ? (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-3)', padding: '40px 0', textAlign: 'center' }}>
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-3)', padding: '40px 0', textAlign: 'center' }}>
          {search ? 'Aucune sortie trouvée' : 'Aucune activité'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(act => <ActivityCard key={act.id} activity={act} />)}
        </div>
      )}
    </div>
  )
}
