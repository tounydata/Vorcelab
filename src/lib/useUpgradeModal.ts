import { create } from 'zustand'

export interface PerformanceTeaser {
  vdot: number
  weeksToRace: number
  distanceKm: number
  raceName: string
}

interface UpgradeModalStore {
  open: boolean
  teaser: PerformanceTeaser | null
  openModal: (teaser?: Partial<PerformanceTeaser> | null) => void
  closeModal: () => void
}

export const useUpgradeModal = create<UpgradeModalStore>((set) => ({
  open: false,
  teaser: null,
  openModal: (teaser = null) => set({
    open: true,
    teaser: teaser ? { vdot: 0, weeksToRace: 0, distanceKm: 0, raceName: '', ...teaser } : null,
  }),
  closeModal: () => set({ open: false }),
}))
