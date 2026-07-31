// Détection AUTOMATIQUE des compétitions (logique PURE, testable, sans IO).
//
// Pourquoi : jusqu'ici, une activité ne comptait comme course que si l'athlète avait
// coché « course » sur Strava (`is_race` / `workout_type = 1`). Or presque personne ne
// le fait — un athlète arrivé avec quatre ans d'historique et 427 sorties avait ZÉRO
// course étiquetée, alors que son historique contenait un marathon et deux semis.
// Résultat : le moteur n'avait aucun ancrage et retombait sur des allures génériques.
// Demander à l'utilisateur d'étiqueter, c'est lui demander de faire le travail de
// l'algorithme. On détecte.
//
// PRÉCISION AVANT RAPPEL. Une fausse course entre dans l'ancrage et y reste : elle
// déplace durablement toutes les projections. Une course manquée ne fait que priver le
// moteur d'un point. Les seuils sont donc calés pour ne quasiment jamais se tromper,
// quitte à n'attraper qu'une partie des courses.
//
// ── Calibration (mesurée, pas devinée) ───────────────────────────────────────────
// Sur les compétitions déjà étiquetées de la base, confrontées à tout le reste :
//
//   signal                    courses étiquetées     autres sorties
//   temps d'arrêt (médiane)         0,2 %          0,5 – 0,9 % (p90 : 5 – 7 %)
//   FC (centile personnel)          haut            réparti
//   titre auto Strava               2 / 18          291 occurrences
//
// Le %FCmax ABSOLU a été écarté : `fc_max` est saisi à la main et se révèle faux chez
// certains athlètes (des footings à 88 % de FCmax). On utilise donc le rang de la FC
// dans la PROPRE distribution de l'athlète — insensible à une FCmax mal renseignée.

/** Part maximale de temps d'arrêt (%) — une course COURTE ne s'arrête pas. */
export const MAX_STOP_RATIO_PCT = 3
/** Centile minimal de FC dans la distribution personnelle, sur une course COURTE. */
export const MIN_HR_PERCENTILE = 0.85
/** Distance minimale considérée (m). */
export const MIN_DISTANCE_M = 3000

// ── Pourquoi deux seuils dépendent désormais de la DURÉE ─────────────────────────
// Les deux constantes ci-dessus ont été calibrées sur des marathons et des semis. Sur
// la base `runnerdata` (2026-07-31), elles rejetaient 28 des 31 sorties de 30 km et
// plus — dont un 78,5 km / 3 914 m D+ — et les 2 seules confirmées étaient deux
// marathons ROUTE. Autrement dit : le détecteur était aveugle au format ULTRA,
// c'est-à-dire précisément au marché visé.
//
// La cause n'est pas un mauvais réglage, c'est un changement de régime :
//
//  • ARRÊTS. « Une course ne s'arrête pas » est vrai sur un semi (médiane 0,2 %). Sur
//    un ultra, les ravitaillements FONT PARTIE de la course : temps d'arrêt moyen
//    mesuré à 17,9 % au-delà de 42 km, contre 4,0 % en dessous.
//  • INTENSITÉ. Un ultra se court en ENDURANCE : sa FC moyenne est structurellement
//    plus basse que celle d'un 10 km. Exiger le top 15 % personnel revient à exiger
//    qu'un 12 h soit couru à l'intensité d'un cross — ce qui n'arrive jamais.
//
// Les deux seuils s'assouplissent donc avec la durée, et UNIQUEMENT avec elle. Les
// courses courtes gardent EXACTEMENT le comportement d'avant (aucune régression
// possible sous 2 h). Le garde-fou de précision reste le cumul : nom d'événement
// reconnaissable, aucun motif de séance, arrêts et intensité cohérents avec le format.
//
// ⚠ Les pentes ci-dessous sont des interpolations PRUDENTES, pas des valeurs mesurées
// course par course : l'échantillon d'ultras confirmés est encore vide, donc il n'y a
// rien à ajuster dessus. Elles sont volontairement plus strictes que les moyennes
// observées (15 % d'arrêts tolérés contre 17,9 % mesurés). À revalider au banc dès que
// des ultras y entrent.

