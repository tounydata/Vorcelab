import { useEffect } from 'react'
import { HashRouter, Routes, Route, Outlet, useNavigate } from 'react-router'
import { supabase } from './lib/supabase'
import { handleStravaRedirect } from './lib/strava'
import { useVLStore } from './store/vlStore'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ActivitiesPage from './pages/ActivitiesPage'
import RaceListPage from './pages/RaceListPage'
import AddRacePage from './pages/AddRacePage'
import RaceStrategyPage from './pages/RaceStrategyPage'
import RaceStrategyPublicPage from './pages/RaceStrategyPublicPage'
import SessionPreviewPage from './pages/SessionPreviewPage'
import ProfilePage from './pages/ProfilePage'
import NotFoundPage from './pages/NotFoundPage'
import ActivityDetailPage from './pages/ActivityDetailPage'
import CoachPage from './pages/CoachPage'
import RenfoPage from './pages/RenfoPage'
import RenfoSessionPage from './pages/RenfoSessionPage'
import RenfoLibraryPage from './pages/RenfoLibraryPage'
import RenfoExerciseDetailPage from './pages/RenfoExerciseDetailPage'

function PrivateRoutes() {
  const { user, sessionLoaded, loginRedirect, setLoginRedirect } = useVLStore()
  const navigate = useNavigate()

  // Après une connexion depuis l'écran de login → retour au Dashboard (menu
  // principal), pas sur la dernière page restée dans l'URL (cas navigation privée).
  useEffect(() => {
    if (user && loginRedirect) {
      setLoginRedirect(false)
      navigate('/', { replace: true })
    }
  }, [user, loginRedirect, setLoginRedirect, navigate])

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

    // Retour OAuth Strava (?code=…) : échange le code puis recharge l'app connectée.
    handleStravaRedirect().then((res) => {
      if (res === 'connected') window.location.reload()
    })

    return () => subscription.unsubscribe()
  }, [setUser, setSessionLoaded])

  return (
    <HashRouter>
      <Routes>
        {/* Routes publiques — sans authentification */}
        <Route path="s/:shareToken" element={<RaceStrategyPublicPage />} />
        <Route path="preview/session" element={<SessionPreviewPage />} />

        {/* Routes privées — authentification requise */}
        <Route element={<PrivateRoutes />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="coach" element={<CoachPage />} />
            <Route path="activities" element={<ActivitiesPage />} />
            <Route path="activities/:activityId" element={<ActivityDetailPage />} />
            <Route path="race" element={<RaceListPage />} />
            <Route path="race/new" element={<AddRacePage />} />
            <Route path="race/:raceId" element={<RaceStrategyPage />} />
            <Route path="renfo" element={<RenfoPage />} />
            <Route path="renfo/session/:focusKey" element={<RenfoSessionPage />} />
            <Route path="renfo/library" element={<RenfoLibraryPage />} />
            <Route path="renfo/library/:exerciseId" element={<RenfoExerciseDetailPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}
