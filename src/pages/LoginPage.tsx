import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/Vorcelab/' },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', fontWeight: 900, letterSpacing: '.08em', color: 'var(--vl-ember)', marginBottom: 8 }}>
          VORCELAB
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 32 }}>
          LE LABORATOIRE DU COUREUR
        </div>

        {sent ? (
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.8rem', color: 'var(--vl-growth)', lineHeight: 1.6 }}>
            ✓ Lien envoyé à <strong>{email}</strong>.<br />
            Vérifie ta boite mail.
          </div>
        ) : (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ton@email.com"
              required
              style={{
                background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)',
                borderRadius: 6, padding: '10px 14px',
                fontFamily: 'var(--vl-mono)', fontSize: '.8rem', color: 'var(--vl-text-1)',
                outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            {error && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-ember)' }}>{error}</div>}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'var(--vl-ember)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '11px 0',
                fontFamily: 'var(--vl-mono)', fontSize: '.75rem', fontWeight: 700,
                letterSpacing: '.08em', cursor: 'pointer',
              }}
            >
              {loading ? '…' : 'CONNEXION PAR LIEN'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
