import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setStatus('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/Vorcelab/app/#/`,
      },
    })
    setLoading(false)
    if (error) {
      setStatus('Erreur : ' + error.message)
    } else {
      setStatus('Lien envoyé ! Vérifiez votre email.')
    }
  }

  return (
    <div id="authScreen" className="show">
      <div className="auth-box">
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
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Envoi…' : 'CONNEXION PAR LIEN'}
          </button>
        </form>

        {status && <div className="auth-msg">{status}</div>}
      </div>
    </div>
  )
}
