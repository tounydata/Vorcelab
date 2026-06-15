// Zones de fréquence cardiaque — modèle au choix + bornes ajustables. PUR, testable.
// Trois modèles : %FCmax (simple), %FC de réserve (Karvonen, requiert FC repos),
// %LTHR (seuil, Friel). L'user ajuste 4 bornes en % ; on calcule les bpm.
// Réf : Karvonen 1957 (FC réserve) ; Friel (zones LTHR).

export type HrZoneModel = 'fcmax' | 'hrr' | 'lthr'

export interface HrZoneConfig {
  model: HrZoneModel
  /** 4 bornes (fractions ascendantes) séparant Z1|Z2 … Z4|Z5. */
  bounds: number[]
  /** FC de repos (bpm) — requise pour le modèle Karvonen. */
  restingHr?: number | null
  /** FC au seuil (bpm) — requise pour le modèle LTHR. */
  lthr?: number | null
}

export interface HrZoneInputs {
  fcMax?: number | null
  restingHr?: number | null
  lthr?: number | null
}

export interface HrZone {
  label: string
  color: string
  /** Bornes en fraction du référentiel du modèle. */
  fromPct: number
  toPct: number
  /** Bornes en bpm (null si donnée manquante, ou bord ouvert). */
  fromBpm: number | null
  toBpm: number | null
}

export const ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const
export const ZONE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'] as const

export const MODEL_LABEL: Record<HrZoneModel, string> = {
  fcmax: '% FCmax',
  hrr: '% FC de réserve (Karvonen)',
  lthr: '% seuil (LTHR)',
}

/** Bornes par défaut selon le modèle (repères grand public). */
export const DEFAULT_BOUNDS: Record<HrZoneModel, number[]> = {
  fcmax: [0.60, 0.70, 0.80, 0.90],
  hrr: [0.60, 0.70, 0.80, 0.90],   // Karvonen
  lthr: [0.85, 0.90, 0.95, 1.00],  // Friel (approx.)
}

export function defaultZoneConfig(model: HrZoneModel = 'fcmax'): HrZoneConfig {
  return { model, bounds: [...DEFAULT_BOUNDS[model]] }
}

/** Plafond haut de Z5 (le LTHR dépasse 100 %). */
function topCap(model: HrZoneModel): number {
  return model === 'lthr' ? 1.06 : 1
}

/** Nettoie 4 bornes : numériques, croissantes strictes, bornées [0.3, 1.1]. Sinon défaut. */
export function sanitizeBounds(bounds: number[], model: HrZoneModel): number[] {
  const def = DEFAULT_BOUNDS[model]
  if (!Array.isArray(bounds) || bounds.length !== 4) return [...def]
  const b = bounds.map((x) => (typeof x === 'number' && isFinite(x) ? Math.min(1.1, Math.max(0.3, x)) : NaN))
  for (let i = 0; i < 4; i++) {
    if (Number.isNaN(b[i])) return [...def]
    if (i > 0 && b[i] <= b[i - 1]) return [...def] // doit être strictement croissant
  }
  return b
}

/** Convertit une fraction (du référentiel du modèle) en bpm. null si donnée manquante. */
export function pctToBpm(pct: number, cfg: HrZoneConfig, inputs: HrZoneInputs): number | null {
  if (cfg.model === 'fcmax') {
    return inputs.fcMax ? Math.round(pct * inputs.fcMax) : null
  }
  if (cfg.model === 'hrr') {
    const rest = cfg.restingHr ?? inputs.restingHr
    return inputs.fcMax && rest ? Math.round(rest + pct * (inputs.fcMax - rest)) : null
  }
  // lthr
  const lt = cfg.lthr ?? inputs.lthr
  return lt ? Math.round(pct * lt) : null
}

/** Calcule les 5 zones FC (bornes + bpm) depuis la config et les données dispo. */
export function computeHrZones(cfg: HrZoneConfig, inputs: HrZoneInputs): HrZone[] {
  const b = sanitizeBounds(cfg.bounds, cfg.model)
  const edges = [0, b[0], b[1], b[2], b[3], topCap(cfg.model)]
  return ZONE_LABELS.map((label, i) => {
    const fromPct = edges[i], toPct = edges[i + 1]
    return {
      label,
      color: ZONE_COLORS[i],
      fromPct,
      toPct,
      fromBpm: i === 0 ? null : pctToBpm(fromPct, cfg, inputs),   // Z1 = bord ouvert bas
      toBpm: i === ZONE_LABELS.length - 1 ? null : pctToBpm(toPct, cfg, inputs), // Z5 = bord ouvert haut
    }
  })
}

/** Données manquantes pour que le modèle produise des bpm ? (sinon zones en % seulement). */
export function missingInputFor(cfg: HrZoneConfig, inputs: HrZoneInputs): 'fcMax' | 'restingHr' | 'lthr' | null {
  if (cfg.model === 'fcmax') return inputs.fcMax ? null : 'fcMax'
  if (cfg.model === 'hrr') {
    if (!inputs.fcMax) return 'fcMax'
    return (cfg.restingHr ?? inputs.restingHr) ? null : 'restingHr'
  }
  return (cfg.lthr ?? inputs.lthr) ? null : 'lthr'
}
