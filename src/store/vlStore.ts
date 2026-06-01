import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'

interface VLStore {
  user: User | null
  sessionLoaded: boolean
  /** Vrai quand une connexion vient d'avoir lieu depuis l'écran de login → on
   *  ramène l'utilisateur au Dashboard (et pas sur la dernière page visitée). */
  loginRedirect: boolean
  setUser: (user: User | null) => void
  setSessionLoaded: (loaded: boolean) => void
  setLoginRedirect: (v: boolean) => void
}

export const useVLStore = create<VLStore>((set) => ({
  user: null,
  sessionLoaded: false,
  loginRedirect: false,
  setUser: (user) => set({ user }),
  setSessionLoaded: (sessionLoaded) => set({ sessionLoaded }),
  setLoginRedirect: (loginRedirect) => set({ loginRedirect }),
}))
