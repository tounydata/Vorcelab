// Identité visuelle Vorcelab — « le laboratoire du coureur ».
// Tokens portés depuis le web (style.css, thème sombre = identité principale).

export const colors = {
  bg: '#15161a',
  surf: '#1c1d22',
  surf2: '#23242a',
  surf3: '#2d2e35',
  line: 'rgba(240,237,229,0.06)',
  line2: 'rgba(240,237,229,0.14)',
  text: '#f0ede5',
  text2: '#a8a59c',
  text3: '#6a6963',
  ember: '#d6803e',
  growth: '#5da084',
  growth2: '#34d399',
  amber: '#d4a843',
  ember2: '#d1583a',
  violet: '#a78bfa',
  status: {
    rest: '#7c95b8',
    prod: '#5da084',
    peak: '#34d399',
    watch: '#d4a843',
    load: '#d6803e',
    over: '#d1583a',
  },
} as const

export const radius = { sm: 8, md: 14, lg: 20, xl: 24 } as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

// Polices : on garde des fallbacks système pour l'instant (les polices de marque
// — Big Shoulders, Inter, Fraunces — seront chargées via expo-font plus tard).
export const font = {
  display: undefined as string | undefined, // titres condensés (à charger)
  body: undefined as string | undefined,
  mono: undefined as string | undefined,
} as const
