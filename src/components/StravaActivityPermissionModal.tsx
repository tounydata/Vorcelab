import { useCallback, useEffect, useRef } from 'react'
import { useDialogA11y } from '../lib/useDialogA11y'

interface StravaActivityPermissionModalProps {
  onAuthorize: () => void
  busy?: boolean
  error?: string | null
  /** Uniquement pour le labo admin : permet de sortir de la prévisualisation. */
  previewMode?: boolean
  onPreviewClose?: () => void
}

export default function StravaActivityPermissionModal({
  onAuthorize,
  busy = false,
  error = null,
  previewMode = false,
  onPreviewClose,
}: StravaActivityPermissionModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const refuseClose = useCallback(() => undefined, [])
  const handleClose = previewMode && onPreviewClose ? onPreviewClose : refuseClose
  useDialogA11y({ open: true, onClose: handleClose, containerRef: dialogRef })

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

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
      {previewMode && onPreviewClose ? (
        <button
          onClick={onPreviewClose}
          aria-label="Fermer la prévisualisation administrateur"
          style={{
            position: 'fixed', zIndex: 10052, top: 16, right: 16,
            border: '1px solid rgba(255,255,255,.22)', borderRadius: 999,
            padding: '8px 13px', cursor: 'pointer',
            background: '#111216', color: '#fff',
            fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700,
          }}
        >
          FERMER LE MODE TEST
        </button>
      ) : null}

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

          {error ? (
            <div role="alert" style={{
              margin: '-8px 0 18px', color: 'var(--vl-ember)',
              fontSize: 12, lineHeight: 1.5,
            }}>
              {error}
            </div>
          ) : null}

          <button
            autoFocus
            disabled={busy}
            onClick={onAuthorize}
            style={{
              width: '100%', minHeight: 58, padding: '15px 20px',
              border: 'none', borderRadius: 14, cursor: busy ? 'wait' : 'pointer',
              background: '#FC4C02', color: '#fff',
              boxShadow: '0 14px 35px rgba(252,76,2,.28)',
              fontFamily: 'var(--vl-display)', fontSize: '1.2rem',
              fontWeight: 900, letterSpacing: '.07em',
              opacity: busy ? .68 : 1,
            }}
          >
            {busy ? 'OUVERTURE STRAVA…' : 'RÉAUTORISER STRAVA'}
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
