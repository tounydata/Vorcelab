// Indice de stress thermique (température RESSENTIE) — combine température de l'air,
// humidité et vent en une seule valeur °C, plus fidèle au coût physiologique de la
// chaleur que l'air seul. Sert au débrief, à l'impact météo de la projection et (par
// cascade) à la prédiction. 100 % pur, testable, sans réseau.
//
// Formule : « Apparent Temperature » de Steadman (BOM australien) — standard du
// « ressenti » : AT = Ta + 0.33·e − 0.70·ws − 4.00, où e = pression de vapeur (hPa)
// dérivée de l'humidité relative, ws = vent (m/s). L'humidité fait MONTER le ressenti
// (transpiration moins efficace), le vent le fait BAISSER (refroidissement).

/** Pression de vapeur d'eau (hPa) depuis température (°C) et humidité relative (%). */
export function vapourPressureHPa(tempC: number, humidityPct: number): number {
  const rh = Math.max(0, Math.min(100, humidityPct))
  return (rh / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC))
}

/**
 * Température ressentie (°C, Steadman/BOM). Humidité inconnue → 50 % (neutre) ;
 * vent inconnu → 0. Bornée pour rester physiologiquement plausible.
 */
export function apparentTempC(
  tempC: number, humidityPct?: number | null, windKmh?: number | null,
): number {
  if (!Number.isFinite(tempC)) return tempC
  const rh = humidityPct != null && Number.isFinite(humidityPct) ? humidityPct : 50
  const ws = windKmh != null && Number.isFinite(windKmh) ? Math.max(0, windKmh) / 3.6 : 0
  const e = vapourPressureHPa(tempC, rh)
  const at = tempC + 0.33 * e - 0.70 * ws - 4.0
  // Garde-fou : l'apparent ne s'écarte pas de plus de 15 °C de l'air (anti-aberration).
  return Math.max(tempC - 15, Math.min(tempC + 15, at))
}

/** Seuil de confort au-dessus duquel la chaleur ressentie commence à coûter (°C). */
export const HEAT_COMFORT_C = 22

/**
 * Pénalité de temps « chaleur » (%) à partir du ressenti — générique (littérature,
 * ~Ely 2007 : dégradation de l'allure d'endurance avec la chaleur), bornée à +12 %.
 */
export function heatPenaltyPct(apparentC: number): number {
  if (!Number.isFinite(apparentC) || apparentC <= HEAT_COMFORT_C) return 0
  return Math.max(0, Math.min(12, (apparentC - HEAT_COMFORT_C) * 1.0))
}
