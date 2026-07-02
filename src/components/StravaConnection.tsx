import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, SUPA_URL } from '../lib/supabase'
import { startStravaOAuth, stravaConfigured } from '../lib/strava'

// Connexion Strava — composant partagé. `compact` = état + sync (header mobile,
// non envahissant) ; `full` = état + connecter/déconnecter/forcer sync (sidebar
// desktop, onglet Réglages).

interface StravaStatus {
  connected: boolean
  athlete_firstname?: string | null
  last_sync_at?: string | null
}

function formatSync(iso?: string | null): string {
  if (!iso) return 'jamais'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.floor(h / 24)} j`
}

const IconSync = ({ spinning }: { spinning?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={spinning ? { animation: 'spin 0.9s linear infinite' } : undefined}>
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

export default function StravaConnection({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<StravaStatus | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return
      fetch(`${SUPA_URL}/functions/v1/strava-status`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.json()).then((d) => setStatus(d)).catch(() => {})
    })
  }, [])

  async function sync() {
    setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const r = await fetch(`${SUPA_URL}/functions/v1/strava-refresh`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: '{}',
      })
      const d = await r.json()
      if (d.last_sync_at) setStatus((p) => p ? { ...p, last_sync_at: d.last_sync_at } : p)
      qc.invalidateQueries()
    } finally {
      setSyncing(false)
    }
  }

  async function disconnect() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch(`${SUPA_URL}/functions/v1/strava-disconnect`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: '{}',
    }).catch(() => {})
    setStatus({ connected: false })
    qc.invalidateQueries()
  }

  if (!status) return null
  const connected = status.connected

  // ── COMPACT : pastille d'état + icône sync (header mobile) ──
  if (variant === 'compact') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={connected ? 'dot dot-on' : 'dot dot-off'} title={connected ? `Strava connecté · sync ${formatSync(status.last_sync_at)}` : 'Strava non connecté'} />
        {connected && (
          <button onClick={sync} disabled={syncing} title={`Forcer la synchro · ${formatSync(status.last_sync_at)}`} aria-label="Synchroniser Strava"
            style={{ background: 'none', border: '1px solid var(--vl-line)', borderRadius: 6, cursor: 'pointer', color: 'var(--vl-text-2)', padding: '5px 7px', display: 'flex', alignItems: 'center' }}>
            <IconSync spinning={syncing} />
          </button>
        )}
      </div>
    )
  }

  // ── FULL : état + connecter / déconnecter / forcer sync ──
  return connected ? (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div className="dot dot-on" />
        <span className="mlabel" style={{ margin: 0, color: 'var(--vl-growth)', fontSize: 9 }}>
          STRAVA{status.athlete_firstname ? ` · ${status.athlete_firstname.toUpperCase()}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)' }}>
          sync {formatSync(status.last_sync_at)}
        </span>
      </div>
      {/* Empilés : deux libellés longs côte à côte débordaient la sidebar (190px). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className="hbtn" style={{ fontSize: 9, padding: '4px 8px', width: '100%' }} onClick={sync} disabled={syncing}>
          {syncing ? 'SYNC…' : 'FORCER SYNC'}
        </button>
        <button className="hbtn" style={{ fontSize: 9, padding: '4px 8px', width: '100%' }} onClick={disconnect}>
          DÉCONNECTER
        </button>
      </div>
      {/* Attribution requise par les guidelines de marque Strava */}
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 6, textAlign: 'center' }}>
        POWERED BY STRAVA
      </div>
    </div>
  ) : (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div className="dot dot-off" />
        <span className="mlabel" style={{ margin: 0, fontSize: 9 }}>STRAVA NON CONNECTÉ</span>
      </div>
      {stravaConfigured() && (
        <button className="hbtn" style={{ fontSize: 9, padding: '3px 8px', width: '100%' }} onClick={startStravaOAuth}>
          CONNECTER STRAVA
        </button>
      )}
    </div>
  )
}
