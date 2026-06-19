import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Même backend que l'app web. Par défaut : prod (runnerdata) → l'utilisateur
// retrouve ses vraies données. Surchargeable par env (EXPO_PUBLIC_*) pour
// pointer le projet dev pendant le développement.
const SUPA_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
const SUPA_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhbnpya2RncW1jY3R3dm5ibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjYyNjksImV4cCI6MjA5MzAwMjI2OX0.sSjZ956YRpSpCFxDrYDntTvIGHnmVEbe3JDsjTJsze4'

export const supabase = createClient(SUPA_URL, SUPA_KEY, {
  auth: {
    // En natif : pas d'URL de redirection, stockage chiffré côté appareil.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
