// Garde-fou de PARITÉ web ↔ mobile pour les libs coach PURES (audit §dette :
// « mobile/src/lib est une copie de src/lib mais seul runner-core est protégé ;
// le reste peut diverger silencieusement »). Ce test échoue à l'octet près si une
// copie mobile diverge de sa source web — la règle de portage mobile impose des
// copies byte-identiques pour les moteurs purs (cf. mobile/CLAUDE.md).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Fichiers PURS (aucune dépendance plateforme) devant rester identiques.
const MIRRORED = [
  'lib/coach/courseDemands.ts',
  'lib/coach/planGenerator.ts',
  'lib/coach/workouts.ts',
  'lib/coach/adaptCatalog.ts',
  'lib/gpxCore.ts',
]

describe('parité web ↔ mobile des moteurs coach purs', () => {
  for (const rel of MIRRORED) {
    it(`${rel} est identique à l'octet près`, () => {
      const web = readFileSync(resolve('src', rel), 'utf8')
      const mob = readFileSync(resolve('mobile/src', rel), 'utf8')
      expect(mob, `Divergence : régénérer mobile/src/${rel} depuis src/${rel}`).toBe(web)
    })
  }
})
