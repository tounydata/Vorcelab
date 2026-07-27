// Garde-fou GLOBAL de parité web ↔ mobile (audit §dette technique) :
// « mobile/src/lib est une copie de src/lib mais SEUL runner-core est protégé
//   par un test ; le reste peut diverger silencieusement. »
//
// Ce test transforme « tout peut dériver en douce » en « les fichiers identiques
// sont VERROUILLÉS, et chaque divergence est une exception EXPLICITE et justifiée ».
//
// Règles :
//   1. Tout fichier .ts présent des DEUX côtés doit être byte-identique…
//   2. …SAUF s'il figure dans ALLOWED_DIVERGENCES avec une raison (adaptation
//      plateforme légitime : hook natif, client Supabase, OAuth, média natif…).
//   3. Une entrée d'allowlist qui est en réalité identique est REJETÉE (liste
//      tenue honnête : on ne « planque » pas un futur fichier derrière une
//      exception dormante).
//   4. Un nouveau fichier commun qui diverge sans être allowlisté fait ÉCHOUER
//      le test → la dérive silencieuse est impossible à introduire sans revue.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'

const WEB = resolve('src/lib')
const MOB = resolve('mobile/src/lib')

// Divergences AUTORISÉES (adaptation plateforme) → raison obligatoire, visible en revue.
// Retirer une entrée dès que le fichier redevient identique (le test l'exige).
const ALLOWED_DIVERGENCES: Record<string, string> = {
  'supabase.ts': 'Init client : AsyncStorage + URL polyfill natifs vs localStorage web.',
  'strava.ts': 'OAuth : redirection/deep-link Expo vs redirection navigateur.',
  'socialAuth.ts': 'Sign in with Apple via API native (expo) vs OAuth web.',
  'staticMap.ts': 'Rendu carte statique : WebView/natif vs DOM.',
  'shareSticker.ts': 'Stickers de partage : Canvas WebView natif vs DOM Canvas.',
  'streams.ts': 'SUPA_URL inliné : le client mobile n’exporte pas SUPA_URL.',
  'renfoData.ts': 'En-tête eslint-disable propre à la config lint web (any).',
  'renfoMedia.ts': 'Média d’exercice : composants natifs vs <img>/<video> web.',
  'planResolver.ts': 'effectiveTier inliné (le chemin supabase/_shared n’existe pas côté mobile).',
  'crewPlan.ts': 'Export du plan d’assistance : Share/impression natifs vs window.print.',
  'useTrackEvent.ts': 'Source d’auth : useAuth natif vs store Zustand web.',
  'usePlanTier.ts': 'Hook : loader Supabase natif vs TanStack Query web.',
  'useRaceProjection.ts': 'Hook : loader Supabase natif vs TanStack Query web.',
  'useHydrationHabits.ts': 'Hook : loader Supabase natif vs TanStack Query web (calcul pur partagé).',
  'coach/useCoachPlan.ts': 'Hook : loaders Supabase natifs vs TanStack Query web (calculs identiques).',
  'coach/useRunningDUPOverride.ts': 'Hook : loader/persistance natifs vs TanStack Query web.',
}

function listTs(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.ts')) out.push(relative(root, p))
    }
  }
  walk(root)
  return out
}

const webFiles = new Set(listTs(WEB))
const mobFiles = new Set(listTs(MOB))
const common = [...webFiles].filter((f) => mobFiles.has(f)).sort()

const identical = (rel: string) => readFileSync(join(WEB, rel), 'utf8') === readFileSync(join(MOB, rel), 'utf8')

describe('parité web ↔ mobile de src/lib (garde-fou anti-dérive)', () => {
  it('couvre un socle substantiel de fichiers partagés', () => {
    expect(common.length).toBeGreaterThan(60)
  })

  it('tout fichier partagé est identique OU une divergence explicitement justifiée', () => {
    const silentDrift = common.filter((f) => !identical(f) && !(f in ALLOWED_DIVERGENCES))
    expect(
      silentDrift,
      `Dérive SILENCIEUSE détectée (fichiers censés être des copies pures). ` +
      `Régénérer depuis src/lib, ou — si la divergence est une adaptation plateforme ` +
      `légitime — l'ajouter à ALLOWED_DIVERGENCES avec une raison :\n  ${silentDrift.join('\n  ')}`,
    ).toEqual([])
  })

  it('aucune entrée d’allowlist périmée (fichier redevenu identique)', () => {
    const stale = Object.keys(ALLOWED_DIVERGENCES).filter((f) => common.includes(f) && identical(f))
    expect(
      stale,
      `Entrées d'allowlist inutiles (le fichier est identique) → les retirer :\n  ${stale.join('\n  ')}`,
    ).toEqual([])
  })

  it('aucune entrée d’allowlist ne référence un fichier absent', () => {
    const missing = Object.keys(ALLOWED_DIVERGENCES).filter((f) => !common.includes(f))
    expect(missing, `Entrées d'allowlist orphelines :\n  ${missing.join('\n  ')}`).toEqual([])
  })
})
