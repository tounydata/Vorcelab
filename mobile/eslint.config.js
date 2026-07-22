// Config ESLint (flat) — audit 22/07 : `expo lint` ignorait TOUS les fichiers
// faute de config → un pipeline vert masquait toute violation.
// https://docs.expo.dev/guides/using-eslint/
//
// Les règles react-hooks « nouvelle génération » (refs / set-state-in-effect /
// static-components / purity) et no-unescaped-entities sont passées en `warn` :
// elles signalent un style que TOUT le portage natif emploie déjà (le pattern
// loader Supabase-direct documenté dans CLAUDE.md), et les corriger relève d'un
// refactor global hors périmètre de cet audit. Lint TOURNE et RAPPORTE
// désormais ; les vraies règles de correction restent bloquantes (error).
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'scripts/*'],
  },
  {
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
])