/** Durée (h) en dessous de laquelle les seuils « course courte » s'appliquent tels quels. */
const SHORT_RACE_HOURS = 2
/** Durée (h) à partir de laquelle l'assouplissement est maximal. */
const LONG_RACE_HOURS = 8
/** Part d'arrêt tolérée sur un format long (%) — ravitaillements inclus. */
const MAX_STOP_RATIO_PCT_LONG = 15
/** Centile de FC minimal exigé sur un format long.
 *
 *  ── Pourquoi ZÉRO, et pourquoi ce n'est pas « baisser un seuil jusqu'à ce que ça passe »
 *  Un ultra se court en ENDURANCE — en Z2. Ce n'est pas une tendance, c'est la nature du
 *  format : au-delà de plusieurs heures, personne ne tient une intensité élevée. Et plus
 *  l'athlète gère bien sa course, plus sa FC moyenne est BASSE. Le critère d'intensité
 *  punissait donc exactement la course la mieux courue.
 *
 *  Sur un format long, la FC ne porte donc AUCUNE information sur le fait qu'il s'agisse
 *  d'une compétition. Le critère n'est pas mal calibré : il est INAPPLICABLE. Le laisser
 *  actif avec un seuil abaissé serait garder un test qui ne teste rien, tout en continuant
 *  d'exclure des courses réelles.
 *
 *  Cas mesuré : `Trail du Grand Ballon`, 78,5 km, 3 914 m D+, 12h32, FC moyenne 135,8 —
 *  sous la médiane de son auteur, donc rejeté quel que soit le seuil au-dessus de zéro.
 *
 *  ── Ce qui assure la PRÉCISION à la place ────────────────────────────────────────
 *  Les autres portes restent toutes actives et sont cumulatives : sport de course à pied,
 *  distance suffisante, titre personnalisé, NOM D'ÉVÉNEMENT reconnaissable, aucun motif
 *  de séance (« sortie », « rando », « footing »…), temps d'arrêt cohérent avec le format.
 *  Une sortie longue en montagne s'appelle « Sortie trail » et reste exclue ; une
 *  compétition s'appelle « Trail du Grand Ballon » et passe.
 *
 *  ── Une piste explorée puis ABANDONNÉE ───────────────────────────────────────────
 *  Comparer la FC aux efforts de DURÉE COMPARABLE plutôt qu'à toute la distribution
 *  semblait plus élégant. Vérifié sur les vraies données : l'auteur du 78,5 km a
 *  5 sorties de plus de 3 h sur 217 — une seule dépasse 6 h. Ni une bande de durée, ni un
 *  voisinage par rang ne disposent d'assez de points comparables. L'information n'existe
 *  pas dans les données ; aucune sophistication ne peut la fabriquer.
 */
const MIN_HR_PERCENTILE_LONG = 0

/** Progression 0..1 de « course courte » vers « format long », selon la durée. */
function longFormatRatio(movingTimeS: number): number {
  const h = movingTimeS / 3600
  if (!Number.isFinite(h) || h <= SHORT_RACE_HOURS) return 0
  return Math.min(1, (h - SHORT_RACE_HOURS) / (LONG_RACE_HOURS - SHORT_RACE_HOURS))
}

/** Part d'arrêt tolérée (%) pour une course de cette durée. 3 % sous 2 h → 15 % à 8 h. */
export function maxStopRatioPctFor(movingTimeS: number): number {
  const t = longFormatRatio(movingTimeS)
  return MAX_STOP_RATIO_PCT + t * (MAX_STOP_RATIO_PCT_LONG - MAX_STOP_RATIO_PCT)
}

/** Centile de FC exigé pour une course de cette durée. 0,85 sous 2 h → 0,50 à 8 h. */
export function minHrPercentileFor(movingTimeS: number): number {
  const t = longFormatRatio(movingTimeS)
  return MIN_HR_PERCENTILE + t * (MIN_HR_PERCENTILE_LONG - MIN_HR_PERCENTILE)
}

/**
 * Titres AUTOMATIQUES de Strava. Un athlète qui court un dossard renomme son activité ;
 * un titre par défaut est donc un signal négatif fort (2 sur 18 seulement chez les
 * courses étiquetées, contre 291 occurrences ailleurs).
 */
