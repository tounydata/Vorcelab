import { create } from 'zustand'

export type Theme = 'dark' | 'light' | 'auto'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
  } else if (theme === 'dark') {
    root.removeAttribute('data-theme')
  } else {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      root.setAttribute('data-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
    }
  }
}

const STORAGE_KEY = 'vorcelab-theme'

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
}

const saved = (localStorage.getItem(STORAGE_KEY) ?? 'dark') as Theme
applyTheme(saved)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: saved,
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
}))
