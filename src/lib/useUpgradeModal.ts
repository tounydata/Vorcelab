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
  previewMode: boolean
  openModal: (teaser?: Partial<PerformanceTeaser> | null) => void
  openPreviewModal: (teaser?: Partial<PerformanceTeaser> | null) => void
  closeModal: () => void
}

export const useUpgradeModal = create<UpgradeModalStore>((set) => ({
  open: false,
  teaser: null,
  previewMode: false,
  openModal: (teaser = null) => set({
    open: true,
    teaser: teaser ? { vdot: 0, weeksToRace: 0, distanceKm: 0, raceName: '', ...teaser } : null,
    previewMode: false,
  }),
  openPreviewModal: (teaser = null) => set({
    open: true,
    teaser: teaser ? { vdot: 0, weeksToRace: 0, distanceKm: 0, raceName: '', ...teaser } : null,
    previewMode: true,
  }),
  closeModal: () => set({ open: false, previewMode: false }),
}))
