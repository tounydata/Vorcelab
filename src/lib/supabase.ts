import { createClient } from '@supabase/supabase-js'

// La clé anon est publique par conception (livrée dans le bundle) — la sécurité
// repose sur la RLS. Les env VITE_* permettent de viser un autre projet
// (dev/staging) sans toucher au code ; défauts = prod.
export const SUPA_URL: string =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
export const SUPA_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhbnpya2RncW1jY3R3dm5ibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjYyNjksImV4cCI6MjA5MzAwMjI2OX0.sSjZ956YRpSpCFxDrYDntTvIGHnmVEbe3JDsjTJsze4'

export const supabase = createClient(SUPA_URL, SUPA_KEY)
