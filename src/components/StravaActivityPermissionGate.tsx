import { useEffect, useState } from 'react'
import { startStravaOAuth } from '../lib/strava'
import { needsStravaActivityPermission, type StravaPermissionStatus } from '../lib/stravaScopes'
import { supabase, SUPA_URL } from '../lib/supabase'
import StravaActivityPermissionModal from './StravaActivityPermissionModal'

type GateState = 'checking' | 'clear' | 'blocked'

export default function StravaActivityPermissionGate() {
  const [state, setState] = useState<GateState>('checking')

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) {
        if (active) setState('clear')
        return
      }

      try {
        const response = await fetch(`${SUPA_URL}/functions/v1/strava-status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!response.ok) throw new Error('Strava status unavailable')
        const status = (await response.json()) as StravaPermissionStatus
        if (active) setState(needsStravaActivityPermission(status) ? 'blocked' : 'clear')
      } catch {
        // Une panne de statut ne doit pas bloquer tous les utilisateurs par erreur.
        if (active) setState('clear')
      }
    }).catch(() => {
      if (active) setState('clear')
    })

    return () => { active = false }
  }, [])

  if (state !== 'blocked') return null

  return (
    <StravaActivityPermissionModal
      onAuthorize={() => startStravaOAuth({ forceApproval: true })}
    />
  )
}
