import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Outlet, Navigate, useNavigate, useLocation } from 'react-router'
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
import SettingsPage from './pages/SettingsPage'
import NotFoundPage from './pages/NotFoundPage'
import ActivityDetailPage from './pages/ActivityDetailPage'
import CoachPage from './pages/CoachPage'
import RenfoSessionPage from './pages/RenfoSessionPage'
import RenfoLibraryPage from './pages/RenfoLibraryPage'
import RenfoExerciseDetailPage from './pages/RenfoExerciseDetailPage'
import BrandedLoader from './components/BrandedLoader'
import DemoStrategyPage from './pages/DemoStrategyPage'
import MobileStravaBridge from './pages/MobileStravaBridge'
import UpgradeModal from './components/UpgradeModal'
import AdminPage from './pages/AdminPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import LandingPage from './pages/LandingPage'
import { CguPage, PrivacyPage } from './pages/LegalPage'

function PrivateRoutes() {
  const { user, sessionLoaded, loginRedirect, setLoginRedirect } = useVLStore()
  const navigate = useNavigate()
  const location = useLocation()

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
      <BrandedLoader />
    )
  }

  if (!user) {
    // Racine : landing marketing pour les nouveaux visiteurs, login direct pour
    // ceux qui ont déjà eu une session ici. Liens profonds : login (retour au
    // Dashboard après connexion).
    const hadSession = localStorage.getItem('vl-had-session') === '1'
    return location.pathname === '/' && !hadSession ? <LandingPage /> : <LoginPage />
  }

  return <Outlet />
}

// /login public : les CTA de la landing et des pages publiques pointent ici.
function LoginRoute() {
  const user = useVLStore((s) => s.user)
  if (user) return <Navigate to="/" replace />
  return <LoginPage />
}

function trackSessionStart(userId: string) {
  supabase.from('user_events').insert({ user_id: userId, event: 'session_start', meta: {} }).then(() => undefined)
  supabase.rpc('update_last_seen').then(() => undefined)
}

export default function App() {
  const { setUser, setSessionLoaded } = useVLStore()
  const trackedSession = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        localStorage.setItem('vl-had-session', '1')
        if (trackedSession.current !== session.user.id) {
          trackedSession.current = session.user.id
          trackSessionStart(session.user.id)
        }
      }
      setUser(session?.user ?? null)
      setSessionLoaded(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        localStorage.setItem('vl-had-session', '1')
        if (trackedSession.current !== session.user.id) {
          trackedSession.current = session.user.id
          trackSessionStart(session.user.id)
        }
      } else {
        trackedSession.current = null
      }
      setUser(session?.user ?? null)
    })

    // Retour OAuth Strava (?code=…) : échange le code puis recharge l'app connectée.
    handleStravaRedirect().then((res) => {
      if (res === 'connected') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            supabase.from('user_events')
              .insert({ user_id: session.user.id, event: 'strava_connected', meta: {} })
              .then(() => window.location.reload())
          } else {
            window.location.reload()
          }
        })
      } else if (res === 'error' || res === 'denied') {
        // Échec du retour Strava : on le signale sur l'écran de connexion au lieu du silence.
        try { sessionStorage.setItem('vl-strava-auth-result', res) } catch { /* ignore */ }
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, setSessionLoaded])

  return (
    <BrowserRouter>
      <UpgradeModal />
      <Routes>
        {/* Routes publiques — sans authentification */}
        <Route path="s/:shareToken" element={<RaceStrategyPublicPage />} />
        <Route path="preview/session" element={<SessionPreviewPage />} />
        <Route path="demo" element={<DemoStrategyPage />} />
        <Route path="mobile-strava" element={<MobileStravaBridge />} />
        <Route path="payment/success" element={<PaymentSuccessPage />} />
        <Route path="login" element={<LoginRoute />} />
        <Route path="legal/cgu" element={<CguPage />} />
        <Route path="legal/confidentialite" element={<PrivacyPage />} />

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
            {/* L'ancien hub renfo est dissous dans le Coach — on garde la redirection. */}
            <Route path="renfo" element={<Navigate to="/coach" replace />} />
            <Route path="renfo/session/:focusKey" element={<RenfoSessionPage />} />
            <Route path="renfo/library" element={<RenfoLibraryPage />} />
            <Route path="renfo/library/:exerciseId" element={<RenfoExerciseDetailPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="profile/settings" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
