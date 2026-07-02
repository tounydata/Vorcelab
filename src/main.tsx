import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import '../style.css'

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