const AUTO_TITLE = [
  /^(morning|afternoon|evening|lunch|night)\s+(run|trail\s*run|walk|hike)\s*$/,
  /^course\s+[àa]\s+pied\s*(le\s+matin|le\s+midi|le\s+soir|matinale|nocturne|dans\s+l.apr[èe]s-midi|l.apr[èe]s-midi)?\s*$/,
  /^trail\s*(run)?\s*(le\s+matin|le\s+midi|le\s+soir|en\s+soir[ée]e|nocturne|dans\s+l.apr[èe]s-midi)?\s*$/,
  /^sortie\s+(à\s+pied|course|longue)?\s*(le\s+matin|le\s+midi|le\s+soir|dans\s+l.apr[èe]s-midi)?\s*$/,
]

/** Motifs de SÉANCE : structure d'entraînement dans le nom → ce n'est pas une course. */
const SESSION_PATTERNS = [
  /[0-9]+\s*[x*]\s*[0-9]/, // 10x400, 4x2km
  /allure/, /fractionn/, /tempo/, /\bvma\b/, /seuil/, /\bef\b/,
  /footing/, /chauffement/, /crassage/, /r[ée]cup/,
  /rando/, /sortie\s+longue/, /jardinage/, /\breco\b/,
  /\btest\b/, /entra[îi]n/,
  // « Sortie trail », « Sorti trail avec Max », « Sortie grand ballon » : on ne baptise
  // pas une compétition « sortie ». Signal négatif indispensable depuis que le
  // vocabulaire trail ci-dessous est reconnu — sans lui, toute sortie longue en
  // montagne deviendrait une course. Vérifié : AUCUNE des 50 compétitions confirmées
  // de la base ne contient ce mot.
  /\bsorti(e|es)?\b/,
]

/** Motifs de COURSE : nom d'événement ou classement annoncé.
 *
 *  ⚠ Cette liste était PUREMENT ROUTIÈRE (marathon, semi, corrida, foulée, ekiden,
 *  cross). Aucun terme de trail. Conséquence mesurée sur la base : « Trail du Grand
 *  Ballon » (78,5 km, 3 914 m D+), « Belfortrail », « Trail du petit ballon »,
 *  « Munster trail 82 » étaient tous rejetés en `no_race_name_signal` — la porte qui
 *  fermait le plus d'ultras, loin devant les seuils d'arrêt et d'intensité.
 *
 *  Les motifs trail ajoutés ci-dessous décrivent des NOMS D'ÉVÉNEMENT (« Trail du… »,
 *  « …trail » accolé, « trail » suivi du format), jamais le mot « trail » seul — sans
 *  quoi la moindre sortie en sentier deviendrait une compétition.
 */
const RACE_PATTERNS = [
  /marathon/, /semi/, /corrida/, /foul[ée]e/, /ekiden/,
  /challenge/, /championnat/, /\bcross\b/, /course\s+de\s+/,
  /[0-9]{1,3}\s*\/\s*[0-9]{2,4}/,          // « 42/389 »
  /[0-9]{1,3}\s*(e|er|[èe]me)\s+(au\s+g[ée]n[ée]ral|scratch)/, // « 29e au général »
  // ── Vocabulaire TRAIL ──────────────────────────────────────────────────────────
  /\btrail\s+(du|de|des|d[’']|le|la)\b/,   // « Trail du Grand Ballon », « Trail des collines »
  /\b\w{2,}trail\b/,                        // « Belfortrail », « Tetrail », « ultratrail »
  /\btrail\s+\d{2,3}\b/,                    // « Munster trail 82 »
  /\btrail\b.*\b\d{2,3}\s*km\b/,            // « Trail grand ballon 32km », « Thur trail 18km »
  /\bultra[\s-]?trail\b/, /\bskyrace\b/,
  /kilom[èe]tre\s+vertical/, /\bkv\b/,
  /temps\s+officiel/,                       // « Temps officiel 6h59,41 » — signal fort
]

const RUN_SPORTS = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])

export interface RaceDetectionInput {
  name?: string | null
  sportType?: string | null
  type?: string | null
  distanceM?: number | null
  movingTimeS?: number | null
  elapsedTimeS?: number | null
  /**
   * Rang de la FC moyenne dans la distribution PERSONNELLE de l'athlète (0..1).
   * Absent → le critère d'intensité ne peut pas être vérifié, donc pas de détection
   * (on ne détecte jamais sur le seul nom : « Marathon » peut être un footing).
   */
  hrPercentile?: number | null
}

export interface RaceDetectionResult {
  /** Vrai si l'activité peut être traitée comme une compétition sans étiquetage. */
  detected: boolean
  /** Codes machine expliquant la décision (sûrs à journaliser, sans données perso). */
  reasons: string[]
}

