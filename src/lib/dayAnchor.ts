// Référence temporelle ancrée sur la frontière du jour (début du jour suivant,
// heure locale) plutôt que sur l'instant exact `Date.now()`.
//
// Pourquoi : la projection de course pondère les activités par leur récence
// (décroissances 7 j / 42 j / 60 j / 180 j) et par une fenêtre de 90 j pour la
// confiance. Avec `Date.now()`, le résultat dérive en continu — le dashboard et la
// page Stratégie, calculés à des instants différents (montages distincts, mémoïsation
// React), obtiennent des chiffres légèrement différents (l'écart « 2h22 vs 2h23 »).
//
// En ancrant sur la frontière du jour, la projection devient DÉTERMINISTE sur une même
// journée : les deux pages obtiennent EXACTEMENT le même `estTimeS` (donc la même clé
// de cache météo, donc le même chiffre final). Les décroissances multi-jours sont
// insensibles à cette précision infra-jour ; ancrer sur le début du jour SUIVANT
// garantit en plus que les activités du jour ont un âge positif (pas de poids > 1).
//
// HORLOGE HISTORIQUE (banc de validation) : `nowMs` peut être injecté pour replacer
// le moteur à une date passée (ex. le départ d'une course rejouée). Absent → instant
// réel (comportement de production strictement inchangé). Cet argument permet un
// backtest réellement historique et DÉTERMINISTE, sans jamais monkey-patcher
// l'horloge JavaScript globale du code de production.
export function dayAnchoredNow(nowMs?: number): number {
  const d = nowMs != null ? new Date(nowMs) : new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime() + 86_400_000
}
