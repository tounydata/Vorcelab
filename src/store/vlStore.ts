import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'

interface VLStore {
  user: User | null
  sessionLoaded: boolean
  setUser: (user: User | null) => void
  setSessionLoaded: (loaded: boolean) => void
}

export const useVLStore = create<VLStore>((set) => ({
  user: null,
  sessionLoaded: false,
  setUser: (user) => set({ user }),
  setSessionLoaded: (sessionLoaded) => set({ sessionLoaded }),
}))