function norm(s?: string | null): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Vrai si le titre est celui généré par défaut par Strava (jamais renommé). */
export function hasAutoGeneratedTitle(name?: string | null): boolean {
  const n = norm(name)
  if (!n) return true
  return AUTO_TITLE.some((re) => re.test(n))
}

/**
 * Détecte une compétition sans s'appuyer sur l'étiquetage Strava.
 *
 * Exige TOUS les critères : sport de course, distance suffisante, titre personnalisé,
 * nom d'événement reconnaissable, aucun motif de séance, temps d'arrêt faible, et
 * intensité dans le haut de la distribution personnelle. Le cumul est volontairement
 * strict — cf. en-tête, précision avant rappel.
 */
export function detectRace(input: RaceDetectionInput): RaceDetectionResult {
  const reasons: string[] = []
  const sport = norm(input.sportType) || norm(input.type)
  if (!RUN_SPORTS.has(sport)) return { detected: false, reasons: ['sport_not_run'] }

  const dist = input.distanceM
  if (typeof dist !== 'number' || !(dist >= MIN_DISTANCE_M)) {
    return { detected: false, reasons: ['distance_too_short'] }
  }

  const moving = input.movingTimeS
  if (typeof moving !== 'number' || moving <= 0) return { detected: false, reasons: ['no_real_time'] }

  const name = norm(input.name)
  if (hasAutoGeneratedTitle(input.name)) return { detected: false, reasons: ['auto_generated_title'] }
  if (SESSION_PATTERNS.some((re) => re.test(name))) return { detected: false, reasons: ['looks_like_workout'] }
  if (!RACE_PATTERNS.some((re) => re.test(name))) return { detected: false, reasons: ['no_race_name_signal'] }
  reasons.push('race_name_signal')

  // Temps d'arrêt : une course COURTE ne s'arrête pas (médiane mesurée 0,2 %). Sur un
  // format long, les ravitaillements en font partie → tolérance croissante (cf. en-tête).
  const longFormat = longFormatRatio(moving) > 0
  if (longFormat) reasons.push('long_format')
  const elapsed = input.elapsedTimeS
  if (typeof elapsed === 'number' && elapsed > 0) {
    const stopPct = ((elapsed - moving) / moving) * 100
    if (stopPct > maxStopRatioPctFor(moving)) {
      return { detected: false, reasons: [...reasons, 'too_many_stops'] }
    }
    reasons.push('low_stop_ratio')
  }

  // Intensité RELATIVE à l'athlète (immunisée contre une FCmax mal saisie). Le seuil
  // s'abaisse avec la durée : un ultra se court en endurance, pas au seuil.
  const pct = input.hrPercentile
  if (typeof pct !== 'number' || !Number.isFinite(pct)) {
    return { detected: false, reasons: [...reasons, 'no_intensity_signal'] }
  }
  if (pct < minHrPercentileFor(moving)) {
    return { detected: false, reasons: [...reasons, 'intensity_too_low'] }
  }
  reasons.push('personal_intensity_high')

  return { detected: true, reasons }
}

export interface HrSample {
  averageHeartrate?: number | null
}

/**
 * Rang (0..1) de chaque FC moyenne dans la distribution de l'athlète. Renvoie une
 * fonction de consultation — le classement n'est calculé qu'une fois.
 *
 * Le rang est celui de la FC parmi les activités de course à pied EXPLOITABLES de
 * l'athlète : c'est ce qui rend le critère d'intensité indépendant d'une `fc_max`
 * saisie à la main, souvent fausse.
 */
export function buildHrPercentileLookup(samples: HrSample[]): (hr?: number | null) => number | null {
  const values = samples
    .map((s) => s.averageHeartrate)
    .filter((h): h is number => typeof h === 'number' && Number.isFinite(h) && h > 0)
    .sort((a, b) => a - b)
  if (values.length < 10) return () => null // trop peu d'historique pour un rang fiable
  return (hr) => {
    if (typeof hr !== 'number' || !Number.isFinite(hr) || hr <= 0) return null
    // Part des valeurs STRICTEMENT inférieures → rang dans [0,1).
    let lo = 0
    let hi = values.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (values[mid] < hr) lo = mid + 1
      else hi = mid
    }
    return values.length > 1 ? lo / (values.length - 1) : 0
  }
}
