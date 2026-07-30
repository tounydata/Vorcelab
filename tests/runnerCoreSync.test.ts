// Garde-fou : les artefacts Deno de runner-core (paquet + copie _shared consommée par
// l'Edge Function) doivent rester GÉNÉRÉS depuis la source unique src/lib. Ce test échoue
// si quelqu'un édite src/lib sans régénérer (`node scripts/sync-runner-core.mjs`), ou touche
// un artefact à la main → garantit UNE SEULE source de vérité (pas de copie divergente).
import { describe, it, expect } from 'vitest'
import { generate, CORE_FILES, toDeno } from '../scripts/sync-runner-core.mjs'
import { readFileSync, readdirSync } from 'node:fs'
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

  it('couvre bien les 15 fichiers du cœur', () => {
    expect(CORE_FILES).toHaveLength(15)
    expect(CORE_FILES).toContain('buildRunnerProfileCore')
    expect(CORE_FILES).toContain('projectionSnapshot')
    // raceValidation importe raceDetection : sans lui, les artefacts régénérés
    // importeraient un fichier absent et l'edge function casserait au déploiement.
    expect(CORE_FILES).toContain('raceDetection')
    // Consommé par l'edge function detect-races (qualification de l'historique).
    expect(CORE_FILES).toContain('raceDetectionPersistence')
    // runnerProfileAtDate importe walkTransition (courbe de marche + descente apprises
    // depuis la cadence) : sans lui, même symptôme que raceDetection ci-dessus.
    expect(CORE_FILES).toContain('walkTransition')
  })

  // Garde-fou GÉNÉRIQUE, qui rend les trois vérifications ci-dessus redondantes le jour
  // où un quatrième import apparaît. Un fichier du cœur qui importe un module absent des
  // artefacts ne casse AUCUN test Node : il ne casse que l'Edge Function, au déploiement,
  // là où l'erreur coûte le plus cher. On le détecte donc ici, statiquement.
  it('aucun artefact Deno n’importe un fichier absent des artefacts', () => {
    for (const dir of ['packages/runner-core/src', 'supabase/functions/_shared/runner-core']) {
      const present = new Set(
        readdirSync(resolve(dir)).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3)),
      )
      const dangling: string[] = []
      for (const file of readdirSync(resolve(dir)).filter((f) => f.endsWith('.ts'))) {
        const src = readFileSync(resolve(dir, file), 'utf8')
        for (const m of src.matchAll(/from '\.\/([A-Za-z0-9_]+)\.ts'/g)) {
          if (!present.has(m[1])) dangling.push(`${dir}/${file} → ${m[1]}`)
        }
      }
      expect(dangling, `imports non résolus dans ${dir}`).toEqual([])
    }
  })
})
