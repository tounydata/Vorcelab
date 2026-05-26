import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'password' | 'magic' | 'reset'

const REDIRECT = `${window.location.origin}/Vorcelab/app/#/`

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  function clearStatus() { setStatus(null) }
  function goMode(m: Mode) { setMode(m); clearStatus() }

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
    else setStatus({ msg: 'Lien envoyé — vérifiez votre boîte mail.', ok: true })
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); clearStatus()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: REDIRECT,
    })
    setLoading(false)
    if (error) setStatus({ msg: 'Erreur : ' + error.message, ok: false })
    else setStatus({ msg: 'Lien de réinitialisation envoyé.', ok: true })
  }

  return (
    <div id="authScreen" className="show">
      <div className="auth-box">

        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-mark">
            <svg width="48" height="48" viewBox="0 0 60 60" fill="none" aria-hidden="true">
              <line x1="3" y1="50" x2="57" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
              <path d="M3 44 L14 36 L22 40 L30 12 L38 30 L46 24 L57 32" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="miter" strokeLinecap="square" fill="none" />
              <circle cx="30" cy="12" r="3.5" fill="#E5562A" />
              <line x1="30" y1="50" x2="30" y2="55" stroke="#E5562A" strokeWidth="1.8" />
            </svg>
          </div>
          <div>
            <div className="auth-brand-title">VORCELAB</div>
            <div className="auth-brand-sub">Le laboratoire du coureur</div>
          </div>
        </div>

        {/* ── Mode : email + mot de passe ── */}
        {mode === 'password' && (
          <>
            <form onSubmit={handlePassword}>
              <input
                className="fi"
                type="email"
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <input
                className="fi"
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Connexion…' : 'CONNEXION'}
              </button>
            </form>

            {status && (
              <div className="auth-msg" style={{ color: status.ok ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>
                {status.msg}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: '1.25rem', alignItems: 'center' }}>
              <button className="auth-link" onClick={() => goMode('reset')}>
                Mot de passe oublié ?
              </button>
              <button className="auth-link" onClick={() => goMode('magic')}>
                Connexion sans mot de passe
              </button>
            </div>
          </>
        )}

        {/* ── Mode : lien magique ── */}
        {mode === 'magic' && (
          <>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--vl-text-3)', marginBottom: '1rem' }}>
              Connexion par lien magique
            </div>
            <form onSubmit={handleMagicLink}>
              <input
                className="fi"
                type="email"
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <button className="btn-primary" type="submit" disabled={loading || !!status?.ok}>
                {loading ? 'Envoi…' : 'ENVOYER LE LIEN'}
              </button>
            </form>

            {status && (
              <div className="auth-msg" style={{ color: status.ok ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>
                {status.msg}
              </div>
            )}

            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button className="auth-link" onClick={() => goMode('password')}>
                ← Connexion avec mot de passe
              </button>
            </div>
          </>
        )}

        {/* ── Mode : mot de passe oublié ── */}
        {mode === 'reset' && (
          <>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--vl-text-3)', marginBottom: '1rem' }}>
              Réinitialiser le mot de passe
            </div>
            <form onSubmit={handleReset}>
              <input
                className="fi"
                type="email"
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <button className="btn-primary" type="submit" disabled={loading || !!status?.ok}>
                {loading ? 'Envoi…' : 'ENVOYER LE LIEN'}
              </button>
            </form>

            {status && (
              <div className="auth-msg" style={{ color: status.ok ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>
                {status.msg}
              </div>
            )}

            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button className="auth-link" onClick={() => goMode('password')}>
                ← Retour
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
