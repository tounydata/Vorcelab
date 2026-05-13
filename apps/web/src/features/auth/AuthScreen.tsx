import { useState } from 'react'
import { useAuthStore } from './useAuthStore'

function AuthLogo() {
  const [err, setErr] = useState(false)
  if (!err) {
    return (
      <img
        src="/logo.png"
        alt="Vorcelab"
        onError={() => { setErr(true) }}
        style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 8 }}
      />
    )
  }
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: 'linear-gradient(135deg,var(--cyan),var(--purple))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--display)',
        fontSize: 24,
        color: '#000',
      }}
    >
      V
    </div>
  )
}

type Tab = 'login' | 'signup'

export function AuthScreen() {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const { signIn, signUp, loading, error, clearError } = useAuthStore()

  function handleTabChange(t: Tab) {
    setTab(t)
    clearError()
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (tab === 'login') {
      await signIn(email, password)
    } else {
      await signUp(email, password, name)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
      }}
    >
      <div
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border2)',
          borderRadius: 16,
          padding: '2.5rem',
          width: '100%',
          maxWidth: 400,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2rem' }}>
          <AuthLogo />
          <div>
            <div
              style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', letterSpacing: '.04em' }}
            >
              VORCELAB
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '.58rem',
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              {tab === 'login' ? 'Connexion' : 'Inscription'}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 2,
            background: 'var(--bg4)',
            borderRadius: 8,
            padding: 3,
            marginBottom: '1.5rem',
          }}
        >
          {(['login', 'signup'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                handleTabChange(t)
              }}
              style={{
                flex: 1,
                padding: 7,
                borderRadius: 6,
                border: 'none',
                background: tab === t ? 'var(--bg2)' : 'transparent',
                color: tab === t ? 'var(--text)' : 'var(--text2)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: '.65rem',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
              }}
            >
              {t === 'login' ? 'Connexion' : 'Créer un compte'}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e)
          }}
        >
          {tab === 'signup' && (
            <input
              style={inputStyle}
              type="text"
              placeholder="Prénom"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
              }}
              required
            />
          )}
          <input
            style={inputStyle}
            type="email"
            placeholder="ton@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
            required
          />
          <input
            style={{ ...inputStyle, marginBottom: '1rem' }}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
            }}
            required
            minLength={8}
          />

          {error && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '.65rem',
                color: 'var(--red)',
                textAlign: 'center',
                marginBottom: '.75rem',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: 'var(--cyan)',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: 11,
              fontFamily: 'var(--body)',
              fontWeight: 700,
              fontSize: '.88rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '…' : tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg3)',
  border: '1px solid var(--border2)',
  borderRadius: 8,
  padding: '10px 14px',
  color: 'var(--text)',
  fontFamily: 'var(--body)',
  fontSize: '.88rem',
  outline: 'none',
  marginBottom: 10,
  display: 'block',
}
