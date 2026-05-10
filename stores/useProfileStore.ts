import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  name: string | null
  fc_max: number | null
  lactate_threshold: number | null
  weight: number | null
  vo2max: number | null
  updated_at: string
}

export interface ProfileUpdate {
  fc_max?: number | null
  lactate_threshold?: number | null
  weight?: number | null
  vo2max?: number | null
}

interface ProfileState {
  profile: Profile | null
  loading: boolean
  error: string | null
  loadProfile: () => Promise<void>
  updateProfile: (updates: ProfileUpdate) => Promise<void>
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  loading: false,
  error: null,

  loadProfile: async () => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      set({ profile: data as Profile | null, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de chargement'
      set({ error: message, loading: false })
    }
  },

  updateProfile: async (updates) => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, ...updates, updated_at: new Date().toISOString() })
        .select()
        .single()
      if (error) throw error
      set({ profile: data as Profile, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de sauvegarde'
      set({ error: message, loading: false })
    }
  },
}))
