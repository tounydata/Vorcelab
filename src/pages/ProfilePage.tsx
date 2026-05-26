import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'
import {
  GRADIENT_BUCKETS,
  statusColor,
  statusLabel,
  confidenceLabel,
  fmtVam,
  fmtSpeed,
  fmtDuration,
  type RunnerProfileComputed,
  type ProfileRow,
} from '../lib/runnerProfile'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ProfilePage() {
  const user = useVLStore((s) => s.user)
  const [tab, setTab] = useState<'compte' | 'profil'>('profil')
  const qc = useQueryClient()

  const { data: profileRow, isLoading: profileLoading } = useQuery<ProfileRow | null>({
    queryKey: ['profile-row'],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('fc_max,name,runner_profile,runner_profile_at')
        .eq('id', user.id)
        .single()
      return data as ProfileRow | null
    },
    enabled: !!user,
  })

  const computeProfile = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('compute-runner-profile')
      if (error) throw error
      return data as RunnerProfileComputed
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-row'] })
    },
  })

  const profile = profileRow?.runner_profile as RunnerProfileComputed | null | undefined

  const tabStyle = (t: typeof tab): React.CSSProperties => ({
    padding: '6px 16px',
    fontFamily: 'var(--vl-mono)',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    border: '1px solid var(--vl-line)',
    borderRadius: 6,
    cursor: 'pointer',
    background: tab === t ? 'var(--vl-surf-2)' : 'transparent',
    color: tab === t ? 'var(--vl-text)' : 'var(--vl-text-3)',
  })

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        PROFIL
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
        <button style={tabStyle('profil')} onClick={() => setTab('profil')}>Profil Coureur</button>
        <button style={tabStyle('compte')} onClick={() => setTab('compte')}>Compte</button>
      </div>

      {/* ── COMPTE ─────────────────────────────────────────────────────── */}
      {tab === 'compte' && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="clabel" style={{ marginBottom: '0.75rem' }}>Compte</div>
            <div className="fg">
              <span className="fl">Email</span>
              <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>
                {user?.email?.toLowerCase()}
              </span>
            </div>
            <div className="fg">
              <span className="fl">ID</span>
              <span className="mlabel" style={{ color: 'var(--vl-text-3)', fontSize: 10 }}>
                {user?.id}
              </span>
            </div>
            {profileRow?.fc_max && (
              <div className="fg">
                <span className="fl">FC max</span>
                <span className="mlabel">{profileRow.fc_max} bpm</span>
              </div>
            )}
          </div>
          <button className="hbtn" onClick={() => supabase.auth.signOut()}>
            Se déconnecter
          </button>
        </>
      )}

      {/* ── PROFIL COUREUR ────────────────────────────────────────────── */}
      {tab === 'profil' && (
        <>
          {profileLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : (
            <>
              {/* Header + compute button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.75rem' }}>
                <div>
                  <div className="clabel" style={{ marginBottom: 4 }}>VAM PAR GRADIENT</div>
                  {profile && (
                    <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)', fontSize: '0.72rem' }}>
                      {profile.activitiesAnalyzed} sortie{profile.activitiesAnalyzed > 1 ? 's' : ''} analysée{profile.activitiesAnalyzed > 1 ? 's' : ''}
                      {profileRow?.runner_profile_at && ` · ${fmtDate(profileRow.runner_profile_at)}`}
                    </div>
                  )}
                </div>
                <button
                  className="hbtn"
                  style={{ flexShrink: 0 }}
                  onClick={() => computeProfile.mutate()}
                  disabled={computeProfile.isPending}
                >
                  {computeProfile.isPending ? '...' : profile ? 'RECALCULER' : 'CALCULER'}
                </button>
              </div>

              {computeProfile.isError && (
                <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--vl-ember)' }}>
                  <div className="mlabel" style={{ color: 'var(--vl-ember)', textTransform: 'none', letterSpacing: 0 }}>
                    Erreur lors du calcul. Vérifiez que Strava est connecté et réessayez.
                  </div>
                </div>
              )}

              {!profile ? (
                <div className="card">
                  <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)', lineHeight: 1.6 }}>
                    Aucun profil calculé. Cliquez sur <strong>CALCULER</strong> pour analyser vos streams Strava
                    et obtenir votre VAM précise par tranche de pente (3–6 %, 6–10 %, 10–15 %, &gt;15 %).
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary strip */}
                  <div className="strip" style={{ marginBottom: '1rem' }}>
                    <div className="scell" style={{ gridColumn: 'span 3' }}>
                      <div className="sval">{profile.activitiesAnalyzed}</div>
                      <div className="slbl">SORTIES</div>
                    </div>
                    <div className="scell" style={{ gridColumn: 'span 3' }}>
                      <div className="sval">{profile.fcMax}</div>
                      <div className="slbl">FC MAX</div>
                    </div>
                  </div>

                  {/* Errors from edge function */}
                  {profile.errors && profile.errors.length > 0 && (
                    <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--vl-amber)' }}>
                      <div className="mlabel" style={{ color: 'var(--vl-amber)', marginBottom: 4 }}>⚡ DONNÉES PARTIELLES</div>
                      {profile.errors.slice(0, 3).map((e, i) => (
                        <div key={i} className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)', fontSize: '0.72rem' }}>{e}</div>
                      ))}
                    </div>
                  )}

                  {/* Climb buckets */}
                  <div className="card" style={{ marginBottom: '1rem' }}>
                    <div className="clabel" style={{ marginBottom: '0.75rem' }}>MONTÉES — VAM</div>
                    {GRADIENT_BUCKETS.filter(b => b.type === 'up').map(b => {
                      const s = profile.buckets[b.key]
                      if (!s) return null
                      return (
                        <div key={b.key} className="fg" style={{ alignItems: 'flex-start', paddingBottom: 6 }}>
                          <div style={{ flex: 1 }}>
                            <div className="fl" style={{ marginBottom: 2 }}>{b.label}</div>
                            <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)', fontSize: '0.7rem' }}>
                              {fmtDuration(s.timeSec)} · {s.avgHrPctFcMax !== null ? `${Math.round(s.avgHrPctFcMax)}% FC max` : '—'}
                              {' · '}{confidenceLabel(s.confidence)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                            <div className="sval" style={{ fontSize: '1rem', color: s.status !== 'unknown' ? statusColor(s.status) : 'var(--vl-text-3)' }}>
                              {fmtVam(s.vamMH)}
                            </div>
                            <div className="slbl" style={{ color: s.status !== 'unknown' ? statusColor(s.status) : 'var(--vl-text-3)' }}>
                              {s.status !== 'unknown' ? statusLabel(s.status) : '—'}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Descent buckets */}
                  <div className="card" style={{ marginBottom: '1rem' }}>
                    <div className="clabel" style={{ marginBottom: '0.75rem' }}>DESCENTES — VITESSE</div>
                    {GRADIENT_BUCKETS.filter(b => b.type === 'down').map(b => {
                      const s = profile.buckets[b.key]
                      if (!s) return null
                      return (
                        <div key={b.key} className="fg" style={{ alignItems: 'flex-start', paddingBottom: 6 }}>
                          <div style={{ flex: 1 }}>
                            <div className="fl" style={{ marginBottom: 2 }}>{b.label}</div>
                            <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)', fontSize: '0.7rem' }}>
                              {fmtDuration(s.timeSec)} · {s.avgHrPctFcMax !== null ? `${Math.round(s.avgHrPctFcMax)}% FC max` : '—'}
                              {' · '}{confidenceLabel(s.confidence)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                            <div className="sval" style={{ fontSize: '1rem', color: s.status !== 'unknown' ? statusColor(s.status) : 'var(--vl-text-3)' }}>
                              {fmtSpeed(s.avgSpeedKmH)}
                            </div>
                            <div className="slbl" style={{ color: s.status !== 'unknown' ? statusColor(s.status) : 'var(--vl-text-3)' }}>
                              {s.status !== 'unknown' ? statusLabel(s.status) : '—'}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Flat bucket */}
                  {profile.buckets.flat && (
                    <div className="card" style={{ marginBottom: '1rem' }}>
                      <div className="clabel" style={{ marginBottom: '0.75rem' }}>PLAT</div>
                      <div className="fg">
                        <div>
                          <div className="fl">Vitesse</div>
                          <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)', fontSize: '0.7rem' }}>
                            {fmtDuration(profile.buckets.flat.timeSec)} · {profile.buckets.flat.avgHrPctFcMax !== null ? `${Math.round(profile.buckets.flat.avgHrPctFcMax)}% FC max` : '—'}
                            {' · '}{confidenceLabel(profile.buckets.flat.confidence)}
                          </div>
                        </div>
                        <div className="sval" style={{ fontSize: '1rem' }}>
                          {fmtSpeed(profile.buckets.flat.avgSpeedKmH)}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}
