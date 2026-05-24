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
      {/* Sidebar desktop — cachée via .sidebar{display:none} à 900px */}
      <nav className="sidebar" style={{ width: 200, flexShrink: 0, background: 'var(--vl-surf,#111214)', borderRight: '1px solid var(--vl-line)', padding: '20px 0', flexDirection: 'column', gap: 2 }}>
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
      <main className="app-main" style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', maxWidth: '100%' }}>
        <Outlet />
      </main>

      {/* Bottom nav mobile — visible via .bottom-nav{display:flex} à 900px */}
      <nav className="bottom-nav" style={{
        flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
        padding: '6px 0 env(safe-area-inset-bottom)',
      }}>
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
