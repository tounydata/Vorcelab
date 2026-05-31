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

// ── E1bis — Cadence des check-ins douleur (ANTI-ANXIÉTÉ) ───────────────────────────
// Demander « as-tu mal ? » à chaque séance est anxiogène et nocebo : on ne déclenche
// le questionnaire détaillé que dans les fenêtres à vrai risque. Par défaut, rien
// (ou un simple ressenti en un tap). La douleur reste opt-in pour l'athlète.

export type PainPromptLevel = 'none' | 'one_tap' | 'detailed'

export interface PainCheckContext {
  /** L'athlète a signalé lui-même une gêne (opt-in). */
  userReportedNiggle?: boolean
  /** Protocole de reprise après blessure (return-to-run). */
  returnToRun?: boolean
  /** Surcharge détectée par detectOverload. */
  recentOverload?: boolean
  /** Antécédent de blessure connu. */
  priorInjuryHistory?: boolean
  /** La séance qui vient d'être faite était intense/longue. */
  wasHardSession?: boolean
  /** Jours depuis le dernier check léger (pour la cadence hebdo). */
  daysSinceLastCheck?: number
}

export interface PainPrompt {
  level: PainPromptLevel
  reason: string
}

/**
 * Décide s'il faut interroger l'athlète sur la douleur, et à quel niveau.
 * Détaillé uniquement en fenêtre à risque ; sinon un check léger hebdomadaire ;
 * par défaut rien. Évite l'anxiété et la fatigue de notification.
 */
export function painCheckCadence(ctx: PainCheckContext): PainPrompt {
  if (ctx.userReportedNiggle) return { level: 'detailed', reason: 'gêne signalée par l’athlète' }
  if (ctx.returnToRun) return { level: 'detailed', reason: 'reprise après blessure' }
  if (ctx.recentOverload) return { level: 'detailed', reason: 'surcharge détectée' }
  if (ctx.priorInjuryHistory && ctx.wasHardSession) {
    return { level: 'detailed', reason: 'séance dure + antécédent de blessure' }
  }
  if ((ctx.daysSinceLastCheck ?? 0) >= 7) {
    return { level: 'one_tap', reason: 'check bien-être hebdomadaire léger' }
  }
  return { level: 'none', reason: 'pas de fenêtre à risque — ne pas solliciter' }
}

// ── E4 — Garde-fous heuristiques exposés (repères, pas des lois) ──────────────────

export const HEURISTIC_CAVEATS: Record<string, string> = {
  acwr: 'L’ACWR et sa « zone idéale » 0,8-1,3 sont un repère contesté, pas une loi : à croiser avec ton ressenti.',
  tenPercent: 'La règle des +10 %/semaine est une heuristique prudente, sans preuve scientifique forte.',
  cadence: 'La cadence « idéale » ~180 est une moyenne : la bonne cadence est individuelle.',
}
