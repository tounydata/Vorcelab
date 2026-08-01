import type { NutritionIntakePlan } from './nutritionPlan'

// ── Checklist « à préparer la veille » ────────────────────────────────────────
// Le plan nutrition dit QUAND manger pendant la course. Il ne dit pas COMBIEN
// mettre dans le sac la veille au soir — c'est pourtant là que la course se perd
// (un gel oublié = 25 g de glucides en moins, un déficit qu'on ne rattrape pas).
// Ce module agrège les prises planifiées en une liste d'achat/préparation :
// combien d'unités de CHAQUE produit, combien d'eau, combien de sodium.
// Purement dérivé du plan → aucun chiffre saisi en dur qui pourrait le contredire.

/** Contenance de référence d'une flasque souple (ml). */
const FLASK_ML = 500
/** Sodium par capsule de sel du marché (mg) — sert d'ordre de grandeur. */
const SODIUM_PER_CAPSULE_MG = 300
/** Dose de caféine au-delà de laquelle on alerte sur la journée (mg). */
const CAFFEINE_WARN_MG = 400

export type ChecklistGroup = 'fuel' | 'hydration'

export interface ChecklistItem {
  /** Identifiant stable (sert de clé de cochage persistée). */
  id: string
  group: ChecklistGroup
  label: string
  /** Quantité à préparer (unités, flasques, capsules…). */
  qty: number
  unit: string
  /** Détail chiffré (glucides, caféine, volume…). */
  detail: string
  /** Vrai pour la marge de sécurité (non planifiée, recommandée). */
  spare?: boolean
}

export interface PrepChecklist {
  items: ChecklistItem[]
  /** Glucides embarqués (hors secours), g. */
  totalCarbs: number
  /** Caféine embarquée (hors secours), mg. */
  totalCaffeineMg: number
  /** Volume total de boisson prévu sur la course, ml. */
  hydrationMl: number
  /** Sodium total prévu sur la course, mg. */
  sodiumMg: number
  /** Nombre de prises qui tombent sur un ravitaillement. */
  atAidStations: number
  notes: string[]
  /** Rien à préparer (course trop courte / pas de plan). */
  empty: boolean
}

/** Arrondi « propre » pour l'affichage des volumes (au 100 ml près). */
function roundMl(ml: number): number {
  return Math.round(ml / 100) * 100
}

/**
 * Construit la checklist de préparation à partir du plan de prises.
 * `estTimeS` sert aux totaux d'hydratation/sodium (cibles exprimées par heure).
 */
