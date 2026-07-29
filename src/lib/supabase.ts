import { createClient } from '@supabase/supabase-js'
import {
  isSupportSessionWindow,
  SUPPORT_AUTH_STORAGE_KEY,
} from './supportSession'

// La clé anon est publique par conception (livrée dans le bundle) — la sécurité
// repose sur la RLS. Les env VITE_* permettent de viser un autre projet
// (dev/staging) sans toucher au code ; défauts = prod.
export const SUPA_URL: string =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
export const SUPA_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhbnpya2RncW1jY3R3dm5ibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjYyNjksImV4cCI6MjA5MzAwMjI2OX0.sSjZ956YRpSpCFxDrYDntTvIGHnmVEbe3JDsjTJsze4'

// Garde-fou (audit 22/07) : en dev local sans VITE_SUPABASE_URL, on vise la PROD
// silencieusement — un script ou un test manuel peut y écrire par erreur. On le
// rend impossible à rater dans la console, sans casser le build de prod (qui
// repose volontairement sur ces défauts).
if (import.meta.env.DEV && !import.meta.env.VITE_SUPABASE_URL) {
  console.warn(
    '⚠️ [VL] VITE_SUPABASE_URL absent : ce dev local pointe sur la base de PRODUCTION. ' +
    'Crée un .env.local avec un projet de dev/staging avant toute écriture.',
  )
}

const supportWindow = isSupportSessionWindow()

export const supabase = createClient(
  SUPA_URL,
  SUPA_KEY,
  supportWindow
    ? {
        auth: {
          // La vraie session utilisateur vit uniquement dans la fenêtre
          // d'assistance. Elle ne remplace jamais la session admin stockée dans
          // localStorage et disparaît quand cet onglet est fermé.
          storage: window.sessionStorage,
          storageKey: SUPPORT_AUTH_STORAGE_KEY,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      }
    : undefined,
)
