import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { invokeFunction } from '@/lib/api-client'
import { env } from '@/config/env'
import type { StravaOAuthResponse } from '@runner-os/shared'

type Status = 'loading' | 'success' | 'error' | 'no-auth'

export function StravaCallbackPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const scope = params.get('scope') ?? ''
    const error = params.get('error')
    const returnedState = params.get('state')
    const expectedState = sessionStorage.getItem('strava_oauth_state')

    if (error || !code) {
      setStatus('error')
      setErrorMsg(error === 'access_denied' ? 'Autorisation refusée.' : 'Code OAuth manquant.')
      return
    }

    if (!returnedState || returnedState !== expectedState) {
      setStatus('error')
      setErrorMsg('État OAuth invalide. Réessaie la connexion.')
      return
    }

    sessionStorage.removeItem('strava_oauth_state')

    // Verify user is logged in before exchanging the code
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setStatus('no-auth')
        return
      }

      try {
        await invokeFunction<{ code: string; scope: string }, StravaOAuthResponse>(
          env.strava.oauthFunctionName,
          {
            body: { code, scope },
          }
        )
        setStatus('success')
        // Clean URL, redirect after short delay so user sees success
        window.history.replaceState({}, '', '/activities')
        setTimeout(() => void navigate('/activities'), 1500)
      } catch (err) {
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Erreur de connexion Strava.')
      }
    })
  }, [navigate])

  if (status === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>Connexion Strava…</div>
      </div>
    )
  }

  if (status === 'no-auth') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>
          Tu dois être connecté pour lier Strava.
        </div>
        <button
          onClick={() => void navigate('/')}
          style={{ fontFamily: 'var(--mono)', cursor: 'pointer' }}
        >
          ← Retour
        </button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>
          {errorMsg || 'Erreur inconnue.'}
        </div>
        <button
          onClick={() => void navigate('/activities')}
          style={{ fontFamily: 'var(--mono)', cursor: 'pointer' }}
        >
          ← Retour
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>
        ✓ Strava connecté ! Synchronisation en cours…
      </div>
    </div>
  )
}
