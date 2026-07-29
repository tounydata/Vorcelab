import { useCallback, useEffect, useRef, useState } from 'react'
import { startStravaOAuth } from '../lib/strava'
import { needsStravaActivityPermission, type StravaPermissionStatus } from '../lib/stravaScopes'
import { supabase, SUPA_URL } from '../lib/supabase'
import { useDialogA11y } from '../lib/useDialogA11y'

type GateState = 'checking' | 'clear' | 'blocked'

export default function StravaActivityPermissionGate() {
  const [state, setState] = useState<GateState>('checking')
  const dialogRef = useRef<HTMLDivElement>(null)
  const refuseClose = useCallback(() => undefined, [])
  useDialogA11y({ open: state === 'blocked', onClose: refuseClose, containerRef: dialogRef })

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

  useEffect(() => {
    if (state !== 'blocked') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [state])

  if (state !== 'blocked') return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="strava-permission-title"
      aria-describedby="strava-permission-description"
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, overflowY: 'auto',
        background: 'rgba(5, 5, 7, 0.94)', backdropFilter: 'blur(14px)',
      }}
    >
      <div ref={dialogRef} style={{
        position: 'relative', width: '100%', maxWidth: 580, overflow: 'hidden',
        borderRadius: 24, border: '1px solid rgba(252, 76, 2, 0.45)',
        background: 'linear-gradient(155deg, #241006 0%, var(--vl-surf) 42%, #111216 100%)',
        boxShadow: '0 40px 120px rgba(0,0,0,.75), 0 0 80px rgba(252,76,2,.12)',
      }}>
        <div aria-hidden="true" style={{
          position: 'absolute', width: 380, height: 380, top: -220, right: -160,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(252,76,2,.28), transparent 68%)',
        }} />

        <div style={{ padding: 'clamp(28px, 6vw, 48px)' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', marginBottom: 22, borderRadius: 999,
            border: '1px solid rgba(252,76,2,.55)', background: 'rgba(252,76,2,.12)',
            color: '#ff6b2c', fontFamily: 'var(--vl-mono)', fontSize: 10,
            fontWeight: 700, letterSpacing: '.16em',
          }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#FC4C02', boxShadow: '0 0 12px #FC4C02' }} />
            ACTION OBLIGATOIRE
          </div>

          <h1 id="strava-permission-title" style={{
            margin: 0, maxWidth: 470, color: '#fff',
            fontFamily: 'var(--vl-display)', fontWeight: 900,
            fontSize: 'clamp(2.3rem, 8vw, 4rem)', lineHeight: .92,
            letterSpacing: '.01em', textTransform: 'uppercase',
          }}>
            Autorise tes<br /><span style={{ color: '#FC4C02' }}>activités Strava</span>
          </h1>

          <p id="strava-permission-description" style={{
            margin: '22px 0 20px', maxWidth: 470,
            color: 'var(--vl-text-2)', fontSize: 14, lineHeight: 1.65,
          }}>
            Ton compte Strava est lié, mais tu n’as pas autorisé Vorcelab à lire tes sorties.
            Sans elles, le moteur ne peut pas calculer ton profil, adapter ton entraînement ni synchroniser tes performances.
          </p>

          <div style={{
            marginBottom: 24, padding: '14px 16px', borderRadius: 12,
            border: '1px solid var(--vl-line-2)', background: 'rgba(0,0,0,.2)',
            color: 'var(--vl-text)', fontFamily: 'var(--vl-mono)',
            fontSize: 11, lineHeight: 1.65,
          }}>
            Sur l’écran Strava, coche impérativement la case concernant l’accès à tes activités.
          </div>

          <button
            autoFocus
            onClick={() => startStravaOAuth({ forceApproval: true })}
            style={{
              width: '100%', minHeight: 58, padding: '15px 20px',
              border: 'none', borderRadius: 14, cursor: 'pointer',
              background: '#FC4C02', color: '#fff',
              boxShadow: '0 14px 35px rgba(252,76,2,.28)',
              fontFamily: 'var(--vl-display)', fontSize: '1.2rem',
              fontWeight: 900, letterSpacing: '.07em',
            }}
          >
            RÉAUTORISER STRAVA
          </button>

          <div style={{
            marginTop: 14, textAlign: 'center',
            color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)',
            fontSize: 9, letterSpacing: '.12em',
          }}>
            CETTE ÉTAPE EST REQUISE POUR CONTINUER · POWERED BY STRAVA
          </div>
        </div>
      </div>
    </div>
  )
}
