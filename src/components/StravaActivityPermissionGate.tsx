import { useEffect, useState } from 'react'
import { startStravaOAuth } from '../lib/strava'
import {
  parseStoredStravaOAuthFailure,
  stravaOAuthFailureMessage,
  type StravaRedirectFailureResult,
} from '../lib/stravaOAuthResult'
import { needsStravaActivityPermission, type StravaPermissionStatus } from '../lib/stravaScopes'
import { supabase, SUPA_URL } from '../lib/supabase'
import { isSupportSessionWindow } from '../lib/supportSession'
import StravaActivityPermissionModal from './StravaActivityPermissionModal'

type GateState = 'checking' | 'clear' | 'blocked'

// Le blocage est LÉGITIME pour l'athlète : sans le scope activités, le moteur ne peut rien
// calculer. Il est en revanche une IMPASSE dans une fenêtre d'assistance : OAuth utilise la
// session strava.com de l'admin, donc autoriser depuis là relie le mauvais athlète, Vorcelab
// refuse, et le pop-up réapparaît — la boucle constatée en production. On y remplace donc
// l'action impossible par la marche à suivre, et on laisse l'admin poursuivre son dépannage
// (profil, sync, jeton…) au lieu de le coincer derrière une modale infranchissable.
export default function StravaActivityPermissionGate() {
  const supportWindow = isSupportSessionWindow()
  const [dismissed, setDismissed] = useState(false)
  const [state, setState] = useState<GateState>('checking')
  const [oauthFailure, setOauthFailure] = useState<StravaRedirectFailureResult | null>(() => {
    try {
      const result = sessionStorage.getItem('vl-strava-auth-result')
      sessionStorage.removeItem('vl-strava-auth-result')
      return parseStoredStravaOAuthFailure(result)
    } catch {
      // sessionStorage peut être indisponible dans certains navigateurs privés.
    }
    return null
  })

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
  if (supportWindow && dismissed) return null

  const wrongAthlete = oauthFailure === 'wrong_athlete'

  return (
    <StravaActivityPermissionModal
      // En assistance, l'échec `wrong_athlete` n'apporte rien : le message explique déjà
      // pourquoi l'autorisation est impossible depuis cette fenêtre.
      error={supportWindow ? null : stravaOAuthFailureMessage(oauthFailure)}
      wrongAthlete={wrongAthlete}
      supportMode={supportWindow}
      onDismiss={() => setDismissed(true)}
      onAuthorize={() => {
        setOauthFailure(null)
        startStravaOAuth({ forceApproval: true })
      }}
    />
  )
}
