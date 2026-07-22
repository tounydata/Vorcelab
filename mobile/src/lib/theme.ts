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
  // Audit 22/07 (WCAG AA) : ancien #6a6963 ≈ 3,3:1 sur bg — aligné sur le
  // nouveau token web (--vl-text-3), ≥ 4,6:1 sur bg/surf/surf2.
  text3: '#908d84',
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

// Polices de marque (audit design 21/07 — « le plus gros ROI visuel ») :
// chargées via expo-font dans app/_layout.tsx (@expo-google-fonts). Comme sur
// le web : Big Shoulders Display = titres condensés, JetBrains Mono = labels
// scientifiques, Inter = corps de texte. En RN chaque graisse est une famille
// distincte — utiliser la clé correspondant au poids voulu SANS fontWeight
// (Android retomberait sur la police système).
export const font = {
  display: 'BigShouldersDisplay_800ExtraBold',
  displayBold: 'BigShouldersDisplay_700Bold',
  displayBlack: 'BigShouldersDisplay_900Black',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
} as const
