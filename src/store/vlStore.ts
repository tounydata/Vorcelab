import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { Activity } from '../types/activity'

interface VLStore {
  user: User | null
  activities: Activity[]
  isLoadingActivities: boolean
  stravaConnected: boolean
  setUser: (user: User | null) => void
  setActivities: (activities: Activity[]) => void
  setLoadingActivities: (v: boolean) => void
  setStravaConnected: (v: boolean) => void
}

export const useVLStore = create<VLStore>((set) => ({
  user: null,
  activities: [],
  isLoadingActivities: false,
  stravaConnected: false,
  setUser: (user) => set({ user }),
  setActivities: (activities) => set({ activities }),
  setLoadingActivities: (isLoadingActivities) => set({ isLoadingActivities }),
  setStravaConnected: (stravaConnected) => set({ stravaConnected }),
}))
