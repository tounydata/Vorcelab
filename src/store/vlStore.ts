import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'

export interface ViewAsUser {
  id: string
  email: string
  name: string | null
  plan_tier: string
  plan_expires_at: string | null
  is_admin: boolean
}

interface VLStore {
  user: User | null
  sessionLoaded: boolean
  /** Vrai quand une connexion vient d'avoir lieu depuis l'écran de login → on
   *  ramène l'utilisateur au Dashboard (et pas sur la dernière page visitée). */
  loginRedirect: boolean
  /** Admin : simule la vue d'un autre utilisateur (plan tier uniquement). */
  viewAs: ViewAsUser | null
  setUser: (user: User | null) => void
  setSessionLoaded: (loaded: boolean) => void
  setLoginRedirect: (v: boolean) => void
  setViewAs: (user: ViewAsUser | null) => void
}

export const useVLStore = create<VLStore>((set) => ({
  user: null,
  sessionLoaded: false,
  loginRedirect: false,
  viewAs: null,
  setUser: (user) => set({ user }),
  setSessionLoaded: (sessionLoaded) => set({ sessionLoaded }),
  setLoginRedirect: (loginRedirect) => set({ loginRedirect }),
  setViewAs: (viewAs) => set({ viewAs }),
}))
