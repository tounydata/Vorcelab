import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import {
  fmtVam,
  fmtSpeed,
  statusColor,
  statusLabel,
  confidenceLabel,
  cardioCostColor,
  cardioCostLabel,
  GRADE_BUCKETS,
  type RunnerProfileComputed,
  type BucketKey,
  type BucketStats,
  type CardioCost,
} from '../lib/runnerProfile'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function RecoveryStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    good:     'var(--vl-growth)',
    moderate: 'var(--vl-amber)',
    weak:     'var(--vl-ember)',
    unknown:  'var(--vl-text-3)',
    stable:   'var(--vl-growth)',
    marked:   'var(--vl-ember)',
  }
  const labelMap: Record<string, string> = {
    good:     'Bonne',
    moderate: 'Modérée',
    weak:     'Faible',
    unknown:  '—',
    stable:   'Stable',
    marked:   'Marquée',
  }
  const color = colorMap[status] ?? 'var(--vl-text-3)'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      background: color,
      color: '#fff',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {labelMap[status] ?? status}
    </span>
  )
}

function CardioCostBadge({ cost }: { cost: CardioCost }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      background: cardioCostColor(cost),
      color: '#fff',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {cardioCostLabel(cost)}
    </span>
  )
}

// ─── Bucket card ──────────────────────────────────────────────────────────────

