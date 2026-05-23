import { useEffect } from 'react'
import { createHashRouter, RouterProvider } from 'react-router'
import { supabase } from './lib/supabase'
import { useVLStore } from './store/vlStore'

const SUPA_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { ActivityDetailPage } from './pages/ActivityDetailPage'
import { ProfilePage } from './pages/ProfilePage'
import { RaceListPage } from './pages/RaceListPage'
import { RaceStrategyPage } from './pages/RaceStrategyPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RaceSharePage } from './pages/RaceSharePage'
import { RenfoPage } from './pages/RenfoPage'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useVLStore(s => s.user)
  if (user === null) return <LoginPage />
  return <>{children}</>
}

// Hash router : pas de conflit avec le 404.html legacy de GitHub Pages
const router = createHashRouter([
  // Route publique — pas d'AuthGuard, pas de Layout
  { path: '/share/:token', element: <RaceSharePage /> },
  {
    path: '/',
    element: <AuthGuard><Layout /></AuthGuard>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'activities', element: <ActivitiesPage /> },
      { path: 'activities/:id', element: <ActivityDetailPage /> },
      { path: 'race', element: <RaceListPage /> },
      { path: 'race/:id', element: <RaceStrategyPage /> },
      { path: 'renfo', element: <RenfoPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  const setUser = useVLStore(s => s.setUser)

  // Handle Strava OAuth callback (?code=…&state=…)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) return
    const expected = sessionStorage.getItem('strava_oauth_state')
    sessionStorage.removeItem('strava_oauth_state')
    if (!expected || state !== expected) return
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return
      const token = session.access_token
      const r = await fetch(`${SUPA_URL}/functions/v1/strava-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code, scope: params.get('scope') || '' }),
      })
      if (r.ok) {
        fetch(`${SUPA_URL}/functions/v1/strava-refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: '{}',
        })
      }
    })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [setUser])

  return <RouterProvider router={router} />
}
