import { useEffect, useState } from 'react'

// Page-pont pour l'OAuth Strava MOBILE. Strava n'accepte qu'un domaine en callback
// (pas de schéma custom) → il redirige ici (https://vorcelab.app/mobile-strava?code=…&state=…),
// et on rebondit vers le schéma de l'app mobile passé dans `state` (vorcelab://strava?…),
// que expo-web-browser intercepte. Aucune donnée n'est traitée ici : simple relais.
//
// Sécurité : on n'autorise QUE les schémas d'app (vorcelab / exp…) pour éviter tout
// open-redirect qui fuiterait le `code` Strava vers un domaine tiers.
const ALLOWED_SCHEME = /^(vorcelab:|exp(\+[a-z0-9-]+)?:|exps?:)/i

export default function MobileStravaBridge() {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    const state = url.searchParams.get('state') ?? ''
    if (!ALLOWED_SCHEME.test(state)) { setFailed(true); return }
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const scope = url.searchParams.get('scope') ?? ''
    const sep = state.includes('?') ? '&' : '?'
    const qs = new URLSearchParams()
    if (code) qs.set('code', code)
    if (error) qs.set('error', error)
    if (scope) qs.set('scope', scope)
    // Rebond vers l'app.
    window.location.replace(`${state}${sep}${qs.toString()}`)
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: 'var(--vl-text-2)', fontFamily: 'var(--vl-mono)', fontSize: 14 }}>
      {failed
        ? 'Lien de retour invalide. Reviens à l’application et réessaie.'
        : 'Connexion Strava… retour à l’application Vorcelab.'}
    </div>
  )
}
