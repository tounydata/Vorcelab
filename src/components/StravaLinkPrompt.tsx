import { useEffect, useState } from 'react'
import { startStravaOAuth } from '../lib/strava'
import {
  parseStoredStravaOAuthFailure,
  stravaOAuthFailureMessage,
  type StravaRedirectFailureResult,
} from '../lib/stravaOAuthResult'
import {
  classifyStravaLink,
  shouldPromptStravaLink,
  type StravaLinkState,
  type StravaLinkStatus,
} from '../lib/stravaLinkPrompt'
import { supabase, SUPA_URL } from '../lib/supabase'
import { isSupportSessionWindow } from '../lib/supportSession'
import StravaLinkPromptCard from './StravaLinkPromptCard'

// Invite Strava — NON BLOQUANTE (décision produit du propriétaire).
//
// Elle se déclenche à l'ouverture de l'app quand le moteur ne peut rien lire, dans les
// DEUX cas : aucun jeton, ou jeton sans le scope activités. Le second est le plus
// pernicieux — l'athlète a « connecté Strava », l'app le confirme, et pourtant rien
// n'arrive ; jusqu'ici rien dans le produit ne le lui disait.
//
// Refermable : l'athlète peut continuer, et l'invite revient à la session suivante tant
// que le lien n'est pas bon. On relance, on ne verrouille pas.
//
// Exception assistance : dans la fenêtre d'assistance, OAuth utiliserait la session
// strava.com de l'ADMIN. Proposer de connecter là relierait le mauvais athlète, le
// serveur refuserait, et l'invite reviendrait — la boucle constatée en production. On y
// affiche donc la marche à suivre (générer le lien, l'envoyer), sans bouton d'autorisation.

const DISMISS_KEY = 'vl-strava-prompt-dismissed'

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // sessionStorage peut être indisponible (navigation privée) : on affiche l'invite.
    return false
  }
}

function rememberDismissal(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Sans stockage, l'invite reviendra au prochain rendu : acceptable, jamais bloquant.
  }
}

export default function StravaLinkPrompt() {
  const supportWindow = isSupportSessionWindow()
  const [state, setState] = useState<StravaLinkState | null>(null)
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [busy, setBusy] = useState(false)
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
      // Non connecté à Vorcelab : rien à proposer, l'écran de login s'en charge.
      if (!session?.access_token) return

      try {
        const response = await fetch(`${SUPA_URL}/functions/v1/strava-status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!response.ok) throw new Error('Strava status unavailable')
        const status = (await response.json()) as StravaLinkStatus
        if (active) setState(classifyStravaLink(status))
      } catch {
        // Une panne de statut ne doit jamais faire apparaître une invite injustifiée.
      }
    }).catch(() => {
      // Idem : en cas d'échec de session, on n'affiche rien.
    })

    return () => { active = false }
  }, [])

  // Un retour d'OAuth réussi passe l'état à `ok` : l'invite disparaît d'elle-même.
  if (state === null || !shouldPromptStravaLink(state)) return null
  if (dismissed) return null

  function dismiss() {
    rememberDismissal()
    setDismissed(true)
  }

  return (
    <StravaLinkPromptCard
      state={state}
      supportMode={supportWindow}
      busy={busy}
      // En assistance, le code d'échec n'apporte rien : le message explique déjà pourquoi
      // l'autorisation est impossible depuis cette fenêtre.
      error={supportWindow ? null : stravaOAuthFailureMessage(oauthFailure)}
      onDismiss={dismiss}
      onConnect={() => {
        setOauthFailure(null)
        setBusy(true)
        startStravaOAuth({ forceApproval: true })
      }}
    />
  )
}
