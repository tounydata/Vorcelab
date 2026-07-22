// Versions des documents légaux + logique PURE d'acceptation versionnée.
// La version = la date de « Dernière mise à jour » affichée sur chaque document.
// Quand un document change de manière substantielle, on incrémente sa version ici
// → les utilisateurs devront ré-accepter (re-consentement).

export type LegalDoc = 'cgu' | 'privacy'

export const CURRENT_LEGAL_VERSIONS: Record<LegalDoc, string> = {
  cgu: '2026-07-21',
  privacy: '2026-07-21',
}

export const LEGAL_DOCS: LegalDoc[] = ['cgu', 'privacy']

// Informations obligatoires encore manquantes avant l'ouverture des paiements réels.
// Tant que la liste n'est pas vide, le parcours commercial doit rester verrouillé.
export const MISSING_LEGAL_INFO: string[] = [
  'Immatriculation de l’entreprise individuelle / micro-entreprise',
  'SIREN / SIRET',
  'Adresse professionnelle publique',
  'Numéro de téléphone professionnel',
  'Coordonnées du médiateur de la consommation après adhésion',
  'Identité complète de l’hébergeur web commercial définitif',
  'Validation finale des textes et du parcours de paiement avant lancement',
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
