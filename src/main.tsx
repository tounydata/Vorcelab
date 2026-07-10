import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import App from './App'
import { purgeDangerousCaches } from './lib/session'
import '../style.css'

// Nettoie tout cache authentifié laissé par une ancienne version du service
// worker (fuite potentielle de données entre comptes). Sans effet si absent.
void purgeDangerousCaches()

// Monitoring d'erreurs (Sentry) — no-op tant que VITE_SENTRY_DSN n'est pas
// fourni au build (secret GitHub Actions). Erreurs uniquement, pas de tracing :
// préserve le quota gratuit et n'ajoute aucune requête en fonctionnement normal.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  })
}

// Compat HashRouter → BrowserRouter : des URLs `#/…` circulent encore (liens de
// partage /#/s/:token déjà distribués, redirection Stripe /#/payment/success,
// favoris). On les réécrit vers le chemin équivalent AVANT le montage du routeur.
const { hash, search } = window.location
if (hash.startsWith('#/')) {
  const [path, hashQuery] = hash.slice(1).split('?')
  const query = [search.slice(1), hashQuery].filter(Boolean).join('&')
  window.history.replaceState(null, '', path + (query ? `?${query}` : ''))
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
