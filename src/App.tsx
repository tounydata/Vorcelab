import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router'
import { supabase } from './lib/supabase'
import { useVLStore } from './store/vlStore'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ActivitiesPage from './pages/ActivitiesPage'
import RaceListPage from './pages/RaceListPage'
import RaceStrategyPage from './pages/RaceStrategyPage'
import ComingSoonPage from './pages/ComingSoonPage'
import ProfilePage from './pages/ProfilePage'
import NotFoundPage from './pages/NotFoundPage'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, sessionLoaded } = useVLStore()

  if (!sessionLoaded) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <>{children}</>
}

export default function App() {
  const { setUser, setSessionLoaded } = useVLStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setSessionLoaded(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [setUser, setSessionLoaded])

  return (
    <HashRouter>
      <AuthGuard>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="activities" element={<ActivitiesPage />} />
            <Route path="activities/:activityId" element={<ActivitiesPage />} />
            <Route path="race" element={<RaceListPage />} />
            <Route path="race/:raceId" element={<RaceStrategyPage />} />
            <Route path="renfo" element={<ComingSoonPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthGuard>
    </HashRouter>
  )
}
