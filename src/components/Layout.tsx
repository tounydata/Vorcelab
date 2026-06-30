import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { usePlanTier } from '../lib/usePlanTier'
import { useVLStore } from '../store/vlStore'
import OnboardingGate from './onboarding/OnboardingGate'
import SpotlightTour, { openFeatureTour } from './onboarding/SpotlightTour'
import StravaConnection from './StravaConnection'

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('vl-theme')
    return saved ? saved === 'dark' : true
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    localStorage.setItem('vl-theme', isDark ? 'dark' : 'light')
  }, [isDark])
  return { isDark, toggle: () => setIsDark(d => !d) }
}

const IconSun = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)
const IconMoon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

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
    to: '/coach',
    label: 'Coach',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><polygon points="14.5 9.5 9.5 11.5 9.5 14.5 14.5 12.5" />
      </svg>
    ),
    mobileIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><polygon points="14.5 9.5 9.5 11.5 9.5 14.5 14.5 12.5" />
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
    label: 'Réglages',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    mobileIcon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

function navClass({ isActive }: { isActive: boolean }) {
  return 'sidebar-item' + (isActive ? ' active' : '')
}

export default function Layout() {
  const { isDark, toggle } = useTheme()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const { isAdmin } = usePlanTier()
  const viewAs = useVLStore((s) => s.viewAs)
  const setViewAs = useVLStore((s) => s.setViewAs)
  // Le renfo vit sous l'onglet Coach (fusion coach complet) : /renfo/* allume Coach.
  const coachAlsoActive = pathname.startsWith('/renfo')

  // Préchargement eager de ['activities-strategy'] : les 150 dernières activités
  // nécessaires à la projection de course. Sans ça, le dashboard charge le snapshot
  // DB (last_projection) pendant 1-2 s avant de basculer sur le calcul live.
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['activities-strategy'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('strava_activities')
          .select('*')
          .order('start_date', { ascending: false })
          .limit(150)
        if (error) throw error
        return (data ?? []) as Record<string, unknown>[]
      },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const themeBtn = (
    <button
      onClick={toggle}
      title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      style={{
        background: 'none', border: '1px solid var(--vl-line)', borderRadius: 6,
        cursor: 'pointer', color: 'var(--vl-text-2)', padding: '5px 7px',
        display: 'flex', alignItems: 'center', gap: 4,
        fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.08em',
      }}
    >
      {isDark ? <IconSun /> : <IconMoon />}
      <span style={{ display: 'none' }} className="sidebar-theme-label">{isDark ? 'LIGHT' : 'DARK'}</span>
    </button>
  )

  return (
    <div id="appShell" className="show">
      <OnboardingGate />
      <SpotlightTour />
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
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => navClass({ isActive: isActive || (to === '/coach' && coachAlsoActive) })}
          >
            {icon} {label}
          </NavLink>
        ))}

        <div className="sidebar-bottom">
          {isAdmin && (
            <NavLink
              to="/admin"
              style={{ textDecoration: 'none', display: 'block', marginBottom: 8 }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: '.1em', color: 'var(--vl-ember)',
                background: 'color-mix(in oklab, var(--vl-ember) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--vl-ember) 40%, transparent)',
                borderRadius: 7, padding: '6px 10px',
              }}>
                <span>⚙</span> ADMIN
              </div>
            </NavLink>
          )}
          <div style={{ marginBottom: 8 }}><StravaConnection variant="full" /></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
            <button className="hbtn" title="Revoir le tuto" aria-label="Revoir le tuto" onClick={openFeatureTour} style={{ padding: '4px 11px', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>?</button>
            {themeBtn}
          </div>
          <button
            className="hbtn"
            onClick={() => { localStorage.removeItem('vl-had-session'); supabase.auth.signOut() }}
          >
            Déconnexion
          </button>
        </div>
      </nav>

      <div className="mobile-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StravaConnection variant="compact" />
            <button className="hbtn" title="Revoir le tuto" aria-label="Revoir le tuto" onClick={openFeatureTour} style={{ padding: '4px 11px', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>?</button>
            {themeBtn}
          </div>
        </div>
      </div>

      {viewAs && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 8000,
          background: 'color-mix(in oklab, var(--vl-ember) 92%, black)',
          color: 'var(--vl-ink)', padding: '8px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'var(--vl-mono)', fontSize: 11, fontWeight: 600,
          boxShadow: '0 2px 12px rgba(255,80,30,0.4)',
        }}>
          <span>
            👁 Vue en tant que <strong>{viewAs.name ?? viewAs.email}</strong>
            <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 6 }}>
              · Plan {viewAs.plan_tier.toUpperCase()}{viewAs.is_admin ? ' (admin)' : ''}
            </span>
          </span>
          <button
            onClick={() => setViewAs(null)}
            style={{
              background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(0,0,0,0.3)',
              color: 'var(--vl-ink)', borderRadius: 6, padding: '3px 10px',
              cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700,
            }}
          >✕ Quitter</button>
        </div>
      )}

      <div className="app-main" style={viewAs ? { paddingTop: 38 } : undefined}>
        <main>
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {NAV_ITEMS.map(({ to, end, label, mobileIcon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => 'bni' + (isActive || (to === '/coach' && coachAlsoActive) ? ' active' : '')}
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