function BucketCard({ bucketKey, stats }: { bucketKey: BucketKey; stats: BucketStats }) {
  const b = GRADE_BUCKETS.find((b) => b.key === bucketKey)
  const isUp = b?.type === 'up'

  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '0.85rem', letterSpacing: '0.04em' }}>
          {b?.label ?? bucketKey}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <CardioCostBadge cost={stats.cardioCost} />
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            background: statusColor(stats.status),
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {statusLabel(stats.status)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: 6 }}>
        {/* VAM or Speed */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: statusColor(stats.status) }}>
            {isUp ? fmtVam(stats.vamMH) : fmtSpeed(stats.avgSpeedKmH)}
          </div>
          <div className="slbl" style={{ fontSize: 10 }}>{isUp ? 'VAM' : 'Vitesse'}</div>
        </div>

        {/* FC% — prominent */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {stats.avgHrPctFcMax != null ? `${stats.avgHrPctFcMax.toFixed(0)}%` : '—'}
          </div>
          <div className="slbl" style={{ fontSize: 10 }}>FCmax</div>
        </div>

        {/* Efficiency */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {stats.efficiencyScore != null ? stats.efficiencyScore.toFixed(0) : '—'}
          </div>
          <div className="slbl" style={{ fontSize: 10 }}>Efficacité</div>
        </div>
      </div>

      {/* statusReason */}
      {stats.statusReason && (
        <div style={{ fontSize: 11, color: 'var(--vl-text-3)', fontStyle: 'italic', marginBottom: 4 }}>
          {stats.statusReason}
        </div>
      )}

      {/* Relance status */}
      {stats.relanceStatus && stats.relanceStatus !== 'unknown' && (
        <div className="mlabel" style={{ fontSize: 10, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Relance après montée&nbsp;:&nbsp;
          {{
            strong:  'Bonne reprise',
            normal:  'Reprise normale',
            limited: 'Reprise limitée',
          }[stats.relanceStatus] ?? stats.relanceStatus}
        </div>
      )}

      <div className="mlabel" style={{ marginTop: 4, fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
        Confiance : {confidenceLabel(stats.confidence as 'high' | 'medium' | 'low' | 'none')}
        {' · '}
        {Math.round(stats.totalSeconds / 60)} min · {stats.runCount} sortie(s)
      </div>
    </div>
  )
}

// ─── Global analysis card ─────────────────────────────────────────────────────

function GlobalAnalysisCard({ rp }: { rp: RunnerProfileComputed }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="clabel" style={{ marginBottom: '0.75rem' }}>ANALYSE GLOBALE</div>

      {/* Post-climb recovery */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div className="mlabel" style={{ marginBottom: 4 }}>Récupération post-montée</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <RecoveryStatusBadge status={rp.postClimbRecoveryStatus} />
          {rp.postClimbHrRecoveryBpmPerMin != null && (
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)' }}>
              {rp.postClimbHrRecoveryBpmPerMin.toFixed(0)} bpm/min
            </span>
          )}
          {rp.postClimbResumeSpeedKmH != null && (
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)' }}>
              reprise {rp.postClimbResumeSpeedKmH.toFixed(1)} km/h
            </span>
          )}
        </div>
        <div className="mlabel" style={{ marginTop: 3, fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Confiance : {confidenceLabel(rp.postClimbRecoveryConfidence)}
        </div>
      </div>

      {/* Cardiac drift */}
      <div>
        <div className="mlabel" style={{ marginBottom: 4 }}>Dérive cardiaque</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <RecoveryStatusBadge status={rp.hrDriftStatus} />
          {rp.hrDriftPct != null && (
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)' }}>
              {rp.hrDriftPct.toFixed(1)}% dérive
            </span>
          )}
        </div>
        {rp.hrDriftStatus === 'marked' && (
          <div style={{ fontSize: 10, color: 'var(--vl-text-3)', fontStyle: 'italic', marginTop: 3 }}>
            Signal compatible avec fatigue, chaleur, hydratation insuffisante, pacing trop agressif ou endurance insuffisante.
          </div>
        )}
        <div className="mlabel" style={{ marginTop: 3, fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Confiance : {confidenceLabel(rp.hrDriftConfidence)}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const user = useVLStore((s) => s.user)

  const { data: profileRow, isLoading } = useQuery<{
    fc_max?: number
    runner_profile?: RunnerProfileComputed
  } | null>({
    queryKey: ['profile-runner', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('fc_max,runner_profile')
        .eq('id', user.id)
        .single()
      return data as { fc_max?: number; runner_profile?: RunnerProfileComputed } | null
    },
    enabled: !!user,
  })

  const rp = profileRow?.runner_profile

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        PROFIL
      </div>

      {/* Account info */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="clabel">Compte</div>
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
            <span className="fl">FCmax</span>
            <span className="mlabel">{profileRow.fc_max} bpm</span>
          </div>
        )}
      </div>

      {/* Runner profile */}
      {isLoading && (
        <div className="loading"><div className="spinner" /></div>
      )}

      {!isLoading && !rp && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
            Aucun profil coureur calculé. Synchronise tes activités Strava pour générer ton profil.
          </div>
        </div>
      )}

      {rp && (
        <>
          {/* Global analysis */}
          <GlobalAnalysisCard rp={rp} />

          {/* Per-bucket cards */}
          <div className="clabel" style={{ marginBottom: '0.5rem' }}>PROFIL PAR GRADIENT</div>
          {(Object.keys(rp.buckets ?? {}) as BucketKey[])
            .filter((k) => {
              const b = rp.buckets[k]
              return b && (b.totalSeconds > 0)
            })
            .map((bkey) => (
              <BucketCard
                key={bkey}
                bucketKey={bkey}
                stats={rp.buckets[bkey] as BucketStats}
              />
            ))}

          {/* Meta */}
          <div className="mlabel" style={{ marginTop: 8, fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
            Calculé le {new Date(rp._computedAt).toLocaleDateString('fr-FR')}
            {' · '}
            {Math.round(rp.totalStreamSeconds / 60)} min de streams analysées
            {' · '}
            Couverture {(rp.streamCoverage * 100).toFixed(0)}%
          </div>
        </>
      )}

      <button
        className="hbtn"
        style={{ marginTop: '1.5rem' }}
        onClick={() => supabase.auth.signOut()}
      >
        Se déconnecter
      </button>
    </>
  )
}
