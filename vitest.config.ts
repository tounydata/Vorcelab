import { defineConfig } from 'vitest/config'

// Config dédiée aux tests (vitest la préfère à vite.config.ts, qui reste la
// config de build de prod). Elle neutralise la résolution du tsconfig par esbuild
// (`tsconfigRaw`) : certains tests importent des modules purs de `mobile/`, dont
// le tsconfig étend `expo/tsconfig.base` non installé à la racine. On ne transpile
// que du TS simple sans décorateurs, donc aucun réglage tsconfig n'est requis.
export default defineConfig({
  esbuild: { tsconfigRaw: '{}' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}'],
  },
})
