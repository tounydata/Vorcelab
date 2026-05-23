import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import { isRun, fmtD } from '../utils/formatters'

const SUPA_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
const STRAVA_CLIENT_ID = '161609'

interface Profile {
  name?: string
  fc_max?: number
  vo2max?: number
  avatar_url?: string
  sex?: string
}

export function ProfilePage() {
  const user = useVLStore(s => s.user)
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      return (data as Profile | null) ?? {}
    },
    enabled: !!user,
  })

  const { data: stravaStatus, refetch: refetchStrava } = useQuery({
    queryKey: ['strava-status', user?.id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return null
      const r = await fetch(`${SUPA_URL}/functions/v1/strava-status`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (!r.ok) return null
      return r.json() as Promise<{ connected: boolean; athlete_firstname?: string; athlete_lastname?: string }>
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
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

  function connectStrava() {
    const state = crypto.randomUUID()
    sessionStorage.setItem('strava_oauth_state', state)
    const redirectUri = window.location.origin + '/Vorcelab/'
    const p = new URLSearchParams({ client_id: STRAVA_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'force', scope: 'read,activity:read,activity:read_all', state })
    window.location.href = `https://www.strava.com/oauth/authorize?${p}`
  }

  async function syncStrava() {
    setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(`${SUPA_URL}/functions/v1/strava-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: '{}',
      })
      await qc.invalidateQueries({ queryKey: ['activities', user?.id] })
      refetchStrava()
    } finally {
      setSyncing(false)
    }
  }

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

      {/* Strava connect */}
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 16px', borderLeft: `3px solid ${stravaStatus?.connected ? '#FC4C02' : 'var(--vl-border)'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: stravaStatus?.connected ? '#FC4C02' : 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 4 }}>
              STRAVA {stravaStatus?.connected ? '● CONNECTÉ' : '○ NON CONNECTÉ'}
            </div>
            {stravaStatus?.connected && (stravaStatus.athlete_firstname || stravaStatus.athlete_lastname) && (
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-2)' }}>
                {[stravaStatus.athlete_firstname, stravaStatus.athlete_lastname].filter(Boolean).join(' ')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {stravaStatus?.connected && (
              <button onClick={syncStrava} disabled={syncing} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', background: 'none', border: '1px solid var(--vl-border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: 'var(--vl-text-2)' }}>
                {syncing ? '…' : 'Synchroniser'}
              </button>
            )}
            <button onClick={connectStrava} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', background: stravaStatus?.connected ? 'none' : '#FC4C02', border: `1px solid ${stravaStatus?.connected ? 'var(--vl-border)' : '#FC4C02'}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: stravaStatus?.connected ? 'var(--vl-text-3)' : '#fff' }}>
              {stravaStatus?.connected ? 'Reconnecter' : 'Connecter Strava'}
            </button>
          </div>
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
