// ── Sélection de réglage en LEAVE-ONE-ATHLETE-OUT ────────────────────────────
//
// Pourquoi ce module existe. Le balayage de constantes annonçait dans son en-tête
// une évaluation « hors échantillon », mais mesurait en réalité la macro-moyenne
// des MAPE par athlète sur TOUS les athlètes — puis choisissait le meilleur
// réglage sur cette même mesure. Le réglage était donc jugé par les athlètes qui
// l'avaient élu. Une macro-moyenne corrige le POIDS d'un athlète prolifique ; elle
// ne corrige pas le fait d'avoir vu ses données avant de décider.
//
// Le protocole appliqué ici : pour chaque athlète A, on choisit le réglage sur les
// AUTRES athlètes seulement, puis on mesure l'erreur sur A avec ce réglage-là. La
// moyenne de ces erreurs « jamais vues » est la seule à pouvoir être comparée à la
// production. Avec sept athlètes, c'est la différence entre « ce réglage marche »
// et « ce réglage marche sur les gens qui l'ont choisi ».
//
// Le module est pur : il ne connaît ni le moteur, ni Supabase, ni le format des
// réglages. Il prend des erreurs par athlète et rend un verdict — donc il se teste
// sur des chiffres inventés, y compris le cas qu'on veut attraper : un réglage qui
// gagne en échantillon et perd hors échantillon.

/** Erreurs absolues (%) d'un réglage, athlète par athlète. */
export interface TuningErrors<T> {
  tuning: T
  /** athleteId → erreurs absolues en % (une par course). */
  errorsByAthlete: Map<string, number[]>
}

export interface LoaoPerAthlete<T> {
  athleteId: string
  /** Réglage choisi SANS avoir vu cet athlète. */
  chosen: T
  /** MAPE de l'athlète sous le réglage choisi (mesure hors échantillon). */
  heldOutMape: number
  /** MAPE du même athlète sous le réglage de production (référence). */
  baselineMape: number
}

export interface LoaoVerdict<T> {
  /** Macro-moyenne des MAPE hors échantillon (protocole complet). */
  loaoMape: number
  /** Macro-moyenne des MAPE sous le réglage de production, mêmes athlètes. */
  baselineMape: number
  /** Points de MAPE gagnés (positif = le balayage fait mieux que la production). */
  gain: number
  perAthlete: LoaoPerAthlete<T>[]
  /** Combien de fois chaque réglage a été élu (stabilité de la sélection). */
  selectionCounts: { tuning: T; times: number }[]
  /** Part des athlètes ayant élu le réglage majoritaire (1 = sélection unanime). */
  selectionStability: number
  athletes: number
  /** Verdict : le réglage mérite-t-il d'être adopté ? */
  adopt: boolean
  /** Motif du verdict, en clair, destiné au rapport. */
  reason: string
}

/** Seuil de bruit retenu dans tout le banc : sous 0,5 pt sur 7 athlètes, on ne conclut pas. */
export const LOAO_MIN_GAIN_PT = 0.5
/** En dessous, la sélection change d'un athlète à l'autre : le « meilleur » réglage n'existe pas. */
export const LOAO_MIN_STABILITY = 0.6

function mape(errors: number[] | undefined): number | null {
  if (!errors || errors.length === 0) return null
  return errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length
}

/** Macro-moyenne des MAPE par athlète, en EXCLUANT un athlète (le held-out). */
function macroExcluding<T>(candidate: TuningErrors<T>, excluded: string): number | null {
  const perAthlete: number[] = []
  for (const [athleteId, errors] of candidate.errorsByAthlete) {
    if (athleteId === excluded) continue
    const m = mape(errors)
    if (m != null) perAthlete.push(m)
  }
  if (perAthlete.length === 0) return null
  return perAthlete.reduce((a, b) => a + b, 0) / perAthlete.length
}

/**
 * Applique le protocole complet. `candidates` doit contenir le réglage de
 * production (repéré par `isBaseline`) : c'est la référence, et elle n'est
 * jamais « choisie » — elle est simplement mesurée sur chaque athlète.
 *
 * `sameTuning` sert à compter les sélections (deux réglages égaux doivent
 * compter ensemble) ; par défaut, égalité par sérialisation JSON.
 */
