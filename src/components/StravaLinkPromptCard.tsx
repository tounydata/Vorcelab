import { useEffect, useRef } from 'react'
import { useDialogA11y } from '../lib/useDialogA11y'
import type { StravaLinkState } from '../lib/stravaLinkPrompt'

interface StravaLinkPromptCardProps {
  state: StravaLinkState
  onConnect: () => void
  onDismiss: () => void
  busy?: boolean
  error?: string | null
  /**
   * Fenêtre d'assistance : l'autorisation Strava N'EST PAS délégable. OAuth s'appuie sur
   * la session strava.com du NAVIGATEUR qui l'ouvre — celle de l'admin. Proposer de
   * connecter ici ne peut que relier le mauvais athlète (Vorcelab le bloque) et ramener
   * au même pop-up. Dans ce mode, on explique et on donne la seule action qui aboutit.
   */
  supportMode?: boolean
  /** Uniquement pour le labo admin : force l'affichage sans interroger le statut. */
  previewMode?: boolean
}

/**
 * Invite NON BLOQUANTE à connecter Strava.
 *
 * Volontairement refermable (croix, « Plus tard », Échap, clic à côté) : l'athlète garde
 * l'app utilisable. Elle revient à la session suivante tant que le lien n'est pas bon —
 * c'est une relance, pas un péage.
 */
