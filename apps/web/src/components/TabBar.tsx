import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { path: '/', label: 'Dashboard', icon: '⊞' },
  { path: '/calendar', label: 'Calendrier', icon: '◎' },
  { path: '/activities', label: 'Renfo', icon: '↗' },
] as const

export function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav
      aria-label="Navigation principale"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        minHeight: 60,
        zIndex: 999,
        background: 'rgba(6,8,16,.85)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(0,212,255,.22)',
        boxShadow: '0 -8px 24px rgba(0,0,0,.35)',
        display: 'flex',
        visibility: 'visible',
        opacity: 1,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
      {TABS.map((tab) => {
        const active = location.pathname === tab.path
        return (
          <button
            key={tab.path}
            onClick={() => {
              void navigate(tab.path)
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 0',
              border: 'none',
              background: 'transparent',
              color: active ? 'var(--cyan)' : 'var(--text3)',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: '.5rem',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              gap: 4,
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{tab.icon}</span>
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
