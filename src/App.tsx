import { useEffect, useRef, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Outlet, Navigate, useNavigate, useLocation } from 'react-router'
import { supabase } from './lib/supabase'
import { handleStravaRedirect } from './lib/strava'
import { useVLStore } from './store/vlStore'
import Layout from './components/Layout'
import BrandedLoader from './components/BrandedLoader'
import LoadError from './components/LoadError'
import UpgradeModal from './components/UpgradeModal'
import LegalAcceptanceGate from './components/LegalAcceptanceGate'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'

// Lazy-loading des pages : chaque grande section devient un chunk séparé, chargé
// à la navigation. Réduit fortement le bundle initial (cartes MapLibre/Leaflet,
// moteurs coach/projection, admin, renfo…). Fallback = BrandedLoader.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ActivitiesPage = lazy(() => import('./pages/ActivitiesPage'))
const ActivityDetailPage = lazy(() => import('./pages/ActivityDetailPage'))
const RaceListPage = lazy(() => import('./pages/RaceListPage'))
const AddRacePage = lazy(() => import('./pages/AddRacePage'))
const RaceStrategyPage = lazy(() => import('./pages/RaceStrategyPage'))
const RaceStrategyPublicPage = lazy(() => import('./pages/RaceStrategyPublicPage'))
const SessionPreviewPage = lazy(() => import('./pages/SessionPreviewPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const CoachPage = lazy(() => import('./pages/CoachPage'))
const RenfoSessionPage = lazy(() => import('./pages/RenfoSessionPage'))
const RenfoLibraryPage = lazy(() => import('./pages/RenfoLibraryPage'))
const RenfoExerciseDetailPage = lazy(() => import('./pages/RenfoExerciseDetailPage'))
const DemoStrategyPage = lazy(() => import('./pages/DemoStrategyPage'))
const MobileStravaBridge = lazy(() => import('./pages/MobileStravaBridge'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const PaymentSuccessPage = lazy(() => import('./pages/PaymentSuccessPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const CguPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.CguPage })))
const PrivacyPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.PrivacyPage })))
const MentionsPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.MentionsPage })))

function PrivateRoutes() {
  const { user, sessionLoaded, sessionError, loginRedirect, setLoginRedirect } = useVLStore()
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
    // Résolution de session en échec / trop lente : issue explicite au lieu du
    // loader infini (audit 22/07 — P0.5). Le rechargement retente proprement.
    if (sessionError) {
      return (
        <LoadError
          onRetry={() => window.location.reload()}
          message="Impossible de vérifier ta session — vérifie ta connexion puis réessaie."
        />
      )
    }
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

  return (
    <>
      {/* Consentement versionné CGU/confidentialité — inerte tant que les mentions
          légales obligatoires ne sont pas complètes (LEGAL_INFO_COMPLETE). */}
      <LegalAcceptanceGate />
      <Outlet />
    </>
  )
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

// Au-delà de ce délai sans réponse de Supabase, on propose la récupération
// (l'attente observée en conditions dégradées dépassait plusieurs secondes).
const SESSION_RESOLVE_TIMEOUT_MS = 8000

export default function App() {
  const { setUser, setSessionLoaded, setSessionError } = useVLStore()
  const trackedSession = useRef<string | null>(null)

  useEffect(() => {
    // getSession sans garde-fou peut laisser l'app sur le loader indéfiniment
    // (panne, promesse bloquée). Timeout + catch → état de récupération.
    const timer = setTimeout(() => setSessionError(true), SESSION_RESOLVE_TIMEOUT_MS)
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timer)
      if (session?.user) {
        localStorage.setItem('vl-had-session', '1')
        if (trackedSession.current !== session.user.id) {
          trackedSession.current = session.user.id
          trackSessionStart(session.user.id)
        }
      }
      setUser(session?.user ?? null)
      setSessionLoaded(true)
    }).catch(() => {
      clearTimeout(timer)
      setSessionError(true)
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

    return () => {
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [setUser, setSessionLoaded, setSessionError])

  return (
    <BrowserRouter>
      <UpgradeModal />
      <Suspense fallback={<BrandedLoader />}>
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
        <Route path="legal/mentions" element={<MentionsPage />} />

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
      </Suspense>
    </BrowserRouter>
  )
}
