import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { supabase, SUPA_URL } from '@/lib/supabase'
import { signInWithStravaMobile } from '@/lib/strava'
import { Card, FL, HButton, MLabel, colors, space } from '@/components/coach/ui'

// Connexion Strava — porté de `src/components/StravaConnection.tsx` (variant "full").
// État + connecter / déconnecter / forcer sync. Réutilise les Edge Functions
// existantes (strava-status / strava-refresh / strava-disconnect) et le flux OAuth
// natif (signInWithStravaMobile).

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

async function authedFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  return fetch(`${SUPA_URL}/functions/v1/${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session.access_token}` },
  })
}

export default function StravaConnectionCard() {
  const [status, setStatus] = useState<StravaStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [busy, setBusy] = useState(false)

  function loadStatus() {
    authedFetch('strava-status')
      .then((r) => r?.json())
      .then((d) => { if (d) setStatus(d) })
      .catch(() => {})
  }

  useEffect(() => { loadStatus() }, [])

  async function sync() {
    setSyncing(true)
    try {
      const r = await authedFetch('strava-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const d = await r?.json()
      if (d?.last_sync_at) setStatus((p) => (p ? { ...p, last_sync_at: d.last_sync_at } : p))
    } finally {
      setSyncing(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await authedFetch('strava-disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      setStatus({ connected: false })
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    setBusy(true)
    try {
      const res = await signInWithStravaMobile()
      if (res === 'connected') loadStatus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ marginBottom: space.lg }}>
      <FL style={{ marginBottom: 8 }}>Connexion Strava</FL>
      <Text style={{ fontSize: 12, color: colors.text3, lineHeight: 18, marginBottom: 12 }}>
        Connecte ta montre : Vorcelab analyse tes sorties et estime ta VO2max. Tu peux forcer une synchro ou te déconnecter ici.
      </Text>

      {status === null ? (
        <ActivityIndicator color={colors.ember} />
      ) : status.connected ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.growth }} />
            <MLabel style={{ color: colors.growth, fontSize: 9 }}>
              STRAVA{status.athlete_firstname ? ` · ${status.athlete_firstname.toUpperCase()}` : ''}
            </MLabel>
            <Text style={{ marginLeft: 'auto', fontSize: 9, color: colors.text3 }}>sync {formatSync(status.last_sync_at)}</Text>
          </View>
          <View style={{ gap: 8 }}>
            <HButton label={syncing ? 'SYNC…' : 'FORCER SYNC'} onPress={sync} disabled={syncing || busy} />
            <HButton label={busy ? '…' : 'DÉCONNECTER'} onPress={disconnect} disabled={syncing || busy} />
          </View>
          <Text style={{ fontSize: 8, color: colors.text3, letterSpacing: 1, marginTop: 8, textAlign: 'center' }}>POWERED BY STRAVA</Text>
        </View>
      ) : (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text3 }} />
            <MLabel style={{ fontSize: 9 }}>STRAVA NON CONNECTÉ</MLabel>
          </View>
          <HButton label={busy ? '…' : 'CONNECTER STRAVA'} onPress={connect} disabled={busy}
            style={{ backgroundColor: '#FC4C02', borderColor: '#FC4C02' }} textStyle={{ color: '#fff' }} />
        </View>
      )}
    </Card>
  )
}
