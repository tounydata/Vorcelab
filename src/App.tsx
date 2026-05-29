import { useEffect } from 'react'
import { HashRouter, Routes, Route, Outlet } from 'react-router'
import { supabase } from './lib/supabase'
import { useVLStore } from './store/vlStore'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ActivitiesPage from './pages/ActivitiesPage'
import RaceListPage from './pages/RaceListPage'
import RaceStrategyPage from './pages/RaceStrategyPage'
import RaceStrategyPublicPage from './pages/RaceStrategyPublicPage'
import ProfilePage from './pages/ProfilePage'
import NotFoundPage from './pages/NotFoundPage'
import ActivityDetailPage from './pages/ActivityDetailPage'
import CoachPage from './pages/CoachPage'
import RenfoPage from './pages/RenfoPage'
import RenfoSessionPage from './pages/RenfoSessionPage'
import RenfoLibraryPage from './pages/RenfoLibraryPage'
import RenfoExerciseDetailPage from './pages/RenfoExerciseDetailPage'
import RenfoSettingsPage from './pages/RenfoSettingsPage'

function PrivateRoutes() {
  const { user, sessionLoaded } = useVLStore()

  if (!sessionLoaded) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <Outlet />
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
      <Routes>
        {/* Route publique — sans authentification */}
        <Route path="s/:shareToken" element={<RaceStrategyPublicPage />} />

        {/* Routes privées — authentification requise */}
        <Route element={<PrivateRoutes />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="coach" element={<CoachPage />} />
            <Route path="activities" element={<ActivitiesPage />} />
            <Route path="activities/:activityId" element={<ActivityDetailPage />} />
            <Route path="race" element={<RaceListPage />} />
            <Route path="race/:raceId" element={<RaceStrategyPage />} />
            <Route path="renfo" element={<RenfoPage />} />
            <Route path="renfo/session/:focusKey" element={<RenfoSessionPage />} />
            <Route path="renfo/library" element={<RenfoLibraryPage />} />
            <Route path="renfo/library/:exerciseId" element={<RenfoExerciseDetailPage />} />
            <Route path="renfo/settings" element={<RenfoSettingsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}