export function selectTuningLeaveOneAthleteOut<T>(
  candidates: TuningErrors<T>[],
  isBaseline: (tuning: T) => boolean,
  sameTuning: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
): LoaoVerdict<T> | null {
  if (candidates.length === 0) return null
  const baseline = candidates.find((c) => isBaseline(c.tuning))
  if (!baseline) return null

  // Athlètes évaluables : présents chez la production ET chez tous les candidats
  // retenus pour le choix (sinon on comparerait des populations différentes).
  const athletes = [...baseline.errorsByAthlete.keys()].filter((a) => mape(baseline.errorsByAthlete.get(a)) != null)
  if (athletes.length < 2) return null // sans au moins deux athlètes, « hors échantillon » n'a pas de sens

  const perAthlete: LoaoPerAthlete<T>[] = []
  for (const held of athletes) {
    // Choix effectué SANS l'athlète tenu à l'écart.
    let best: { tuning: T; macro: number } | null = null
    for (const c of candidates) {
      const macro = macroExcluding(c, held)
      if (macro == null) continue
      if (!best || macro < best.macro) best = { tuning: c.tuning, macro }
    }
    if (!best) continue

    const chosenCandidate = candidates.find((c) => sameTuning(c.tuning, best!.tuning))
    const heldOut = mape(chosenCandidate?.errorsByAthlete.get(held))
    const base = mape(baseline.errorsByAthlete.get(held))
    if (heldOut == null || base == null) continue

    perAthlete.push({ athleteId: held, chosen: best.tuning, heldOutMape: heldOut, baselineMape: base })
  }
  if (perAthlete.length < 2) return null

  const loaoMape = perAthlete.reduce((s, p) => s + p.heldOutMape, 0) / perAthlete.length
  const baselineMape = perAthlete.reduce((s, p) => s + p.baselineMape, 0) / perAthlete.length
  const gain = baselineMape - loaoMape

  // Stabilité : un réglage qui change à chaque athlète retiré n'est pas un réglage,
  // c'est du bruit qui a trouvé une place où se loger.
  const counts: { tuning: T; times: number }[] = []
  for (const p of perAthlete) {
    const found = counts.find((c) => sameTuning(c.tuning, p.chosen))
    if (found) found.times += 1
    else counts.push({ tuning: p.chosen, times: 1 })
  }
  counts.sort((a, b) => b.times - a.times)
  const selectionStability = counts[0].times / perAthlete.length

  let adopt = false
  let reason: string
  if (gain < LOAO_MIN_GAIN_PT) {
    reason = `Gain hors échantillon de ${gain.toFixed(2)} pt — sous le seuil de bruit de ${LOAO_MIN_GAIN_PT} pt sur ${perAthlete.length} athlètes. Ne rien changer.`
  } else if (selectionStability < LOAO_MIN_STABILITY) {
    reason = `Gain de ${gain.toFixed(2)} pt mais sélection INSTABLE (${Math.round(selectionStability * 100)} % des athlètes élisent le même réglage) : le balayage suit les particularités de chacun, pas une propriété du moteur.`
  } else {
    const regressions = perAthlete.filter((p) => p.heldOutMape > p.baselineMape + LOAO_MIN_GAIN_PT)
    adopt = regressions.length === 0
    reason = adopt
      ? `Gain hors échantillon de ${gain.toFixed(2)} pt, sélection stable (${Math.round(selectionStability * 100)} %), aucun athlète ne régresse de plus de ${LOAO_MIN_GAIN_PT} pt.`
      : `Gain moyen de ${gain.toFixed(2)} pt mais ${regressions.length} athlète(s) régressent de plus de ${LOAO_MIN_GAIN_PT} pt : un gain de moyenne payé par quelqu'un n'est pas une amélioration.`
  }

  return {
    loaoMape, baselineMape, gain, perAthlete,
    selectionCounts: counts, selectionStability,
    athletes: perAthlete.length, adopt, reason,
  }
}
