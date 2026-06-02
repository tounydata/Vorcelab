// Catalogue de produits de nutrition à l'effort vendus en France (gels, boissons,
// barres, gommes) avec glucides par portion + caféine. Restauration de la
// fonctionnalité legacy (l'athlète coche ses produits → stockés dans
// profiles.nutrition_products → utilisés par la stratégie de course).
// Données vérifiées sur sites marques/revendeurs FR (2026). `carbs` = g/portion.

export type NutritionType = 'gel' | 'drink' | 'bar' | 'chew'

export interface NutritionProduct {
  id: string
  brand: string
  name: string
  type: NutritionType
  /** Glucides par portion (g). Pour les boissons, par `per` (ex. 500 ml). */
  carbs: number
  /** Caféine par portion (mg). 0 si aucune (variante non caféinée). */
  caffeine: number
  /** Eau requise pour l'ingestion (gels concentrés / boissons). */
  water: boolean
  /** Portion de référence pour les boissons (ex. "500 ml"). */
  per?: string
  note?: string
}

export const NUTRITION_PRODUCTS: NutritionProduct[] = [
  // ── Gels ──
  { id: 'maurten-gel-100', brand: 'Maurten', name: 'Gel 100', type: 'gel', carbs: 25, caffeine: 0, water: false, note: 'Hydrogel, sans eau' },
  { id: 'maurten-gel-100-caf', brand: 'Maurten', name: 'Gel 100 CAF 100', type: 'gel', carbs: 25, caffeine: 100, water: false, note: 'Hydrogel caféiné' },
  { id: 'maurten-gel-160', brand: 'Maurten', name: 'Gel 160', type: 'gel', carbs: 40, caffeine: 0, water: false, note: 'Hydrogel haute énergie' },
  { id: 'sis-go-isotonic', brand: 'SiS', name: 'GO Isotonic Energy Gel', type: 'gel', carbs: 22, caffeine: 0, water: false, note: 'Isotonique, sans eau' },
  { id: 'sis-go-caffeine', brand: 'SiS', name: 'GO Energy + Caffeine', type: 'gel', carbs: 22, caffeine: 75, water: false, note: 'Isotonique caféiné' },
  { id: 'sis-beta-fuel-gel', brand: 'SiS', name: 'Beta Fuel Gel', type: 'gel', carbs: 40, caffeine: 0, water: false, note: '1:0.8, haute énergie' },
  { id: 'sis-beta-fuel-caf', brand: 'SiS', name: 'Beta Fuel + Caffeine', type: 'gel', carbs: 40, caffeine: 200, water: false, note: 'Haute énergie + caféine' },
  { id: 'gu-original', brand: 'GU', name: 'Original Energy Gel', type: 'gel', carbs: 22, caffeine: 20, water: true, note: 'Concentré, avec eau' },
  { id: 'gu-roctane', brand: 'GU', name: 'Roctane Energy Gel', type: 'gel', carbs: 21, caffeine: 35, water: true, note: 'Sodium + BCAA' },
  { id: 'pfh-pf30', brand: 'PF&H', name: 'PF 30 Gel', type: 'gel', carbs: 30, caffeine: 0, water: false, note: 'Goût neutre, 2:1' },
  { id: 'pfh-pf30-caf', brand: 'PF&H', name: 'PF 30 Caffeine Gel', type: 'gel', carbs: 30, caffeine: 100, water: false, note: 'Caféiné' },
  { id: 'pfh-pf90', brand: 'PF&H', name: 'PF 90 Gel', type: 'gel', carbs: 90, caffeine: 0, water: false, note: 'Pochette refermable, très haute énergie' },
  { id: 'naak-ultra-gel', brand: 'Näak', name: 'Ultra Energy Gel', type: 'gel', carbs: 27, caffeine: 35, water: false, note: 'Végétal, partenaire UTMB' },
  { id: 'ta-gel', brand: 'TA Energy', name: 'Energy Gel', type: 'gel', carbs: 33, caffeine: 0, water: false, note: '+BCAA, électrolytes' },
  { id: 'aptonia-gel', brand: 'Aptonia (Decathlon)', name: 'Energy Gel', type: 'gel', carbs: 23, caffeine: 0, water: true, note: 'Accessible, +vitamines' },
  { id: 'aptonia-hydrogel-cola', brand: 'Aptonia (Decathlon)', name: 'Hydrogel Caféine Cola', type: 'gel', carbs: 23, caffeine: 80, water: false, note: 'Hydrogel, fabriqué en France' },
  { id: 'nduranz-gel45', brand: 'Nduranz', name: 'Nrgy Gel 45', type: 'gel', carbs: 45, caffeine: 0, water: true, note: 'Très haute énergie, 1:0.8' },
  { id: 'nduranz-gel45-caf', brand: 'Nduranz', name: 'Nrgy Gel 45 Caffeine', type: 'gel', carbs: 45, caffeine: 65, water: true, note: 'Haute énergie caféiné' },
  { id: 'baouw-gel', brand: 'Baouw', name: 'Gel énergétique Bio', type: 'gel', carbs: 30, caffeine: 0, water: false, note: 'Bio, fruit/agave' },
  { id: 'overstims-coup-de-fouet', brand: 'Overstim.s', name: 'Coup de Fouet', type: 'gel', carbs: 26, caffeine: 0, water: false, note: 'Gelée royale, liquide' },
  { id: 'meltonic-gel-caf', brand: 'Meltonic', name: 'Gel Caféine 200', type: 'gel', carbs: 29, caffeine: 200, water: false, note: 'Miel/guarana' },
  { id: 'powerbar-hydro', brand: 'PowerBar', name: 'PowerGel Hydro', type: 'gel', carbs: 25, caffeine: 100, water: false, note: 'C2MAX 2:1, isotonique (caféine selon parfum)' },
  { id: 'mulebar-gel-coffee', brand: 'Mulebar', name: 'Gel Coffee', type: 'gel', carbs: 27, caffeine: 100, water: false, note: 'Naturel vegan' },
  { id: 'apurna-gel', brand: 'Apurna', name: 'Gel Longue Distance', type: 'gel', carbs: 20, caffeine: 0, water: true, note: 'Français, +électrolytes' },
  { id: 'nutripure-gel', brand: 'Nutripure', name: 'Gel Long Distance', type: 'gel', carbs: 30, caffeine: 0, water: false, note: 'SolidCarbs 2:1, neutre, FR' },
  { id: 'isostar-gel', brand: 'Isostar', name: 'Energy Booster Gel', type: 'gel', carbs: 21, caffeine: 100, water: false, note: 'Caféine selon parfum (cola 100)' },
  { id: 'born-liquid-gel', brand: 'Born', name: 'Super Liquid Gel', type: 'gel', carbs: 22, caffeine: 0, water: false, note: '2:1, facile à avaler' },
  { id: '4endurance-gel', brand: '4Endurance', name: '4Energy Gel', type: 'gel', carbs: 21, caffeine: 0, water: false, note: 'Glucose+fructose + électrolytes' },

  // ── Boissons (par portion / dilution) ──
  { id: 'maurten-drink-320', brand: 'Maurten', name: 'Drink Mix 320', type: 'drink', carbs: 80, caffeine: 0, water: true, per: '500 ml', note: 'Hydrogel, 1:0.8' },
  { id: 'maurten-drink-160', brand: 'Maurten', name: 'Drink Mix 160', type: 'drink', carbs: 40, caffeine: 0, water: true, per: '500 ml', note: 'Dose modérée' },
  { id: 'sis-beta-fuel-80', brand: 'SiS', name: 'Beta Fuel 80', type: 'drink', carbs: 80, caffeine: 0, water: true, per: '500 ml', note: '1:0.8 malto:fructose' },
  { id: 'naak-drink', brand: 'Näak', name: 'Ultra Energy Drink Mix', type: 'drink', carbs: 55, caffeine: 0, water: true, per: 'portion', note: '+électrolytes' },
  { id: 'nduranz-drink90', brand: 'Nduranz', name: 'Nrgy Drink 90', type: 'drink', carbs: 90, caffeine: 0, water: true, per: 'portion', note: 'Très haute énergie ultra' },
  { id: 'nduranz-drink45', brand: 'Nduranz', name: 'Nrgy Drink 45', type: 'drink', carbs: 45, caffeine: 0, water: true, per: 'portion', note: '1:0.8 + électrolytes' },
  { id: 'overstims-hydrixir', brand: 'Overstim.s', name: 'Hydrixir Longue Distance', type: 'drink', carbs: 31, caffeine: 0, water: true, per: '500 ml', note: 'Isotonique, 4 sources + BCAA' },
  { id: 'aptonia-iso', brand: 'Aptonia (Decathlon)', name: 'ISO+ Isotonique', type: 'drink', carbs: 34, caffeine: 0, water: true, per: '500 ml', note: '+BCAA' },
  { id: 'nutripure-drink', brand: 'Nutripure', name: 'Boisson Long Distance', type: 'drink', carbs: 30, caffeine: 0, water: true, per: 'portion', note: 'PureDigest' },
  { id: '4endurance-drink', brand: '4Endurance', name: '4Energy Drink', type: 'drink', carbs: 25, caffeine: 0, water: true, per: '500 ml', note: 'Isotonique + électrolytes (1 dose 30g)' },
  { id: '4endurance-cyclic-dextrin', brand: '4Endurance', name: 'Cyclic Dextrin 4Energy', type: 'drink', carbs: 40, caffeine: 0, water: true, per: '500 ml', note: 'Cluster dextrin, énergie soutenue (dose ~40g)' },

  // ── Barres ──
  { id: 'naak-bar', brand: 'Näak', name: 'Ultra Energy Bar', type: 'bar', carbs: 28, caffeine: 0, water: false, note: '50g, +protéines' },
  { id: 'maurten-solid-160', brand: 'Maurten', name: 'Solid 160', type: 'bar', carbs: 40, caffeine: 0, water: false, note: 'Avoine/riz (2 mini-barres)' },
  { id: 'maurten-solid-c-160', brand: 'Maurten', name: 'Solid C 160', type: 'bar', carbs: 40, caffeine: 100, water: false, note: 'Version caféinée' },
  { id: 'aptonia-barre-dattes', brand: 'Aptonia (Decathlon)', name: 'Barre aux dattes', type: 'bar', carbs: 20, caffeine: 0, water: false, note: '35g, 67% dattes' },
  { id: 'overstims-barre-ultra', brand: 'Overstim.s', name: 'Barre Ultra', type: 'bar', carbs: 27, caffeine: 0, water: false, note: '41g, +BCAA' },
  { id: 'nutripure-barre', brand: 'Nutripure', name: 'Barre Long Distance', type: 'bar', carbs: 30, caffeine: 0, water: false, note: '42g, 70% fruit' },
  { id: 'baouw-barre', brand: 'Baouw', name: 'Barre Extra', type: 'bar', carbs: 24, caffeine: 0, water: false, note: '50g, cru bio vegan' },
  { id: 'mulebar-barre', brand: 'Mulebar', name: 'Barre énergétique', type: 'bar', carbs: 28, caffeine: 0, water: false, note: '40g, bio/vegan' },
  { id: 'veloforte-bar', brand: 'Veloforte', name: 'Energy Bar', type: 'bar', carbs: 40, caffeine: 0, water: false, note: 'Naturel + protéines' },
  { id: 'apurna-barre', brand: 'Apurna', name: 'Barre Abricot-Amande', type: 'bar', carbs: 24, caffeine: 0, water: false, note: '+protéines, vitamines' },
  { id: 'atlet-barre', brand: 'Atlet', name: 'Barre bio Macadamia', type: 'bar', carbs: 21, caffeine: 0, water: false, note: '50g, bio' },
  { id: 'meltonic-barre', brand: 'Meltonic', name: "Tonic'Barre Bio", type: 'bar', carbs: 29, caffeine: 0, water: false, note: 'Miel, bio' },
  { id: 'punch-power-barre', brand: 'Punch Power', name: 'Punchy Bar', type: 'bar', carbs: 14, caffeine: 0, water: false, note: '30g, multi-glucides' },

  // ── Gommes ──
  { id: 'ta-gommes', brand: 'TA Energy', name: 'Energie Gommes (Citron)', type: 'chew', carbs: 24, caffeine: 0, water: false, note: 'Sachet 30g (3 gommes), FR' },
  { id: 'ta-gommes-caf', brand: 'TA Energy', name: 'Energie Gommes (Cola caféine)', type: 'chew', carbs: 24, caffeine: 50, water: false, note: 'Sachet 30g, caféine' },
  { id: 'clif-bloks', brand: 'Clif', name: 'Bloks Energy Chews', type: 'chew', carbs: 24, caffeine: 0, water: false, note: 'Par 3 bloks (caféine selon parfum)' },
  { id: 'gu-chews', brand: 'GU', name: 'Energy Chews', type: 'chew', carbs: 22, caffeine: 0, water: false, note: 'Sachet 8 chews, +BCAA' },
  { id: 'powerbar-shots', brand: 'PowerBar', name: 'PowerGel Shots', type: 'chew', carbs: 48, caffeine: 0, water: false, note: 'Pochette ~6 (cola caféiné)' },
  { id: 'overstims-gums', brand: 'Overstim.s', name: 'Energy Gums Bio', type: 'chew', carbs: 23, caffeine: 0, water: false, note: 'Sachet 8 gommes, 50% fruit bio' },
  { id: 'veloforte-chews', brand: 'Veloforte', name: 'Energy Chews', type: 'chew', carbs: 42, caffeine: 0, water: false, note: 'Par sachet, +électrolytes' },
]

const BY_ID = new Map(NUTRITION_PRODUCTS.map((p) => [p.id, p]))

export function getNutritionProduct(id: string): NutritionProduct | undefined {
  return BY_ID.get(id)
}

/** Résout une liste d'ids (profiles.nutrition_products) en produits. */
export function resolveNutritionProducts(ids: readonly string[] | null | undefined): NutritionProduct[] {
  if (!ids) return []
  return ids.map((id) => BY_ID.get(id)).filter((p): p is NutritionProduct => !!p)
}

export const NUTRITION_TYPE_LABELS: Record<NutritionType, string> = {
  gel: 'Gels', drink: 'Boissons', bar: 'Barres', chew: 'Gommes',
}
