import { useCallback, useEffect, useRef } from 'react'
import { useDialogA11y } from '../lib/useDialogA11y'

interface StravaActivityPermissionModalProps {
  onAuthorize: () => void
  busy?: boolean
  error?: string | null
  wrongAthlete?: boolean
  /**
   * Fenêtre d'assistance : l'autorisation Strava N'EST PAS délégable. OAuth s'appuie sur
   * la session strava.com du NAVIGATEUR qui l'ouvre — celle de l'admin. Proposer
   * « Autoriser » ici ne peut donc que relier le mauvais athlète (Vorcelab le bloque) et
   * ramener au même pop-up : une boucle sans issue. Dans ce mode, on explique et on donne
   * la seule action qui aboutit (envoyer le lien), sans bloquer l'assistance en cours.
   */
  supportMode?: boolean
  onDismiss?: () => void
  /** Uniquement pour le labo admin : permet de sortir de la prévisualisation. */
  previewMode?: boolean
  onPreviewClose?: () => void
}

export default function StravaActivityPermissionModal({
  onAuthorize,
  busy = false,
  error = null,
  wrongAthlete = false,
  supportMode = false,
  onDismiss,
  previewMode = false,
  onPreviewClose,
}: StravaActivityPermissionModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const refuseClose = useCallback(() => undefined, [])
  const escapable = previewMode && onPreviewClose
    ? onPreviewClose
    : supportMode && onDismiss ? onDismiss : refuseClose
  useDialogA11y({ open: true, onClose: escapable, containerRef: dialogRef })

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
            {supportMode
              ? 'AUTORISATION NON DÉLÉGABLE'
              : wrongAthlete ? 'COMPTE STRAVA INCORRECT' : 'ACTION OBLIGATOIRE'}
          </div>

          <h1 id="strava-permission-title" style={{
            margin: 0, maxWidth: 470, color: '#fff',
            fontFamily: 'var(--vl-display)', fontWeight: 900,
            fontSize: 'clamp(2.3rem, 8vw, 4rem)', lineHeight: .92,
            letterSpacing: '.01em', textTransform: 'uppercase',
          }}>
            {supportMode ? (
              <>Envoie le lien<br /><span style={{ color: '#FC4C02' }}>à l’athlète</span></>
            ) : wrongAthlete ? (
              <>Change de<br /><span style={{ color: '#FC4C02' }}>compte Strava</span></>
            ) : (
              <>Autorise tes<br /><span style={{ color: '#FC4C02' }}>activités Strava</span></>
            )}
          </h1>

          <p id="strava-permission-description" style={{
            margin: '22px 0 20px', maxWidth: 470,
            color: 'var(--vl-text-2)', fontSize: 14, lineHeight: 1.65,
          }}>
            {supportMode
              ? 'Cette autorisation ne peut pas être donnée depuis ici. Strava s’appuie sur le compte connecté dans CE navigateur — le tien — et non sur le compte Vorcelab que tu assistes. Autoriser depuis cette fenêtre relierait ton propre Strava : Vorcelab le refuse, et le pop-up revient. Seul l’athlète peut valider, sur son appareil.'
              : wrongAthlete
              ? 'La session Vorcelab assistée ne change pas le compte actuellement connecté sur strava.com. Vorcelab a donc bloqué l’autorisation pour éviter de rattacher les données du mauvais athlète.'
              : 'Ton compte Strava est lié, mais tu n’as pas autorisé Vorcelab à lire tes sorties. Sans elles, le moteur ne peut pas calculer ton profil, adapter ton entraînement ni synchroniser tes performances.'}
          </p>

          <div style={{
            marginBottom: 24, padding: '14px 16px', borderRadius: 12,
            border: '1px solid var(--vl-line-2)', background: 'rgba(0,0,0,.2)',
            color: 'var(--vl-text)', fontFamily: 'var(--vl-mono)',
            fontSize: 11, lineHeight: 1.65,
          }}>
            {supportMode ? (
              <>
                1. Dans ta fenêtre admin, onglet <strong>Assistance</strong> :
                {' '}« Générer et copier le lien Strava ».
                <br />
                2. Envoie ce lien à l’athlète (SMS, mail, WhatsApp…). Les permissions y sont
                {' '}déjà cochées : il n’a que le bouton final à valider.
                <br />
                3. Le statut se met à jour tout seul ici dès qu’il a validé.
              </>
            ) : wrongAthlete
              ? 'Ouvre Strava, déconnecte le compte actuellement ouvert, connecte le compte Strava de l’athlète assisté, puis reviens ici et réessaie.'
              : 'Sur l’écran Strava, coche impérativement la case concernant l’accès à tes activités.'}
          </div>

          {error ? (
            <div role="alert" style={{
              margin: '-8px 0 18px', color: 'var(--vl-ember)',
              fontSize: 12, lineHeight: 1.5,
            }}>
              {error}
            </div>
          ) : null}

          {wrongAthlete && !supportMode ? (
            <a
              href="https://www.strava.com/settings/profile"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', minHeight: 46, marginBottom: 10, padding: '11px 16px',
                border: '1px solid rgba(255,255,255,.22)', borderRadius: 12,
                color: '#fff', textDecoration: 'none',
                fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 800,
                letterSpacing: '.08em',
              }}
            >
              OUVRIR STRAVA POUR CHANGER DE COMPTE ↗
            </a>
          ) : null}

          {/* En assistance, le bouton « Autoriser » est structurellement voué à l'échec :
              on ne l'affiche pas, et on laisse l'admin poursuivre son dépannage. */}
          <button
            autoFocus
            disabled={busy && !supportMode}
            onClick={supportMode ? (onDismiss ?? refuseClose) : onAuthorize}
            style={{
              width: '100%', minHeight: 58, padding: '15px 20px',
              border: 'none', borderRadius: 14, cursor: busy && !supportMode ? 'wait' : 'pointer',
              background: '#FC4C02', color: '#fff',
              boxShadow: '0 14px 35px rgba(252,76,2,.28)',
              fontFamily: 'var(--vl-display)', fontSize: '1.2rem',
              fontWeight: 900, letterSpacing: '.07em',
              opacity: busy && !supportMode ? .68 : 1,
            }}
          >
            {supportMode
              ? 'CONTINUER L’ASSISTANCE'
              : busy
              ? 'OUVERTURE STRAVA…'
              : wrongAthlete
              ? 'RÉESSAYER AVEC LE BON COMPTE'
              : 'RÉAUTORISER STRAVA'}
          </button>

          <div style={{
            marginTop: 14, textAlign: 'center',
            color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)',
            fontSize: 9, letterSpacing: '.12em',
          }}>
            {supportMode
              ? 'L’ATHLÈTE VALIDE SUR SON APPAREIL · POWERED BY STRAVA'
              : 'CETTE ÉTAPE EST REQUISE POUR CONTINUER · POWERED BY STRAVA'}
          </div>
        </div>
      </div>
    </div>
  )
}
