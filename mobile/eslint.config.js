// Config ESLint (flat) — audit 22/07 : `expo lint` ignorait TOUS les fichiers
// faute de config → un pipeline vert masquait toute violation.
// https://docs.expo.dev/guides/using-eslint/
//
// STRICT (Phase 2 roadmap) : aucune règle n'est rétrogradée en `warn`. Toutes les
// violations react-hooks (refs, set-state-in-effect, static-components, purity,
// exhaustive-deps) et no-unescaped-entities ont été corrigées ; les rares effets
// Expo légitimes (chargement/reset/timer) portent une exception inline JUSTIFIÉE,
// la règle restant en erreur pour tout le reste du code. La CI échoue au moindre
// avertissement (`--max-warnings=0`, cf. package.json).
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'scripts/*'],
  },
])