export default function StravaLinkPromptCard({
  state,
  onConnect,
  onDismiss,
  busy = false,
  error = null,
  supportMode = false,
  previewMode = false,
}: StravaLinkPromptCardProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogA11y({ open: true, onClose: onDismiss, containerRef: dialogRef })

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const missingScope = state === 'missing_scope'

  const title = supportMode
    ? <>Envoie le lien<br /><span style={{ color: '#FC4C02' }}>à l’athlète</span></>
    : missingScope
    ? <>Autorise tes<br /><span style={{ color: '#FC4C02' }}>activités Strava</span></>
    : <>Connecte ton<br /><span style={{ color: '#FC4C02' }}>compte Strava</span></>

  const description = supportMode
    ? 'Cette autorisation ne peut pas être donnée depuis ici. Strava s’appuie sur le compte connecté dans CE navigateur — le tien — et non sur le compte Vorcelab que tu assistes. Autoriser depuis cette fenêtre relierait ton propre Strava : Vorcelab le refuse. Seul l’athlète peut valider, sur son appareil.'
    : missingScope
    ? 'Ton compte Strava est bien lié, mais Vorcelab n’a pas le droit de lire tes sorties. C’est pour ça que ton historique reste vide : sans tes activités, le moteur ne peut ni calculer ton profil, ni adapter ton entraînement, ni projeter tes courses.'
    : 'Vorcelab fonctionne à partir de tes sorties Strava. Tant que ton compte n’est pas relié, l’app reste vide : pas de profil, pas de plan adapté, pas de projection de course.'

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="strava-link-title"
      aria-describedby="strava-link-description"
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, overflowY: 'auto',
        background: 'rgba(5, 5, 7, 0.72)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 520, overflow: 'hidden',
          borderRadius: 22, border: '1px solid rgba(252, 76, 2, 0.4)',
          background: 'linear-gradient(155deg, #241006 0%, var(--vl-surf) 45%, #111216 100%)',
          boxShadow: '0 32px 90px rgba(0,0,0,.7), 0 0 60px rgba(252,76,2,.1)',
        }}
      >
        <button
          onClick={onDismiss}
          aria-label="Fermer"
          style={{
            position: 'absolute', zIndex: 2, top: 12, right: 12,
            width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
            border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.35)',
            color: 'var(--vl-text-2)', fontFamily: 'var(--vl-mono)', fontSize: 13, lineHeight: 1,
          }}
        >
          ✕
        </button>

        <div aria-hidden="true" style={{
          position: 'absolute', width: 340, height: 340, top: -200, right: -140,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(252,76,2,.24), transparent 68%)',
        }} />

        <div style={{ padding: 'clamp(26px, 5.5vw, 42px)' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', marginBottom: 20, borderRadius: 999,
            border: '1px solid rgba(252,76,2,.55)', background: 'rgba(252,76,2,.12)',
            color: '#ff6b2c', fontFamily: 'var(--vl-mono)', fontSize: 10,
            fontWeight: 700, letterSpacing: '.16em',
          }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#FC4C02', boxShadow: '0 0 12px #FC4C02' }} />
            {supportMode
              ? 'AUTORISATION NON DÉLÉGABLE'
              : missingScope ? 'ACCÈS AUX ACTIVITÉS MANQUANT' : 'STRAVA NON CONNECTÉ'}
          </div>

          <h1 id="strava-link-title" style={{
            margin: 0, maxWidth: 430, color: '#fff',
            fontFamily: 'var(--vl-display)', fontWeight: 900,
            fontSize: 'clamp(2rem, 7vw, 3.2rem)', lineHeight: .94,
            letterSpacing: '.01em', textTransform: 'uppercase',
          }}>
            {title}
          </h1>

          <p id="strava-link-description" style={{
            margin: '20px 0 18px', maxWidth: 440,
            color: 'var(--vl-text-2)', fontSize: 14, lineHeight: 1.62,
          }}>
            {description}
          </p>

          <div style={{
            marginBottom: 22, padding: '13px 15px', borderRadius: 12,
            border: '1px solid var(--vl-line-2)', background: 'rgba(0,0,0,.22)',
            color: 'var(--vl-text)', fontFamily: 'var(--vl-mono)',
            fontSize: 11, lineHeight: 1.65,
          }}>
            {supportMode ? (
              <>
                1. Dans ta fenêtre admin, onglet <strong>Assistance</strong> :
                {' '}« Générer et copier le lien Strava ».
                <br />
                2. Envoie ce lien à l’athlète. Les permissions y sont déjà cochées.
                <br />
                3. Le statut se met à jour tout seul ici dès qu’il a validé.
              </>
            ) : (
              <>
                Sur l’écran Strava, <strong>coche impérativement la case concernant l’accès à
                tes activités</strong>. Sans elle, le compte est relié mais Vorcelab ne voit
                aucune sortie.
              </>
            )}
          </div>

          {error ? (
            <div role="alert" style={{
              margin: '-8px 0 16px', color: 'var(--vl-ember)',
              fontSize: 12, lineHeight: 1.5,
            }}>
              {error}
            </div>
          ) : null}

          {/* En assistance, connecter depuis ici est structurellement voué à l'échec :
              on n'affiche aucun bouton d'autorisation. */}
          {!supportMode ? (
            <button
              autoFocus
              disabled={busy}
              onClick={onConnect}
              style={{
                width: '100%', minHeight: 56, padding: '15px 20px',
                border: 'none', borderRadius: 14, cursor: busy ? 'wait' : 'pointer',
                background: '#FC4C02', color: '#fff',
                boxShadow: '0 14px 35px rgba(252,76,2,.26)',
                fontFamily: 'var(--vl-display)', fontSize: '1.15rem',
                fontWeight: 900, letterSpacing: '.07em',
                opacity: busy ? .68 : 1,
              }}
            >
              {busy
                ? 'OUVERTURE STRAVA…'
                : missingScope ? 'AUTORISER MES ACTIVITÉS' : 'CONNECTER MON STRAVA'}
            </button>
          ) : null}

          <button
            onClick={onDismiss}
            style={{
              width: '100%', minHeight: 42, marginTop: 10, padding: '10px 16px',
              border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, cursor: 'pointer',
              background: 'transparent', color: 'var(--vl-text-2)',
              fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700,
              letterSpacing: '.08em',
            }}
          >
            {supportMode ? 'CONTINUER L’ASSISTANCE' : 'PLUS TARD'}
          </button>

          <div style={{
            marginTop: 14, textAlign: 'center',
            color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)',
            fontSize: 9, letterSpacing: '.12em',
          }}>
            {previewMode
              ? 'APERÇU ADMIN · AUCUNE ACTION RÉELLE'
              : supportMode
              ? 'L’ATHLÈTE VALIDE SUR SON APPAREIL · POWERED BY STRAVA'
              : 'TU PEUX CONTINUER SANS · POWERED BY STRAVA'}
          </div>
        </div>
      </div>
    </div>
  )
}
