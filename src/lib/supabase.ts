import { createClient } from '@supabase/supabase-js'

// Prod par défaut (build GitHub Pages, sans variables d'env). En local, un fichier
// .env.local (gitignored) peut pointer vers le projet dev `runnerprofil`.
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhbnpya2RncW1jY3R3dm5ibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjYyNjksImV4cCI6MjA5MzAwMjI2OX0.sSjZ956YRpSpCFxDrYDntTvIGHnmVEbe3JDsjTJsze4'

export const supabase = createClient(SUPA_URL, SUPA_KEY)
