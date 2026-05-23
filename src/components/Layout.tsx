import { NavLink, Outlet } from 'react-router'
import { useVLStore } from '../store/vlStore'
import { Icon } from './Icon'
import type { IconName } from './Icon'

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/',            label: 'Dashboard',  icon: 'chart',    end: true },
  { to: '/activities',  label: 'Activités',  icon: 'activity' },
  { to: '/race',        label: 'Stratégie',  icon: 'calendar' },
  { to: '/renfo',       label: 'Renfo',      icon: 'renfo' },
  { to: '/profile',     label: 'Profil',     icon: 'profile' },
]

export function Layout() {
  const user = useVLStore(s => s.user)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar desktop — masquée via .sidebar{display:none} à 900px */}
      <nav className="sidebar">
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 900, letterSpacing: '.08em', padding: '0 20px 24px', color: 'var(--vl-ember)' }}>
          VORCELAB
        </div>
        {NAV.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => 'sidebar-item' + (isActive ? ' active' : '')}
            style={{ textDecoration: 'none' }}
          >
            <Icon name={icon} size={14} />
            {label}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto', padding: '16px 20px 4px', fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>
          {user?.email}
        </div>
      </nav>

      {/* Main content */}
      <main className="vl-main" style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', maxWidth: '100%' }}>
        <Outlet />
      </main>

      {/* Bottom nav mobile — visible via .bottom-nav{display:flex} à 900px */}
      <nav className="bottom-nav" style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: '6px 0 env(safe-area-inset-bottom)' }}>
        {NAV.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              fontFamily: 'var(--vl-mono)', fontSize: '.45rem', letterSpacing: '.08em',
              color: isActive ? 'var(--vl-ember)' : 'var(--vl-text-3)',
              textDecoration: 'none', padding: '4px 8px',
            })}
          >
            <Icon name={icon} size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