export function buildPrepChecklist(plan: NutritionIntakePlan, estTimeS: number): PrepChecklist {
  const hours = Math.max(0, estTimeS) / 3600
  const hydrationMl = roundMl(plan.hydrationMlPerH * hours)
  const sodiumMg = Math.round(plan.sodiumMgPerH * hours)

  if (plan.tooShort || plan.intakes.length === 0) {
    const items: ChecklistItem[] = []
    const notes: string[] = []
    if (hydrationMl > 0) {
      items.push({
        id: 'hydration:water',
        group: 'hydration',
        label: 'Eau / boisson',
        qty: Math.max(1, Math.ceil(hydrationMl / FLASK_ML)),
        unit: `flasque${Math.ceil(hydrationMl / FLASK_ML) > 1 ? 's' : ''} de ${FLASK_ML} ml`,
        detail: `~${hydrationMl} ml sur la course`,
      })
      notes.push('Course courte : les réserves suffisent, prépare surtout la boisson.')
    } else {
      notes.push('Course trop courte pour une stratégie glucidique — bois à la soif.')
    }
    return {
      items, totalCarbs: 0, totalCaffeineMg: 0, hydrationMl, sodiumMg,
      atAidStations: 0, notes, empty: items.length === 0,
    }
  }

  // ── Regroupement des prises par produit ────────────────────────────────────
  // Deux prises du même gel = une seule ligne « ×N » : c'est ce qu'on met dans
  // le sac, pas ce qu'on avale à telle minute.
  const groups = new Map<string, { label: string; qty: number; carbs: number; caffeineMg: number; isDrink: boolean }>()
  for (const it of plan.intakes) {
    const key = `${it.kind}:${it.label}`
    const g = groups.get(key) ?? { label: it.label, qty: 0, carbs: 0, caffeineMg: 0, isDrink: it.kind === 'drink' }
    g.qty += 1
    g.carbs += it.carbs
    g.caffeineMg += it.caffeineMg
    groups.set(key, g)
  }

  const items: ChecklistItem[] = []
  let totalCarbs = 0
  let totalCaffeineMg = 0
  let solidUnits = 0

  for (const [key, g] of groups) {
    totalCarbs += g.carbs
    totalCaffeineMg += g.caffeineMg
    if (!g.isDrink) solidUnits += g.qty
    const bits = [`${g.carbs} g de glucides`]
    if (g.caffeineMg > 0) bits.push(`${g.caffeineMg} mg de caféine`)
    items.push({
      id: `fuel:${key}`,
      group: 'fuel',
      label: g.label,
      qty: g.qty,
      unit: g.isDrink ? (g.qty > 1 ? 'doses' : 'dose') : (g.qty > 1 ? 'unités' : 'unité'),
      detail: bits.join(' · '),
    })
  }
  items.sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label, 'fr'))

  // Marge de sécurité : un gel tombe de la poche, un ravito est à sec, la course
  // dure plus longtemps que prévu. ~10 % des prises solides, 1 minimum.
  if (solidUnits > 0) {
    const spare = Math.max(1, Math.round(solidUnits * 0.1))
    items.push({
      id: 'fuel:spare',
      group: 'fuel',
      label: 'Gels de secours',
      qty: spare,
      unit: spare > 1 ? 'unités' : 'unité',
      detail: 'Marge si tu perds une prise ou si tu dépasses le temps cible',
      spare: true,
    })
  }

  // ── Hydratation & sodium ───────────────────────────────────────────────────
  if (hydrationMl > 0) {
    const flasks = Math.max(1, Math.ceil(hydrationMl / FLASK_ML))
    items.push({
      id: 'hydration:water',
      group: 'hydration',
      label: 'Eau / boisson (flasques remplies + rechargées aux ravitos)',
      qty: Math.min(2, flasks),
      unit: `flasque${Math.min(2, flasks) > 1 ? 's' : ''} de ${FLASK_ML} ml`,
      detail: `~${hydrationMl} ml prévus sur la course (~${plan.hydrationMlPerH} ml/h)`,
    })
  }
  if (sodiumMg > 0) {
    const caps = Math.max(1, Math.round(sodiumMg / SODIUM_PER_CAPSULE_MG))
    items.push({
      id: 'hydration:sodium',
      group: 'hydration',
      label: 'Sodium (capsules de sel ou boisson électrolytes)',
      qty: caps,
      unit: caps > 1 ? 'capsules' : 'capsule',
      detail: `~${sodiumMg} mg prévus (~${plan.sodiumMgPerH} mg/h) · ${SODIUM_PER_CAPSULE_MG} mg/capsule — inutile si ta boisson en contient déjà`,
    })
  }

  // ── Notes de préparation ───────────────────────────────────────────────────
  const atAidStations = plan.intakes.filter((i) => i.atAidStation).length
  const notes: string[] = []
  notes.push('Prépare tout la veille : rien à décider le matin, rien à acheter sur place.')
  if (solidUnits > 0) notes.push('Répartis les gels dans les poches avant/arrière et pré-entaille les opercules.')
  if (atAidStations > 0) {
    notes.push(`${atAidStations} prise${atAidStations > 1 ? 's tombent' : ' tombe'} sur un ravitaillement — embarque-les quand même, ne compte pas sur le ravito.`)
  }
  if (totalCaffeineMg > 0) {
    notes.push(
      totalCaffeineMg > CAFFEINE_WARN_MG
        ? `${totalCaffeineMg} mg de caféine sur la course : au-dessus de ${CAFFEINE_WARN_MG} mg, à n'envisager que si tu l'as déjà testé à l'entraînement.`
        : `${totalCaffeineMg} mg de caféine au total — jamais une première fois le jour J.`,
    )
  }
  if (plan.shortfall) {
    notes.push(`Déficit : ${plan.plannedCarbsTotal} g planifiés pour ${plan.totalCarbsTarget} g visés — ajoute des produits plus riches avant le départ.`)
  }

  return {
    items, totalCarbs, totalCaffeineMg, hydrationMl, sodiumMg,
    atAidStations, notes, empty: items.length === 0,
  }
}
