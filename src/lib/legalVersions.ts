// Versions des documents légaux + logique PURE d'acceptation versionnée.
// La version = la date de « Dernière mise à jour » affichée sur chaque document.
// Quand un document change de manière substantielle, on incrémente sa version ici
// → les utilisateurs devront ré-accepter (re-consentement).

export type LegalDoc = 'cgu' | 'privacy'

export const CURRENT_LEGAL_VERSIONS: Record<LegalDoc, string> = {
  cgu: '2026-07-02',
  privacy: '2026-07-02',
}

export const LEGAL_DOCS: LegalDoc[] = ['cgu', 'privacy']

// Informations légales OBLIGATOIRES encore manquantes (à compléter avant toute
// ouverture commerciale publique). Tant que la liste n'est pas vide, l'application
// ne doit pas se présenter comme commercialement ouverte : LEGAL_INFO_COMPLETE
// reste false et le gate d'acceptation reste inerte (ne nuit pas au développement),
// tandis que le parcours de paiement peut être verrouillé (voir canOpenCommercially).
export const MISSING_LEGAL_INFO: string[] = [
  'Forme juridique de l’éditeur',
  'SIREN / SIRET',
  'Adresse postale de l’éditeur',
  'Directeur de la publication',
  'Médiateur de la consommation',
  'Validation des CGU / politique de confidentialité par un professionnel du droit',
]

/** True uniquement quand toutes les mentions légales obligatoires sont fournies. */
export const LEGAL_INFO_COMPLETE = MISSING_LEGAL_INFO.length === 0

/** L'app peut-elle se présenter comme commercialement ouverte (paywall actif) ? */
export function canOpenCommercially(): boolean {
  return LEGAL_INFO_COMPLETE
}

export interface AcceptanceRecord {
  document: LegalDoc
  version: string
}

/**
 * Documents dont la version courante n'a pas encore été acceptée par l'utilisateur
 * (jamais acceptés, ou acceptés dans une version antérieure → re-consentement).
 */
export function pendingDocuments(
  accepted: AcceptanceRecord[],
  current: Record<LegalDoc, string> = CURRENT_LEGAL_VERSIONS,
): LegalDoc[] {
  const acceptedCurrent = new Set(
    accepted.filter((a) => current[a.document] === a.version).map((a) => a.document),
  )
  return LEGAL_DOCS.filter((doc) => !acceptedCurrent.has(doc))
}

/** L'utilisateur est-il à jour sur TOUS les documents ? */
export function hasAcceptedAll(
  accepted: AcceptanceRecord[],
  current: Record<LegalDoc, string> = CURRENT_LEGAL_VERSIONS,
): boolean {
  return pendingDocuments(accepted, current).length === 0
}
