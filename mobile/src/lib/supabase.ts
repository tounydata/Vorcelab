import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'
import { createSecureStorage } from './secureStorage'

// Même backend que l'app web. Par défaut : prod (runnerdata) → l'utilisateur
// retrouve ses vraies données. Surchargeable par env (EXPO_PUBLIC_*) pour
// pointer le projet dev pendant le développement.
export const SUPA_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
// Clé anon (PUBLIQUE par conception : rôle `anon`, protégée par la RLS). Ce
// n'est pas un secret — elle est destinée à être embarquée dans le client.
export const SUPA_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhbnpya2RncW1jY3R3dm5ibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjYyNjksImV4cCI6MjA5MzAwMjI2OX0.sSjZ956YRpSpCFxDrYDntTvIGHnmVEbe3JDsjTJsze4'

// Session (access + refresh token) stockée dans le Keychain iOS / Keystore
// Android via expo-secure-store — chiffrement au niveau OS. AsyncStorage (en
// clair) n'est utilisé que pour migrer une session existante puis est vidé.
const authStorage = createSecureStorage({
  secure: SecureStore,
  legacy: AsyncStorage,
})

export const supabase = createClient(SUPA_URL, SUPA_KEY, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
