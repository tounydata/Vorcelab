// Couche comportementale & pédagogique (Épopée D) — contenu DÉTERMINISTE (aucune IA).
// Motivation, glossaire pédagogique, débrief formatif, adhérence. Pures fonctions.
// Aucune dépendance aux signaux appareil (dormants) : seuls le profil et le ressenti
// auto-déclaré alimentent ce module.

// ── D1 — Registre motivationnel (autodétermination, Deci & Ryan) ───────────────────

export type MotivationWhy = 'sante' | 'perf' | 'social' | 'bienetre'

/** Registre de langage adapté au « pourquoi » de l'athlète. */
export function motivationRegister(why: MotivationWhy): string {
  switch (why) {
    case 'sante':
      return 'On avance pour ta santé et ta régularité, sans pression de chrono.'
    case 'perf':
      return 'Cap sur la performance : chaque séance a un objectif mesurable.'
    case 'social':
      return 'Tu progresses avec la communauté : partage et défis collectifs.'
    case 'bienetre':
      return 'La course comme plaisir et équilibre : on respecte tes sensations.'
  }
}

export interface Intentions {
  /** Jours d'entraînement choisis (0=dim … 6=sam). */
  days: number[]
  time?: string
  place?: string
}

/** Implementation intention (Gollwitzer) : « Si [quand/où], alors je cours ». */
export function formatIntention(it: Intentions): string {
  const place = it.place ? ` à ${it.place}` : ''
  const time = it.time ? ` à ${it.time}` : ''
  return `Les jours prévus${time}${place}, je mets mes chaussures et je sors.`
}

// ── D2 — Glossaire contextuel (3 niveaux de lecture) ───────────────────────────────

export interface Term {
  key: string
  label: string
  ressenti: string // niveau 1 : sensation
  analogie: string // niveau 2 : analogie
  science: string // niveau 3 : base scientifique
}

export const GLOSSARY: Record<string, Term> = {
  seuil: {
    key: 'seuil',
    label: 'Seuil',
    ressenti: 'L’allure que tu peux tenir environ 1 h : dure mais maîtrisée.',
    analogie: 'La ligne rouge du moteur, juste avant que ça « brûle ».',
    science: 'Allure au seuil 2 (~MLSS), proche de 88 % de VO2max (T-pace Daniels).',
  },
  endurance: {
    key: 'endurance',
    label: 'Endurance fondamentale',
    ressenti: 'Tu peux tenir une conversation en courant.',
    analogie: 'Les fondations de la maison : invisibles mais essentielles.',
    science: 'Zone 1-2 sous le premier seuil, base aérobie (~70 % de VO2max).',
  },
  vo2max: {
    key: 'vo2max',
    label: 'VO2max',
    ressenti: 'Ton plafond d’effort, là où tu ne peux plus parler.',
    analogie: 'La cylindrée de ton moteur.',
    science: 'Débit maximal d’oxygène utilisable (ml/kg/min).',
  },
}

export type ReadingLevel = 'ressenti' | 'analogie' | 'science'

/** Renvoie l'explication d'un terme au niveau de lecture demandé. */
export function explainTerm(key: string, level: ReadingLevel): string | null {
  const t = GLOSSARY[key]
  return t ? t[level] : null
}

// ── D4 — Débrief formatif en 3 temps (Hattie : objectif → constat → 1 conseil) ─────

export interface DebriefInput {
  intent: string // objectif de la séance (où vais-je ?)
  factual: string // constat descriptif (où en suis-je ?)
  oneTip: string // une seule prochaine étape
}

export interface Debrief {
  objectif: string
  constat: string
  conseil: string
}

/** Construit un débrief à UN SEUL focus d'amélioration (anti-surcharge cognitive). */
export function buildDebrief(input: DebriefInput): Debrief {
  return {
    objectif: input.intent,
    constat: input.factual,
    conseil: input.oneTip,
  }
}

// ── D5 — Adhérence : streak tolérante + « never miss twice » ───────────────────────

export interface AdherenceInput {
  /** Séances faites cette semaine. */
  doneThisWeek: number
  /** Séances prévues cette semaine. */
  plannedThisWeek: number
  /** Séances consécutives manquées. */
  consecutiveMissed: number
}

export type AdherenceState = 'on_track' | 'gentle_nudge' | 'recover'

export interface AdherenceFeedback {
  state: AdherenceState
  message: string
}

/**
 * Adhérence bienveillante : le repos ne « casse » pas la régularité hebdo ;
 * après une séance manquée on propose une reprise allégée (never miss twice).
 */
export function adherenceFeedback(a: AdherenceInput): AdherenceFeedback {
  if (a.consecutiveMissed >= 2) {
    return {
      state: 'recover',
      message: 'Pas de culpabilité : reprenons avec une séance courte et facile aujourd’hui.',
    }
  }
  if (a.consecutiveMissed === 1) {
    return {
      state: 'gentle_nudge',
      message: 'Une séance sautée, ça arrive — l’important est de ne pas en manquer deux d’affilée.',
    }
  }
  return { state: 'on_track', message: 'Belle régularité cette semaine, continue comme ça !' }
}
