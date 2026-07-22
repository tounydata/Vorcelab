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
  /** La résolution de session Supabase a échoué ou dépassé le délai maximal :
   *  on affiche un état de récupération au lieu d'un loader infini. */
  sessionError: boolean
  /** Vrai quand une connexion vient d'avoir lieu depuis l'écran de login → on
   *  ramène l'utilisateur au Dashboard (et pas sur la dernière page visitée). */
  loginRedirect: boolean
  /** Admin : simule la vue d'un autre utilisateur (plan tier uniquement). */
  viewAs: ViewAsUser | null
  setUser: (user: User | null) => void
  setSessionLoaded: (loaded: boolean) => void
  setSessionError: (v: boolean) => void
  setLoginRedirect: (v: boolean) => void
  setViewAs: (user: ViewAsUser | null) => void
}

export const useVLStore = create<VLStore>((set) => ({
  user: null,
  sessionLoaded: false,
  sessionError: false,
  loginRedirect: false,
  viewAs: null,
  setUser: (user) => set({ user }),
  setSessionLoaded: (sessionLoaded) => set({ sessionLoaded, ...(sessionLoaded ? { sessionError: false } : {}) }),
  setSessionError: (sessionError) => set({ sessionError }),
  setLoginRedirect: (loginRedirect) => set({ loginRedirect }),
  setViewAs: (viewAs) => set({ viewAs }),
}))
