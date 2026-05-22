import { useEffect } from 'react'
import { createHashRouter, RouterProvider } from 'react-router'
import { supabase } from './lib/supabase'
import { useVLStore } from './store/vlStore'
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

function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useVLStore(s => s.user)
  if (user === null) return <LoginPage />
  return <>{children}</>
}

// Hash router : pas de conflit avec le 404.html legacy de GitHub Pages
const router = createHashRouter([
  {
    path: '/',
    element: <AuthGuard><Layout /></AuthGuard>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'activities', element: <ActivitiesPage /> },
      { path: 'activities/:id', element: <ActivityDetailPage /> },
      { path: 'race', element: <RaceListPage /> },
      { path: 'race/:id', element: <RaceStrategyPage /> },
      { path: 'renfo', element: <ComingSoonPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  const setUser = useVLStore(s => s.setUser)

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
