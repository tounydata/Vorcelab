import { create } from 'zustand'

export interface PerformanceTeaser {
  raceName: string
}

interface UpgradeModalStore {
  open: boolean
  teaser: PerformanceTeaser | null
  openModal: (teaser?: PerformanceTeaser | null) => void
  closeModal: () => void
}

export const useUpgradeModal = create<UpgradeModalStore>((set) => ({
  open: false,
  teaser: null,
  openModal: (teaser = null) => set({ open: true, teaser: teaser ?? null }),
  closeModal: () => set({ open: false }),
}))
