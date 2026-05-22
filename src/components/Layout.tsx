import { NavLink, Outlet } from 'react-router'
import { useVLStore } from '../store/vlStore'

const NAV = [
  { to: '/',            label: 'Dashboard',  icon: '◈' },
  { to: '/activities',  label: 'Activités',  icon: '⚡' },
  { to: '/race',        label: 'Stratégie',  icon: '◎' },
  { to: '/renfo',       label: 'Renfo',      icon: '▲' },
  { to: '/profile',     label: 'Profil',     icon: '○' },
]

export function Layout() {
  const user = useVLStore(s => s.user)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar desktop */}
      <nav style={{ width: 200, flexShrink: 0, background: 'var(--vl-surf,#111214)', borderRight: '1px solid var(--vl-line)', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 900, letterSpacing: '.08em', padding: '0 20px 20px', color: 'var(--vl-ember,#E5562A)' }}>
          VORCELAB
        </div>
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 20px',
              fontFamily: 'var(--vl-mono)',
              fontSize: '.7rem',
              fontWeight: 600,
              letterSpacing: '.06em',
              color: isActive ? 'var(--vl-text-1)' : 'var(--vl-text-3)',
              background: isActive ? 'var(--vl-surf-2)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--vl-ember)' : '2px solid transparent',
              textDecoration: 'none',
              transition: 'color .15s, background .15s',
            })}
          >
            <span style={{ fontSize: '.8rem', opacity: .7 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto', padding: '16px 20px', fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>
          {user?.email}
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', maxWidth: '100%' }}>
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <nav style={{
        display: 'none',
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--vl-surf)', borderTop: '1px solid var(--vl-line)',
        padding: '8px 0 env(safe-area-inset-bottom)',
        gridTemplateColumns: `repeat(${NAV.length}, 1fr)`,
      }} className="vl-bottom-nav">
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: isActive ? 'var(--vl-ember)' : 'var(--vl-text-3)',
            textDecoration: 'none', padding: '4px 0',
          })}>
            <span style={{ fontSize: '1rem' }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
