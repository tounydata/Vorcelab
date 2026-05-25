import { NavLink, Outlet } from 'react-router'
import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'

const VL_LOGO = (
  <svg width="28" height="28" viewBox="0 0 60 60" fill="none" aria-hidden="true">
    <line x1="3" y1="50" x2="57" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
    <path d="M3 44 L14 36 L22 40 L30 12 L38 30 L46 24 L57 32" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="miter" strokeLinecap="square" fill="none" />
    <circle cx="30" cy="12" r="3.5" fill="#E5562A" />
    <line x1="30" y1="50" x2="30" y2="55" stroke="#E5562A" strokeWidth="1.8" />
  </svg>
)

const NAV_ITEMS = [
  {
    to: '/',
    end: true,
    label: 'Dashboard',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
    mobileIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M3 13L8 6L13 12L17 9L21 14" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/race',
    label: 'Calendrier',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    mobileIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10H21M8 3V7M16 3V7" />
      </svg>
    ),
  },
  {
    to: '/renfo',
    label: 'Renfo',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M5 8V16M19 8V16M2 12H22M7 6V18M17 6V18" />
      </svg>
    ),
    mobileIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M5 8V16M19 8V16M2 12H22M7 6V18M17 6V18" />
      </svg>
    ),
  },
  {
    to: '/activities',
    label: 'Activités',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    mobileIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profil',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
    mobileIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21C4 16.58 7.58 13 12 13C16.42 13 20 16.58 20 21" />
      </svg>
    ),
  },
]

function navClass({ isActive }: { isActive: boolean }) {
  return 'sidebar-item' + (isActive ? ' active' : '')
}

export default function Layout() {
  const user = useVLStore((s) => s.user)

  return (
    <div id="appShell" className="show">
      <nav className="sidebar">
        <NavLink to="/" end className="sidebar-logo" style={{ textDecoration: 'none' }}>
          <div style={{ color: 'var(--vl-text)', flexShrink: 0 }}>{VL_LOGO}</div>
          <div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1rem', letterSpacing: '.06em', color: 'var(--vl-text)', lineHeight: 1 }}>VORCELAB</div>
            <div className="sidebar-subname">Le laboratoire</div>
          </div>
        </NavLink>

        <div className="sidebar-section-label">Navigation</div>

        {NAV_ITEMS.map(({ to, end, label, icon }) => (
          <NavLink key={to} to={to} end={end} className={navClass}>
            {icon} {label}
          </NavLink>
        ))}

        <div className="sidebar-bottom">
          <div className="mlabel" style={{ wordBreak: 'break-all' }}>
            {user?.email?.toLowerCase()}
          </div>
          <button
            className="hbtn"
            onClick={() => supabase.auth.signOut()}
          >
            Déconnexion
          </button>
        </div>
      </nav>

      <div className="mobile-header">
        <NavLink to="/" end style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: 'var(--vl-text)' }}>
            <svg width="24" height="24" viewBox="0 0 60 60" fill="none" aria-hidden="true">
              <line x1="3" y1="50" x2="57" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
              <path d="M3 44 L14 36 L22 40 L30 12 L38 30 L46 24 L57 32" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="miter" strokeLinecap="square" fill="none" />
              <circle cx="30" cy="12" r="3.5" fill="#E5562A" />
              <line x1="30" y1="50" x2="30" y2="55" stroke="#E5562A" strokeWidth="1.8" />
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--vl-display)', fontSize: '.88rem', letterSpacing: '.06em', color: 'var(--vl-text)' }}>VORCELAB</span>
        </NavLink>
      </div>

      <div className="app-main">
        <main>
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {NAV_ITEMS.filter(({ to }) => to !== '/activities').map(({ to, end, label, mobileIcon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => 'bni' + (isActive ? ' active' : '')}
            >
              {mobileIcon}
              <span className="bn-label">{label}</span>
              <div className="bn-dot" />
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
