import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import { isRun, fmtD } from '../utils/formatters'

interface Profile {
  name?: string
  fc_max?: number
  vo2max?: number
  avatar_url?: string
  sex?: string
}

export function ProfilePage() {
  const user = useVLStore(s => s.user)

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      return (data as Profile | null) ?? {}
    },
    enabled: !!user,
  })

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(500)
      return (data || []).filter(r => isRun(r.type as string)).map(mapDbActivity)
    },
    enabled: !!user,
  })

  const totalKm = activities.reduce((s, a) => s + a.distance / 1000, 0)
  const totalDp = activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)
  const totalTime = activities.reduce((s, a) => s + a.moving_time, 0)
  const avgDist = activities.length > 0 ? totalKm / activities.length : 0

  const longestRun = activities.reduce<typeof activities[0] | null>((best, a) => {
    return !best || a.distance > best.distance ? a : best
  }, null)

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        {profile?.avatar_url && (
          <img
            src={profile.avatar_url}
            alt="avatar"
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--vl-line)' }}
          />
        )}
        <div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, letterSpacing: '.04em' }}>
            {profile?.name || user?.email?.split('@')[0]?.toUpperCase() || 'PROFIL'}
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginTop: 2 }}>
            {user?.email}
          </div>
        </div>
      </div>

      {/* Physiological data */}
      {(profile?.fc_max || profile?.vo2max) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
          {profile.fc_max && (
            <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-ember)' }}>
                {profile.fc_max}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginTop: 2 }}>
                FC MAX BPM
              </div>
            </div>
          )}
          {profile.vo2max && (
            <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-growth)' }}>
                {profile.vo2max}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginTop: 2 }}>
                VO2MAX ML/KG/MIN
              </div>
            </div>
          )}
        </div>
      )}

      {/* Career stats */}
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 12 }}>
        STATS CARRIÈRE · {activities.length} SORTIES
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
        <StatRow label="KM TOTAL" value={Math.round(totalKm) + ' km'} color="var(--vl-ember)" />
        <StatRow label="D+ TOTAL" value={Math.round(totalDp) + ' m'} color="var(--vl-growth)" />
        <StatRow label="TEMPS TOTAL" value={fmtD(totalTime)} />
        <StatRow label="DIST. MOY." value={avgDist.toFixed(1) + ' km'} />
      </div>

      {/* Longest run */}
      {longestRun && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 6 }}>
            PLUS LONGUE SORTIE
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', fontWeight: 600 }}>{longestRun.name}</div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-ember)', marginTop: 2 }}>
            {(longestRun.distance / 1000).toFixed(1)} km · {fmtD(longestRun.moving_time)}
            {longestRun.total_elevation_gain > 0 ? ` · D+ ${Math.round(longestRun.total_elevation_gain)}m` : ''}
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginTop: 2 }}>
            {new Date(longestRun.start_date_local || longestRun.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
      )}

      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 16px', borderLeft: '3px solid var(--vl-amber)' }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-amber)', letterSpacing: '.1em', marginBottom: 4 }}>
          PARAMÈTRES AVANCÉS
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', lineHeight: 1.5 }}>
          Modifie ton profil (FC max, VO2max, zones de douleur, PRs) depuis l'application principale.
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, color: color ?? 'var(--vl-text-1)' }}>{value}</div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>{label}</div>
    </div>
  )
}
