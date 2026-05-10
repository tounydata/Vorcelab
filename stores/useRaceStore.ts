import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface Race {
  id: string
  user_id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string
  goal_time: string | null
  created_at: string
}

export interface RaceInsert {
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string
  goal_time: string | null
}

interface RaceState {
  races: Race[]
  loading: boolean
  error: string | null
  loadRaces: () => Promise<void>
  addRace: (race: RaceInsert) => Promise<void>
  deleteRace: (id: string) => Promise<void>
}

export const useRaceStore = create<RaceState>((set, get) => ({
  races: [],
  loading: false,
  error: null,

  loadRaces: async () => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('race_calendar')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true })
      if (error) throw error
      set({ races: (data ?? []) as Race[], loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de chargement'
      set({ error: message, loading: false })
    }
  },

  addRace: async (raceData) => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('race_calendar')
        .insert({
          ...raceData,
          user_id: user.id,
          gpx_data: null,
          strava_activity_id: null,
          athlete_profile: null,
        })
        .select()
        .single()
      if (error) throw error
      set({ races: [...get().races, data as Race], loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de sauvegarde'
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
      set({ error: message })
    }
  },
}))
