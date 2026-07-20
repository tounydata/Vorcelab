// Politique de validation scientifique (§9) — logique PURE, testable, isomorphe.
//
// Deux exigences de la roadmap, rendues explicites et vérifiables ici :
//   • GELER une version de moteur pendant la collecte prospective : tant que la campagne
//     est ouverte, seule la version `FROZEN_ENGINE_VERSION` produit des données de VALIDATION.
//     Si le moteur évolue (ENGINE_VERSION change), ses projections ne comptent plus comme
//     validation — il faudrait ouvrir une NOUVELLE campagne. Le test de parité garantit que
//     la version gelée == la version courante au moment où la campagne est définie.
//   • SÉPARER développement et validation : une projection ne peut être « validation » que si
//     (a) elle porte la version gelée ET (b) la course démarre APRÈS le début de campagne (donc
//     jamais rétro-ajustée). Tout le reste est « développement » (échantillon rétrospectif,
//     mise au point). Aucune fuite : on ne requalifie jamais du dev en validation a posteriori.

export type DataSplit = 'development' | 'validation'

export interface ValidationCampaign {
  /** Identifiant humain de la campagne. */
  label: string
  /** Version de moteur GELÉE pour la durée de la campagne. */
  frozenEngineVersion: string
  /** Début de campagne (ISO). Une course doit démarrer à cette date ou après pour être éligible. */
  startAtISO: string
}

/**
 * Campagne de validation prospective en cours. `frozenEngineVersion` DOIT égaler
 * `ENGINE_VERSION` à l'ouverture (garanti par `validationPolicy.test.ts`). Pour geler une
 * nouvelle version, on ouvre une nouvelle campagne (nouveau label + date).
 */
export const VALIDATION_CAMPAIGN: ValidationCampaign = {
  label: 'campagne-2026.07',
  frozenEngineVersion: '2026.07-7',
  startAtISO: '2026-07-20T00:00:00.000Z',
}

/** Vrai si la version fournie est celle gelée pour la campagne (collecte de validation ouverte). */
export function isEngineFrozenForValidation(
  engineVersion: string,
  campaign: ValidationCampaign = VALIDATION_CAMPAIGN,
): boolean {
  return engineVersion === campaign.frozenEngineVersion
}

/**
 * Classe une projection en développement ou validation. Validation UNIQUEMENT si la version
 * est gelée ET la course démarre à/aprés le début de campagne. Sinon développement.
 */
export function classifyDataSplit(
  input: { engineVersion: string; raceStartAtMs: number },
  campaign: ValidationCampaign = VALIDATION_CAMPAIGN,
): DataSplit {
  const campaignStartMs = Date.parse(campaign.startAtISO)
  if (!Number.isFinite(input.raceStartAtMs) || !Number.isFinite(campaignStartMs)) return 'development'
  if (!isEngineFrozenForValidation(input.engineVersion, campaign)) return 'development'
  return input.raceStartAtMs >= campaignStartMs ? 'validation' : 'development'
}
