import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  clearSupportSessionMeta,
  readSupportSessionMeta,
  SUPPORT_WINDOW_FLAG,
  writeSupportSessionMeta,
  type SupportSessionMeta,
} from '../lib/supportSession'

interface BootstrapPayload {
  tokenHash: string
  supportSessionId: string
  targetUserId: string
}

let bootstrapPromise: Promise<void> | null = null

function readBootstrapPayload(): BootstrapPayload | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const tokenHash = hash.get('token_hash')
  const supportSessionId = hash.get('support_session_id')
  const targetUserId = hash.get('target_user_id')
  if (!tokenHash || !supportSessionId || !targetUserId) return null
  return { tokenHash, supportSessionId, targetUserId }
}

async function validateSupportSession(
  supportSessionId: string,
): Promise<SupportSessionMeta> {
  const { data, error } = await supabase.rpc('support_validate_assisted_session', {
    support_session_id: supportSessionId,
  })
  if (error || !data) {
    throw new Error('Cette session d’assistance est absente, terminée ou expirée.')
  }
  return data as unknown as SupportSessionMeta
}

async function bootstrap(payload: BootstrapPayload): Promise<void> {
  // Le fragment contenant l'OTP est effacé avant tout appel réseau : il ne
  // reste ni dans l'historique visible ni dans un referer.
  window.history.replaceState({}, '', '/support-session')
  window.sessionStorage.setItem(SUPPORT_WINDOW_FLAG, '1')

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: 'magiclink',
  })
  if (error || !data.user || data.user.id !== payload.targetUserId) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    throw new Error('Le lien d’assistance est invalide ou a déjà été utilisé.')
  }

  const meta = await validateSupportSession(payload.supportSessionId)
  if (meta.target_user_id !== data.user.id) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    throw new Error('Cette session ne correspond pas à l’utilisateur attendu.')
  }

  writeSupportSessionMeta(meta)
  window.location.replace('/')
}

export default function SupportSessionPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    const payload = readBootstrapPayload()
    if (payload) {
      if (!bootstrapPromise) bootstrapPromise = bootstrap(payload)
      bootstrapPromise.catch((reason: unknown) => {
        clearSupportSessionMeta()
        setError(reason instanceof Error ? reason.message : 'Session d’assistance impossible.')
      })
      return
    }

    const existing = readSupportSessionMeta()
    if (!existing) {
      setError('Aucun lien d’assistance valide dans cette fenêtre.')
      return
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user || session.user.id !== existing.target_user_id) {
        throw new Error('La session utilisateur assistée n’est plus disponible.')
      }
      await validateSupportSession(existing.id)
      window.location.replace('/')
    }).catch((reason: unknown) => {
      clearSupportSessionMeta()
      setError(reason instanceof Error ? reason.message : 'Session d’assistance impossible.')
    })
  }, [])

  return (
    <div style={{
      minHeight: '100svh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background: 'var(--vl-bg)',
    }}>
      <div
        role={error ? 'alert' : 'status'}
        style={{
          width: 'min(480px, 100%)',
          padding: 24,
          borderRadius: 14,
          border: `1px solid ${error ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
          background: 'var(--vl-surf)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800 }}>
          {error ? 'Assistance indisponible' : 'Ouverture du compte assisté…'}
        </div>
        <p style={{ margin: '10px 0 0', color: 'var(--vl-text-2)', fontSize: 12, lineHeight: 1.6 }}>
          {error || 'Création d’une session Vorcelab temporaire et isolée. Aucun mot de passe n’est utilisé.'}
        </p>
        {error ? (
          <button
            className="hbtn"
            style={{ marginTop: 16, borderColor: 'var(--vl-ember)', color: 'var(--vl-ember)' }}
            onClick={() => window.close()}
          >
            FERMER CETTE FENÊTRE
          </button>
        ) : (
          <div className="loading" style={{ padding: '1.5rem 0 0' }}><div className="spinner" /></div>
        )}
      </div>
    </div>
  )
}
