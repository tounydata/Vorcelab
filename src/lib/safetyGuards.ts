// Garde-fous de sécurité (Épopée E) — ÉVALUÉS AVANT toute logique de performance.
// Déterministe, sans signal appareil (HRV/readiness = dormants, cf. backlog).
// ⛔ N'établit JAMAIS de diagnostic médical : oriente vers un professionnel de santé
// dès qu'un drapeau rouge apparaît.

// ── E1 — Évaluation de la douleur (modèle de monitoring, Silbernagel) ─────────────

export type PainAction = 'ok' | 'caution' | 'reduce' | 'stop_refer'

export interface PainInput {
  /** Douleur ressentie pendant/après l'effort, échelle 0-10. */
  level: number
  /** Douleur/raideur pire le lendemain matin (signal clé de surcharge). */
  worseNextMorning?: boolean
  /** Douleur qui s'aggrave de semaine en semaine. */
  worseningWeekOverWeek?: boolean
  /** Drapeau rouge : douleur focale osseuse, au repos/la nuit, boiterie, gonflement. */
  redFlag?: boolean
}

export interface PainAssessment {
  action: PainAction
  message: string
  refer: boolean
}

/**
 * Décide de la conduite à tenir face à une douleur. Seuils Silbernagel :
 * 0-2 sûr · 3-5 acceptable si stable · >5 ou aggravation → réduire/arrêter.
 */
export function assessPain(p: PainInput): PainAssessment {
  if (p.redFlag) {
    return {
      action: 'stop_refer',
      refer: true,
      message: 'Drapeau rouge : arrête de courir et consulte un professionnel de santé.',
    }
  }
  if (p.level >= 8 || p.worseningWeekOverWeek) {
    return {
      action: 'stop_refer',
      refer: true,
      message: 'Douleur élevée ou qui s’aggrave : arrête et fais évaluer par un pro.',
    }
  }
  if (p.level > 5 || p.worseNextMorning) {
    return {
      action: 'reduce',
      refer: false,
      message: 'Réduis volume/intensité (ou repos) et surveille la réponse à 24 h.',
    }
  }
  if (p.level >= 3) {
    return {
      action: 'caution',
      refer: false,
      message: 'Douleur acceptable si elle reste stable et normale le lendemain matin.',
    }
  }
  return { action: 'ok', refer: false, message: 'Pas de signal douleur préoccupant.' }
}

// ── E2 — Détection de surcharge multi-signaux (signaux ACTIFS uniquement) ──────────

export interface OverloadSignals {
  /** Ratio charge aiguë/chronique (trainingLoad). Surcharge si > 1.5. */
  acwr?: number | null
  /** Tendance du RPE à charge constante (auto-déclaré). */
  sRpeTrend?: 'rising' | 'stable' | 'falling' | null
  /** Bien-être auto-déclaré (sommeil/humeur/plaisir). */
  wellness?: 'red' | 'amber' | 'green' | null
  // 🌙 HRV / readiness / Body Battery : dormants, volontairement absents.
}

export type OverloadLevel = 'none' | 'watch' | 'overload'

export interface OverloadResult {
  level: OverloadLevel
  flagged: string[]
  /** Vrai quand une décharge (C3) devrait être proposée. */
  suggestDeload: boolean
}

const ACWR_DANGER = 1.5

/**
 * Détecte une surcharge en croisant ≥ 2 signaux ACTIFS concordants — jamais un seul.
 * (HRV/readiness exclus tant qu'aucune API appareil n'existe.)
 */
export function detectOverload(s: OverloadSignals): OverloadResult {
  const flagged: string[] = []
  if (typeof s.acwr === 'number' && s.acwr > ACWR_DANGER) flagged.push('charge (ACWR)')
  if (s.sRpeTrend === 'rising') flagged.push('effort perçu en hausse')
  if (s.wellness === 'red') flagged.push('bien-être dégradé')

  const level: OverloadLevel =
    flagged.length >= 2 ? 'overload' : flagged.length === 1 ? 'watch' : 'none'
  return { level, flagged, suggestDeload: level === 'overload' }
}

// ── E4 — Garde-fous heuristiques exposés (repères, pas des lois) ──────────────────

export const HEURISTIC_CAVEATS: Record<string, string> = {
  acwr: 'L’ACWR et sa « zone idéale » 0,8-1,3 sont un repère contesté, pas une loi : à croiser avec ton ressenti.',
  tenPercent: 'La règle des +10 %/semaine est une heuristique prudente, sans preuve scientifique forte.',
  cadence: 'La cadence « idéale » ~180 est une moyenne : la bonne cadence est individuelle.',
}
