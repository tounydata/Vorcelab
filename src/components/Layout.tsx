import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'
import { startStravaOAuth, stravaConfigured } from '../lib/strava'
import OnboardingGate from './onboarding/OnboardingGate'
import SpotlightTour, { openFeatureTour } from './onboarding/SpotlightTour'

const SUPA_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co'

interface StravaStatus {
  connected: boolean
  athlete_firstname?: string | null
  last_sync_at?: string | null
}

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
    label: 'Paramètres',
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

/** « il y a X min/h/j » à partir d'un ISO ; « jamais » si absent. */
function formatSync(iso?: string | null): string {
  if (!iso) return 'jamais'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.floor(h / 24)} j`
}

export default function Layout() {
  const user = useVLStore((s) => s.user)
  const { isDark, toggle } = useTheme()
  const queryClient = useQueryClient()
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return
      fetch(`${SUPA_URL}/functions/v1/strava-status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then((r) => r.json()).then((d) => setStravaStatus(d)).catch(() => {})
    })
  }, [user])

  async function syncStrava() {
    setIsSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const r = await fetch(`${SUPA_URL}/functions/v1/strava-refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await r.json()
      if (d.last_sync_at) setStravaStatus((prev) => prev ? { ...prev, last_sync_at: d.last_sync_at } : prev)
      queryClient.invalidateQueries()
    } finally {
      setIsSyncing(false)
    }
  }

  async function disconnectStrava() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch(`${SUPA_URL}/functions/v1/strava-disconnect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {})
    setStravaStatus({ connected: false })
    queryClient.invalidateQueries()
  }

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

  // Panneau Strava réutilisable (sidebar desktop + header mobile) :
  // statut + connecter / dernière sync / forcer sync / déconnecter.
  const stravaPanel = stravaStatus ? (
    stravaStatus.connected ? (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div className="dot dot-on" />
          <span className="mlabel" style={{ margin: 0, color: 'var(--vl-growth)', fontSize: 9 }}>
            STRAVA{stravaStatus.athlete_firstname ? ` · ${stravaStatus.athlete_firstname.toUpperCase()}` : ''}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)' }}>
            sync {formatSync(stravaStatus.last_sync_at)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="hbtn" style={{ fontSize: 9, padding: '3px 8px', flex: 1 }} onClick={syncStrava} disabled={isSyncing}>
            {isSyncing ? 'SYNC…' : 'FORCER SYNC'}
          </button>
          <button className="hbtn" style={{ fontSize: 9, padding: '3px 8px', flex: 1 }} onClick={disconnectStrava}>
            DÉCONNECTER
          </button>
        </div>
      </div>
    ) : (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div className="dot dot-off" />
          <span className="mlabel" style={{ margin: 0, fontSize: 9 }}>STRAVA NON CONNECTÉ</span>
        </div>
        {stravaConfigured() && (
          <button className="hbtn" style={{ fontSize: 9, padding: '3px 8px', width: '100%' }} onClick={startStravaOAuth}>
            CONNECTER STRAVA
          </button>
        )}
      </div>
    )
  ) : null

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
          <NavLink key={to} to={to} end={end} className={navClass}>
            {icon} {label}
          </NavLink>
        ))}

        <div className="sidebar-bottom">
          {stravaPanel && <div style={{ marginBottom: 8 }}>{stravaPanel}</div>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
            <button className="hbtn" title="Revoir le tuto" aria-label="Revoir le tuto" onClick={openFeatureTour} style={{ padding: '4px 11px', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>?</button>
            {themeBtn}
          </div>
          <button
            className="hbtn"
            onClick={() => supabase.auth.signOut()}
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
            <button className="hbtn" title="Revoir le tuto" aria-label="Revoir le tuto" onClick={openFeatureTour} style={{ padding: '4px 11px', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>?</button>
            {themeBtn}
          </div>
        </div>
        {stravaPanel}
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
