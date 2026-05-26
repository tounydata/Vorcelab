import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'
import {
  computeRunnerProfile,
  fmtPaceProfile,
  statusColor,
  statusLabel,
  type ActivityAggregate,
} from '../lib/runnerProfile'

const FC_MAX_DEFAULT = 190

interface ProfileRow {
  fc_max?: number | null
  name?: string | null
}

interface ActivityRow {
  id: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  average_heartrate: number | null
  average_speed: number | null
  type: string
  sport_type: string | null
  start_date: string
}

function toAggregate(a: ActivityRow): ActivityAggregate {
  return {
    id: a.id,
    distM: a.distance,
    dplus: a.total_elevation_gain,
    movingTimeSec: a.moving_time,
    avgHrBpm: a.average_heartrate,
    avgSpeedMs: a.average_speed,
    type: a.type,
    sportType: a.sport_type,
    startDate: a.start_date,
  }
}

function fmtH(h: number) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return mm > 0 ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`
}

export default function ProfilePage() {
  const user = useVLStore((s) => s.user)
  const [tab, setTab] = useState<'compte' | 'profil'>('profil')

  const { data: profileRow } = useQuery<ProfileRow | null>({
    queryKey: ['profile-row'],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase.from('profiles').select('fc_max,name').eq('id', user.id).single()
      return data as ProfileRow | null
    },
    enabled: !!user,
  })

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<ActivityRow[]>({
    queryKey: ['activities-profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,distance,total_elevation_gain,moving_time,average_heartrate,average_speed,type,sport_type,start_date')
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as ActivityRow[]
    },
    enabled: !!user,
  })

  const fcMax = profileRow?.fc_max ?? FC_MAX_DEFAULT
  const profile = computeRunnerProfile(activities.map(toAggregate), fcMax)

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
          {activitiesLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : profile.trailActivities === 0 ? (
            <div className="card">
              <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)' }}>
                Aucune activité trail détectée sur les {profile.periodMonths} derniers mois.
                Synchronisez vos sorties Strava pour générer votre profil coureur.
              </div>
            </div>
          ) : (
            <>
              {/* Volume */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="clabel" style={{ marginBottom: '0.75rem' }}>
                  VOLUME — {profile.periodMonths} DERNIERS MOIS
                </div>
                <div className="strip">
                  <div className="scell">
                    <div className="sval">{profile.totalDistKm}</div>
                    <div className="slbl">KM TRAIL</div>
                  </div>
                  <div className="scell">
                    <div className="sval">+{profile.totalDplus.toLocaleString('fr-FR')}</div>
                    <div className="slbl">D+ TOTAL</div>
                  </div>
                  <div className="scell">
                    <div className="sval">{fmtH(profile.totalTimeH)}</div>
                    <div className="slbl">TEMPS TOTAL</div>
                  </div>
                  <div className="scell">
                    <div className="sval">{profile.trailActivities}</div>
                    <div className="slbl">SORTIES</div>
                  </div>
                </div>
              </div>

              {/* Profil terrain + cadence */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="clabel" style={{ marginBottom: '0.75rem' }}>PROFIL TERRAIN</div>
                <div className="fg">
                  <span className="fl">D+ moyen</span>
                  <span className="mlabel">{profile.avgDplusPerKm} m/km</span>
                </div>
                <div className="fg">
                  <span className="fl">Type de terrain</span>
                  <span className="mlabel" style={{ textTransform: 'capitalize' }}>{profile.terrainLabel}</span>
                </div>
                <div className="fg">
                  <span className="fl">D+ par sortie</span>
                  <span className="mlabel">+{profile.avgDplusPerSession} m</span>
                </div>
                <div className="fg">
                  <span className="fl">Cadence</span>
                  <span className="mlabel" style={{ color: statusColor(profile.cadenceStatus) }}>
                    {profile.cadencePerMonth} sortie{profile.cadencePerMonth > 1 ? 's' : ''}/mois
                    {' '}<span style={{ fontSize: 10, opacity: 0.7 }}>— {statusLabel(profile.cadenceStatus)}</span>
                  </span>
                </div>
              </div>

              {/* Performances */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="clabel" style={{ marginBottom: '0.75rem' }}>PERFORMANCES</div>
                <div className="fg">
                  <span className="fl">Allure trail moy.</span>
                  <span className="mlabel">{fmtPaceProfile(profile.avgPaceSecPerKm)}</span>
                </div>
                <div className="fg">
                  <span className="fl">FC moyenne</span>
                  <span className="mlabel">
                    {profile.avgHrBpm ? `${profile.avgHrBpm} bpm` : '—'}
                    {profile.avgHrPctFcMax ? ` (${Math.round(profile.avgHrPctFcMax * 100)}% FC max)` : ''}
                  </span>
                </div>
                <div className="fg">
                  <span className="fl">VAM estimée</span>
                  <span className="mlabel" style={{ color: statusColor(profile.vamStatus) }}>
                    {profile.estimatedVamMH ? `${profile.estimatedVamMH} m/h` : '—'}
                    {profile.estimatedVamMH && (
                      <span style={{ fontSize: 10, opacity: 0.7 }}> — {statusLabel(profile.vamStatus)}</span>
                    )}
                  </span>
                </div>
                <div className="fg">
                  <span className="fl">FC max configurée</span>
                  <span className="mlabel">{fcMax} bpm</span>
                </div>
              </div>

              {/* Note limitation */}
              <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--vl-line)' }}>
                <div className="clabel" style={{ marginBottom: '0.5rem', color: 'var(--vl-text-3)' }}>À VENIR — VAM PAR GRADIENT</div>
                <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)', lineHeight: 1.5 }}>
                  L'analyse VAM par tranche de pente (3–6 %, 6–10 %, 10–15 %,  &gt;15 %) nécessite
                  les données GPS segments Strava (streams). Ces données ne sont pas encore synchronisées.
                  Une fois disponibles, votre profil forces/faiblesses par gradient alimentera automatiquement
                  la projection de course personnalisée.
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
