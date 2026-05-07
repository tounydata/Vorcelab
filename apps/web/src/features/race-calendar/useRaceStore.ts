import { create } from 'zustand'
import type { Race, RaceInsert } from '@runner-os/shared'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

interface RaceState {
  races: Race[]
  loading: boolean
  error: string | null
  loadRaces: () => Promise<void>
  addRace: (race: Omit<RaceInsert, 'user_id'>) => Promise<void>
  deleteRace: (id: string) => Promise<void>
}

export const useRaceStore = create<RaceState>((set, get) => ({
  races: [],
  loading: false,
  error: null,

  loadRaces: async () => {
    set({ loading: true, error: null })
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('race_calendar')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true })

      if (error) throw error
      set({ races: (data ?? []) as unknown as Race[], loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de chargement'
      logger.error('Failed to load races', { message })
      set({ error: message, loading: false })
    }
  },

  addRace: async (raceData) => {
    set({ loading: true, error: null })
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('race_calendar')
        .insert({ ...raceData, user_id: user.id } as { user_id: string; name: string; date: string; type: string })
        .select()
        .single()

      if (error) throw error
      set({ races: [...get().races, data as unknown as Race], loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de sauvegarde'
      logger.error('Failed to add race', { message })
      set({ error: message, loading: false })
    }
  },

  deleteRace: async (id) => {
    try {
      const { error } = await supabase.from('race_calendar').delete().eq('id', id)
      if (error) throw error
      set({ races: get().races.filter((r) => r.id !== id) })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de suppression'
      logger.error('Failed to delete race', { message })
      set({ error: message })
    }
  },
}))
