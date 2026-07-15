import { defineConfig } from 'vitest/config'

// Config dédiée aux tests (vitest la préfère à vite.config.ts, qui reste la
// config de build de prod).
//
// Certains tests importent des modules purs de `mobile/src/lib`, dont le tsconfig
// racine étend `expo/tsconfig.base` (non installé à la racine). Depuis vite 8
// (Rolldown/oxc), l'ancien contournement `esbuild.tsconfigRaw` est ignoré : la
// neutralisation se fait désormais via un tsconfig imbriqué `mobile/src/lib/
// tsconfig.json` (sans extends) qui masque le parent pour la transformation.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}'],
  },
})
