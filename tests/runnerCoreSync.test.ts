// Garde-fou : les artefacts Deno de runner-core (paquet + copie _shared consommée par
// l'Edge Function) doivent rester GÉNÉRÉS depuis la source unique src/lib. Ce test échoue
// si quelqu'un édite src/lib sans régénérer (`node scripts/sync-runner-core.mjs`), ou touche
// un artefact à la main → garantit UNE SEULE source de vérité (pas de copie divergente).
import { describe, it, expect } from 'vitest'
import { generate, CORE_FILES, toDeno } from '../scripts/sync-runner-core.mjs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('runner-core : source unique src/lib → artefacts Deno (§1, option B)', () => {
  it('les artefacts (packages/runner-core + _shared/runner-core) sont à jour', () => {
    const drift = generate({ check: true })
    expect(drift, `Artefacts périmés — lancer: node scripts/sync-runner-core.mjs\n${drift.join('\n')}`).toEqual([])
  })

  it('la transformation Deno n’ajoute que les extensions .ts aux imports relatifs', () => {
    const src = "import { x } from './gpxCore'\nconst y = import('./bestEfforts')\nimport z from 'external'"
    expect(toDeno(src)).toBe("import { x } from './gpxCore.ts'\nconst y = import('./bestEfforts.ts')\nimport z from 'external'")
  })

  it('l’Edge Function importe bien le cœur partagé (pas de logique dupliquée)', () => {
    const edge = readFileSync(resolve('supabase/functions/compute-runner-profile/index.ts'), 'utf8')
    expect(edge).toContain("from '../_shared/runner-core/mod.ts'")
    expect(edge).toContain('buildRunnerProfileFromActivitiesAndStreams')
    // Plus de ré-implémentation des buckets dans l'Edge Function.
    expect(edge).not.toContain('function aggregateBuckets')
    expect(edge).not.toContain('function processStreams')
  })

  it('couvre bien les 11 fichiers du cœur', () => {
    expect(CORE_FILES).toHaveLength(11)
    expect(CORE_FILES).toContain('buildRunnerProfileCore')
    expect(CORE_FILES).toContain('projectionSnapshot')
  })
})
