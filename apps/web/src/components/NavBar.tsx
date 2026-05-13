import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { useStravaStore } from '@/features/activities/useStravaStore'
import { useThemeStore, type Theme } from '@/lib/useThemeStore'

function NavLogo() {
  const [err, setErr] = useState(false)
  if (!err) {
    return (
      <img
        src="/logo.png"
        alt="Vorcelab"
        onError={() => { setErr(true) }}
        style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 8 }}
      />
    )
  }
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        background: 'linear-gradient(135deg,var(--cyan),var(--purple))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--display)',
        fontSize: 17,
        color: '#000',
      }}
    >
      V
    </div>
  )
}

const THEME_LABELS: Record<Theme, string> = { dark: '🌙', light: '☀️', auto: 'auto' }
const THEME_CYCLE: Theme[] = ['dark', 'light', 'auto']

export function NavBar() {
  const navigate = useNavigate()
  const { signOut } = useAuthStore()
  const { connected, athleteName } = useStravaStore()
  const { theme, setTheme } = useThemeStore()

  function cycleTheme() {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]
    setTheme(next)
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '.9rem 2rem',
        borderBottom: '1px solid var(--border)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: 'var(--navbar-bg)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <button
        onClick={() => { void navigate('/') }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <NavLogo />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '1.1rem', letterSpacing: '.06em', color: 'var(--text)' }}>
            VORCELAB
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {athleteName || 'Anthony Bollecker'}
          </div>
        </div>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            borderRadius: 20, padding: '5px 11px',
            fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--text2)',
          }}
        >
          <div
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: connected ? 'var(--green)' : 'var(--text3)',
              boxShadow: connected ? '0 0 6px var(--green)' : 'none',
            }}
          />
          Strava
        </div>

        <button
          onClick={cycleTheme}
          title={`Thème : ${theme} — cliquer pour changer`}
          style={{
            padding: '6px 10px',
            borderRadius: 7,
            border: '1px solid var(--border2)',
            background: 'var(--bg3)',
            color: 'var(--text2)',
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: '.72rem',
            minWidth: 36,
          }}
        >
          {THEME_LABELS[theme]}
        </button>

        <button
          onClick={() => { void signOut() }}
          style={{
            padding: '6px 12px', borderRadius: 7,
            border: '1px solid var(--border2)', background: 'var(--bg3)',
            color: 'var(--text2)', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: '.6rem',
          }}
        >
          Déconnexion
        </button>
      </div>
    </header>
  )
}
