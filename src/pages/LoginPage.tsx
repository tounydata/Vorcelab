import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { startStravaOAuth, stravaConfigured } from '../lib/strava'
import { APPLE_ENABLED } from '../lib/socialAuth'

type Tab = 'login' | 'signup'
type SecondaryMode = 'magic' | 'reset' | null

const REDIRECT = `${window.location.origin}${import.meta.env.BASE_URL}`

// Pitch content — why Vorcelab beats generic running apps
const PITCH_POINTS = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
        <path d="M9 4v16M15 6v16" />
      </svg>
    ),
    title: 'Stratégie km par km',
    desc: 'Charge ton GPX et obtiens allure, nutrition et plan d\'assistance pour chaque kilomètre.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
    title: 'Coach algorithmique',
    desc: 'Plan périodisé + renfo co-périodisé, calculé depuis tes vraies données. Pas une boîte noire.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: 'Spécialité trail',
    desc: 'D+, VAM, dérive cardiaque, gradient — là où Strava et Garmin restent génériques.',
  },
]

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login')
  const [secondary, setSecondary] = useState<SecondaryMode>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const setLoginRedirect = useVLStore((s) => s.setLoginRedirect)

  useEffect(() => { setLoginRedirect(true) }, [setLoginRedirect])

  // Retour d'un échec OAuth Strava (posé par App.tsx) → message clair, une seule fois.
  useEffect(() => {
    let r: string | null = null
    try { r = sessionStorage.getItem('vl-strava-auth-result'); if (r) sessionStorage.removeItem('vl-strava-auth-result') } catch { /* ignore */ }
    if (r === 'error') setStatus({ msg: 'La connexion avec Strava a échoué. Réessaie, ou crée un compte par email.', ok: false })
    else if (r === 'denied') setStatus({ msg: 'Autorisation Strava refusée. Réessaie pour continuer.', ok: false })
  }, [])

  function clearStatus() { setStatus(null) }
  function goTab(t: Tab) { setTab(t); setSecondary(null); clearStatus() }
  function goSecondary(m: SecondaryMode) { setSecondary(m); clearStatus() }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true); clearStatus()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setStatus({ msg: error.message === 'Invalid login credentials'
      ? 'Email ou mot de passe incorrect.'
      : 'Erreur : ' + error.message, ok: false })
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setStatus({ msg: 'Mot de passe : 8 caractères minimum, 1 majuscule et 1 chiffre.', ok: false })
      return
    }
    setLoading(true); clearStatus()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: REDIRECT },
    })
    setLoading(false)
    if (error) { setStatus({ msg: 'Erreur : ' + error.message, ok: false }); return }
    if (data.session) {
      setStatus({ msg: 'Compte créé — connexion…', ok: true })
    } else if (data.user) {
      setStatus({ msg: 'Compte créé ! Confirme ton email (pense aux spams), puis reviens te connecter.', ok: true })
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); clearStatus()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: REDIRECT },
    })
    setLoading(false)
    if (error) setStatus({ msg: 'Erreur : ' + error.message, ok: false })
    else setStatus({ msg: 'Lien envoyé — vérifie ta boîte mail.', ok: true })
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); clearStatus()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: REDIRECT })
    setLoading(false)
    if (error) setStatus({ msg: 'Erreur : ' + error.message, ok: false })
    else setStatus({ msg: 'Lien de réinitialisation envoyé.', ok: true })
  }

  async function handleGoogle() {
    setLoading(true); clearStatus()
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: REDIRECT } })
    // Succès → redirection vers Google en cours (pas de retour ici).
    if (error) { setLoading(false); setStatus({ msg: 'Erreur Google : ' + error.message, ok: false }) }
  }

  async function handleApple() {
    setLoading(true); clearStatus()
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: REDIRECT } })
    if (error) { setLoading(false); setStatus({ msg: 'Erreur Apple : ' + error.message, ok: false }) }
  }

  // Libellé des boutons sociaux selon l'onglet (même action dessous : inscription OU connexion).
  const providerVerb = tab === 'signup' ? "S'inscrire avec" : 'Se connecter avec'

  const sessionExpired = localStorage.getItem('vl-had-session') === '1'

  return (
    <div id="authScreen" className="show">
      {/* ── Outer wrapper : split layout on wide screens ── */}
      <div className="auth-card" style={{
        display: 'flex', width: '100%', maxWidth: 860,
        background: 'var(--vl-surf)', border: '1px solid var(--vl-line-2)',
        borderRadius: 'var(--vl-r-xl)', overflow: 'hidden',
        minHeight: 'min(560px, 90vh)',
      }}>

        {/* ════ LEFT — pitch ════ */}
        <div style={{
          flex: '0 0 46%', padding: '2.5rem 2.25rem',
          background: 'radial-gradient(120% 130% at 0% 0%, rgba(214,128,62,.13), transparent 55%), var(--vl-surf-2)',
          borderRight: '1px solid var(--vl-line)',
          display: 'flex', flexDirection: 'column', gap: 0,
        }} className="auth-pitch">
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2rem' }}>
            <div style={{ color: 'var(--vl-text)' }}>
              <svg width="40" height="40" viewBox="0 0 60 60" fill="none" aria-hidden="true">
                <line x1="3" y1="50" x2="57" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
                <path d="M3 44 L14 36 L22 40 L30 12 L38 30 L46 24 L57 32" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="miter" strokeLinecap="square" fill="none" />
                <circle cx="30" cy="12" r="3.5" fill="#E5562A" />
                <line x1="30" y1="50" x2="30" y2="55" stroke="#E5562A" strokeWidth="1.8" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.7rem', letterSpacing: '.04em', lineHeight: 0.95 }}>VORCELAB</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--vl-text-3)', marginTop: 4 }}>Le laboratoire du coureur</div>
            </div>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--vl-ember)', fontWeight: 600, marginBottom: 8 }}>Le cerveau de ton jour de course</div>
            <p style={{ fontFamily: 'var(--vl-serif)', fontStyle: 'italic', fontSize: '1.15rem', lineHeight: 1.5, color: 'var(--vl-text)', margin: 0 }}>
              Transforme un fichier GPX en plan d'allure, de nutrition et d'assistance — kilomètre par kilomètre.
            </p>
          </div>

          {/* 3 pitch points */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
            {PITCH_POINTS.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  flexShrink: 0, width: 34, height: 34, borderRadius: 8,
                  background: 'rgba(214,128,62,.12)', border: '1px solid rgba(214,128,62,.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--vl-ember)',
                }}>
                  {p.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--vl-text)', marginBottom: 2 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--vl-text-2)', lineHeight: 1.5 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Demo CTA */}
          <a
            href="/demo"
            style={{
              marginTop: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 14px', borderRadius: 'var(--vl-r-sm)',
              border: '1px solid rgba(214,128,62,.35)', background: 'rgba(214,128,62,.07)',
              textDecoration: 'none', color: 'var(--vl-ember)',
              fontFamily: 'var(--vl-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
              transition: 'border-color .15s',
            }}
            onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--vl-ember)')}
            onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(214,128,62,.35)')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v16M15 6v16" />
            </svg>
            VOIR LA DÉMO GPX →
          </a>

          {/* Footer note */}
          <div style={{ marginTop: '1rem', fontFamily: 'var(--vl-mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--vl-text-3)', lineHeight: 1.6 }}>
            SPÉCIALISTE TRAIL · COACH DÉTERMINISTE<br />PAS DE BOÎTE NOIRE IA
          </div>
        </div>

        {/* ════ RIGHT — form ════ */}
        <div style={{ flex: 1, padding: '2.5rem', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Marque compacte — visible uniquement quand le panneau pitch est masqué (mobile) */}
          <div className="auth-mobile-brand">
            <svg width="54" height="54" viewBox="0 0 60 60" fill="none" aria-hidden="true">
              <line x1="3" y1="50" x2="57" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
              <path className="vl-ridge-draw" pathLength={220} d="M3 44 L14 36 L22 40 L30 12 L38 30 L46 24 L57 32" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="miter" strokeLinecap="square" fill="none" />
              <circle className="vl-summit" cx="30" cy="12" r="3.5" fill="#E5562A" />
              <line x1="30" y1="50" x2="30" y2="55" stroke="#E5562A" strokeWidth="1.8" />
            </svg>
            <div>
              <div className="auth-brand-title">VORCELAB</div>
              <div className="auth-brand-sub">Le laboratoire du coureur</div>
            </div>
          </div>

          {sessionExpired && !secondary && (
            <div style={{
              background: 'color-mix(in oklab, var(--vl-amber) 10%, transparent)',
              border: '1px solid color-mix(in oklab, var(--vl-amber) 35%, transparent)',
              borderRadius: 'var(--vl-r-sm)', padding: '9px 12px', marginBottom: '1.25rem',
              fontSize: 12.5, color: 'var(--vl-text)', lineHeight: 1.5,
            }}>
              <strong style={{ color: 'var(--vl-amber)' }}>Ta session a expiré.</strong>{' '}
              Reconnecte-toi — tes données sont intactes.
            </div>
          )}

          {/* ── Secondary views (magic / reset) ── */}
          {secondary === 'magic' && (
            <>
              <button style={{ background: 'none', border: 'none', color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.08em', cursor: 'pointer', padding: 0, marginBottom: '1.25rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => goSecondary(null)}>
                ← RETOUR
              </button>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--vl-text-3)', marginBottom: '1rem' }}>
                Connexion sans mot de passe
              </div>
              <form onSubmit={handleMagicLink}>
                <input className="fi" type="email" placeholder="ton@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                <button className="btn-primary" type="submit" disabled={loading || !!status?.ok}>
                  {loading ? 'Envoi…' : 'ENVOYER LE LIEN'}
                </button>
              </form>
              {status && <div className="auth-msg" style={{ color: status.ok ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>{status.msg}</div>}
            </>
          )}

          {secondary === 'reset' && (
            <>
              <button style={{ background: 'none', border: 'none', color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.08em', cursor: 'pointer', padding: 0, marginBottom: '1.25rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => goSecondary(null)}>
                ← RETOUR
              </button>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--vl-text-3)', marginBottom: '1rem' }}>
                Réinitialiser le mot de passe
              </div>
              <form onSubmit={handleReset}>
                <input className="fi" type="email" placeholder="ton@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                <button className="btn-primary" type="submit" disabled={loading || !!status?.ok}>
                  {loading ? 'Envoi…' : 'ENVOYER LE LIEN'}
                </button>
              </form>
              {status && <div className="auth-msg" style={{ color: status.ok ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>{status.msg}</div>}
            </>
          )}

          {/* ── Main form (login / signup) ── */}
          {!secondary && (
            <>
              {/* Tabs */}
              <div className="auth-tabs" style={{ marginBottom: '1.25rem' }}>
                <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => goTab('login')}>Connexion</button>
                <button className={`auth-tab${tab === 'signup' ? ' active' : ''}`} onClick={() => goTab('signup')}>Inscription</button>
              </div>

              {/* Login form */}
              {tab === 'login' && (
                <form onSubmit={handlePassword}>
                  <input className="fi" type="email" placeholder="ton@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                  <input className="fi" type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Connexion…' : 'SE CONNECTER'}</button>
                </form>
              )}

              {/* Signup form */}
              {tab === 'signup' && (
                <>
                  <form onSubmit={handleSignup}>
                    <input className="fi" type="email" placeholder="ton@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                    <input className="fi" type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                    <button className="btn-primary" type="submit" disabled={loading || !!status?.ok}>{loading ? 'Création…' : 'CRÉER LE COMPTE'}</button>
                  </form>
                  <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginTop: '.5rem', textAlign: 'center' }}>
                    8 caractères minimum, 1 majuscule et 1 chiffre.
                  </div>
                </>
              )}

              {status && <div className="auth-msg" style={{ color: status.ok ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>{status.msg}</div>}

              {/* Connexions sociales — sous le formulaire email */}
              {stravaConfigured() && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '1.1rem 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--vl-line)' }} />
                    <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--vl-text-3)', textTransform: 'uppercase' }}>ou</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--vl-line)' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => startStravaOAuth()}
                      disabled={loading}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        background: '#FC4C02', color: '#fff', border: 'none', borderRadius: 'var(--vl-r-sm)',
                        padding: '12px 16px', fontFamily: 'var(--vl-body)', fontWeight: 700, fontSize: 14,
                        cursor: 'pointer', transition: 'opacity .2s',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.opacity = '.88')}
                      onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                      </svg>
                      {providerVerb} Strava
                    </button>
                    <button
                      onClick={handleGoogle}
                      disabled={loading}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        background: '#fff', color: '#1f1f1f', border: '1px solid var(--vl-line-2)', borderRadius: 'var(--vl-r-sm)',
                        padding: '12px 16px', fontFamily: 'var(--vl-body)', fontWeight: 600, fontSize: 14,
                        cursor: 'pointer', transition: 'opacity .2s',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.opacity = '.88')}
                      onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                      </svg>
                      {providerVerb} Google
                    </button>
                    {APPLE_ENABLED && (
                      <button
                        onClick={handleApple}
                        disabled={loading}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                          background: '#000', color: '#fff', border: '1px solid #000', borderRadius: 'var(--vl-r-sm)',
                          padding: '12px 16px', fontFamily: 'var(--vl-body)', fontWeight: 600, fontSize: 14,
                          cursor: 'pointer', transition: 'opacity .2s',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.opacity = '.88')}
                        onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                        </svg>
                        {providerVerb} Apple
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Secondary links */}
              <div style={{ display: 'flex', gap: 16, marginTop: '1.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="auth-link" onClick={() => goSecondary('magic')}>Connexion sans mot de passe</button>
                {tab === 'login' && <button className="auth-link" onClick={() => goSecondary('reset')}>Mot de passe oublié ?</button>}
              </div>

              {/* Légal */}
              <div style={{ fontSize: 10, color: 'var(--vl-text-3)', marginTop: '1.25rem', textAlign: 'center', lineHeight: 1.6 }}>
                En créant un compte, tu acceptes les{' '}
                <Link to="/legal/cgu" style={{ color: 'var(--vl-text-2)' }}>CGU</Link> et la{' '}
                <Link to="/legal/confidentialite" style={{ color: 'var(--vl-text-2)' }}>politique de confidentialité</Link>.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Responsive: hide pitch panel on small screens via CSS */}
      <style>{`
        @media (max-width: 640px) {
          .auth-pitch { display: none !important; }
        }
      `}</style>
    </div>
  )
}
