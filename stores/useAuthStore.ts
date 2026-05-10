import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  initialised: boolean
  loading: boolean
  error: string | null
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  initialised: false,
  loading: false,
  error: null,

  init: async () => {
    const { data } = await supabase.auth.getSession()
    set({ session: data.session, initialised: true })
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session })
    })
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ error: error.message, loading: false })
      return
    }
    set({ loading: false })
  },

  signUp: async (email, password, name) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) {
      set({ error: error.message, loading: false })
      return
    }
    if (data.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, name })
    }
    set({ loading: false })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null })
  },

  clearError: () => set({ error: null }),
}))
