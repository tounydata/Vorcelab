// SOURCE UNIQUE de vérité du profil coureur pur = src/lib/*.ts (ce que web & mobile
// utilisent déjà). Ce script GÉNÈRE les artefacts Deno consommés par l'Edge Function :
//   packages/runner-core/src/*.ts  (paquet, avec extensions .ts explicites requises par Deno)
//   supabase/functions/_shared/runner-core/*.ts  (copie bundlée par le déploiement)
// + un mod.ts d'entrée. tests/runnerCoreSync.test.ts échoue si les artefacts dérivent de
// la source → garantit une SEULE source de vérité (pas de copie divergente maintenue à la main).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

export const CORE_FILES = [
  'buildRunnerProfileCore', 'runnerProfileAtDate', 'bestEfforts', 'criticalSpeed',
  'gpxCore', 'runnerProfile', 'runnerProfileSchema', 'engineHistory',
  'elevationSmoothing', 'raceValidation',
]

const MOD_TS = `// Point d'entrée runner-core — GÉNÉRÉ par scripts/sync-runner-core.mjs (ne pas éditer).
export {
  buildRunnerProfileFromActivitiesAndStreams,
  assembleRunnerProfile,
  type BuildRunnerProfileCoreInput,
  type RunnerProfileContract,
} from './buildRunnerProfileCore.ts'
export { RUNNER_PROFILE_SCHEMA_VERSION, isRunnerProfileCompatible, buildProfileSchemaMeta } from './runnerProfileSchema.ts'
export { ENGINE_HISTORY_DAYS, RUNNER_PROFILE_WINDOW_DAYS } from './engineHistory.ts'
export type { RawStreamSet, ProfileActivityAtDate } from './runnerProfileAtDate.ts'
`

/** Transforme un fichier src/lib en équivalent Deno : ajoute .ts aux imports relatifs. */
export function toDeno(content) {
  return content
    .replace(/(from '\.\/[A-Za-z0-9_]+)'/g, "$1.ts'")
    .replace(/(import\('\.\/[A-Za-z0-9_]+)'\)/g, "$1.ts')")
}

export function generate({ check } = {}) {
  const SRC = resolve('src/lib')
  const targets = [resolve('packages/runner-core/src'), resolve('supabase/functions/_shared/runner-core')]
  const drift = []
  for (const dst of targets) {
    mkdirSync(dst, { recursive: true })
    for (const f of CORE_FILES) {
      const generated = toDeno(readFileSync(join(SRC, `${f}.ts`), 'utf8'))
      const path = join(dst, `${f}.ts`)
      if (check) {
        let cur = ''
        try { cur = readFileSync(path, 'utf8') } catch { /* missing */ }
        if (cur !== generated) drift.push(path)
      } else writeFileSync(path, generated)
    }
    const modPath = join(dst, 'mod.ts')
    if (check) {
      let cur = ''
      try { cur = readFileSync(modPath, 'utf8') } catch { /* missing */ }
      if (cur !== MOD_TS) drift.push(modPath)
    } else writeFileSync(modPath, MOD_TS)
  }
  return drift
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate()
  console.log('[sync-runner-core] artefacts régénérés depuis src/lib')
}
