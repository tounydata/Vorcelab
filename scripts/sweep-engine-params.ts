// BALAYAGE de constantes moteur, jugé HORS ÉCHANTILLON.
//
// Pourquoi ce script existe : chaque essai de réglage passait jusqu'ici par un
// aller-retour de CI (~3 min) alors que le calcul lui-même dure ~40 s. Les données sont
// chargées UNE fois, puis le banc est rejoué pour chaque combinaison — on obtient des
// dizaines de réglages comparés en un seul run.
//
// ⚠️ CE SCRIPT NE DOIT PAS SERVIR À CHOISIR LE MEILLEUR RÉGLAGE EN ÉCHANTILLON.
//
// CORRECTION DE MÉTHODE (2026-08-02). Ce qui suit était ANNONCÉ mais pas fait : le
// script classait les réglages sur la macro-moyenne des MAPE de TOUS les athlètes,
// puis élisait le meilleur — c'est-à-dire qu'il faisait juger le réglage par les
// athlètes qui l'avaient choisi. La macro corrige le poids d'un athlète prolifique,
// elle ne corrige pas d'avoir vu ses données avant de décider. Le verdict passe
// désormais par `selectTuningLeaveOneAthleteOut` : pour chaque athlète, le réglage
// est élu sur les AUTRES, puis mesuré sur lui. Les colonnes en échantillon restent
// affichées, mais comme description — plus comme décision.
//
// Avec 58 courses et 7 athlètes, minimiser la MAPE sur l'échantillon complet revient à
// apprendre les particularités de CES athlètes : on trouverait un réglage parfait ici et
// dégradé sur le 8ᵉ arrivant. C'est le mode d'échec classique, et il est silencieux.
//
// La règle appliquée : chaque combinaison est évaluée en LEAVE-ONE-ATHLETE-OUT. Pour
// chaque athlète, on mesure l'erreur sur SES courses avec le réglage retenu, et on
// publie la MACRO-moyenne des MAPE par athlète. Un réglage qui gagne en échantillon mais
// pas en macro est du bruit — le script le signale explicitement.
//
// Rappel de méthode : la meilleure correction obtenue à ce jour (le cliquet d'ancrage,
// `2026.07-16`) n'est PAS venue d'un balayage. Elle venait d'un défaut de FORME, et elle
// a amélioré les sept ventilations d'un coup — ce qu'un coefficient tuné ne fait jamais.
// Ce script sert à VÉRIFIER une hypothèse, pas à en fabriquer une.
//
// LECTURE SEULE (mêmes SELECT que le banc). Usage :
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/sweep-engine-params.ts
//   npx tsx scripts/sweep-engine-params.ts --fixture <chemin>.backtest-fixture.json

import { loadFixture, loadFromSupabase, buildCasesAndValidation } from './run-real-engine-backtest'
import { runRealBacktest, type RaceCaseInput } from '../src/lib/realBacktest'
import { DEFAULT_ENGINE_TUNING, type EngineTuning } from '../src/lib/computeRaceProjection'
import { selectTuningLeaveOneAthleteOut, type TuningErrors } from '../src/lib/backtestLoao'

/** Grille explorée. Volontairement PETITE et centrée sur les valeurs de production :
 *  un balayage large sur 58 courses ne mesurerait que du bruit. */
const GRID: Record<keyof EngineTuning, number[]> = {
  // Encadre la production (0,06) DES DEUX CÔTÉS. Le premier balayage ne testait que des
  // valeurs supérieures ou égales : la tendance étant monotone (plus de fade = plus
  // d'erreur), il ne pouvait pas voir un optimum situé EN DESSOUS. Une grille à sens
  // unique ne mesure pas un optimum, elle mesure une pente.
  fadeBaseK: [0.02, 0.04, 0.06, 0.09],
  fadeExtraK: [0.0, 0.03, 0.06, 0.12],
  // `fadeCap` retiré de la grille : 1,40 et 1,80 donnent des résultats IDENTIQUES au
  // centième sur les 58 courses — le plafond n'est jamais atteint. Le balayer coûtait le
  // double de combinaisons pour zéro information.
  fadeCap: [1.4],
  anchorMax: [1.5],
  // HYPOTHÈSE PRINCIPALE de ce balayage. L'ablation a montré que l'ancrage est la seule
  // correction utile (+3,44 pt si retiré) et que `kilometre_effort` — un ancrage épuré —
  // bat encore le moteur. Si le cœur (somme des seaux) est plus faible que le recalage,
  // augmenter la confiance accordée à l'ancrage doit améliorer. Encadré des DEUX côtés.
  anchorTrustHigh: [0.7, 0.8, 0.9, 0.95, 1.0],
}

function combinations(): EngineTuning[] {
  const keys = Object.keys(GRID) as (keyof EngineTuning)[]
  let out: EngineTuning[] = [{}]
  for (const k of keys) {
    const next: EngineTuning[] = []
    for (const base of out) for (const v of GRID[k]) next.push({ ...base, [k]: v })
    out = next
  }
  return out
}

interface Scored {
  tuning: EngineTuning
  /** MAPE (%) sur toutes les courses — À NE PAS UTILISER SEULE pour choisir. */
  inSampleMape: number
  /** Macro-moyenne des MAPE par athlète — DESCRIPTIVE, toujours en échantillon. */
  macroMape: number
  /** Erreurs absolues par athlète — matière première du leave-one-athlete-out. */
  errorsByAthlete: Map<string, number[]>
  /** Biais moyen signé (s), toutes courses. */
  biasS: number
  n: number
  athletes: number
}

function score(cases: RaceCaseInput[], tuning: EngineTuning): Scored | null {
  const report = runRealBacktest(cases, { tuning })
  const rows = report.rows.filter((r) => r.error_vs_elapsed_pct != null && Number.isFinite(r.error_vs_elapsed_pct))
  if (rows.length === 0) return null

  const abs = (r: (typeof rows)[number]) => Math.abs(r.error_vs_elapsed_pct as number)
  const inSampleMape = rows.reduce((s, r) => s + abs(r), 0) / rows.length
  const biasS = rows.reduce((s, r) => s + (r.error_vs_elapsed_s ?? 0), 0) / rows.length

  // Macro par ATHLÈTE : chaque athlète pèse pareil, quel que soit son nombre de courses.
  // Sans ça, l'athlète le plus prolifique dicterait le réglage de tous les autres.
  const byAthlete = new Map<string, number[]>()
  for (const r of rows) {
    const list = byAthlete.get(r.athlete_id)
    if (list) list.push(abs(r))
    else byAthlete.set(r.athlete_id, [abs(r)])
  }
  let macro = 0
  for (const [, errs] of byAthlete) macro += errs.reduce((a, b) => a + b, 0) / errs.length
  macro /= byAthlete.size

  return { tuning, inSampleMape, macroMape: macro, errorsByAthlete: byAthlete, biasS, n: rows.length, athletes: byAthlete.size }
}

/** Affiche TOUTES les clés de `DEFAULT_ENGINE_TUNING`, sans liste codée en dur.
 *
 *  Un formateur énumérant les paramètres à la main devient faux dès qu'on en ajoute un —
 *  c'est arrivé au run du 2026-07-31 06:32 : `anchorTrustHigh` était bien balayé
 *  (80 combinaisons) mais n'apparaissait dans aucune ligne, rendant impossible de savoir
 *  quelle valeur avait gagné. Le verdict restait juste, l'information était perdue. */
function fmtTuning(t: EngineTuning): string {
  const merged = { ...DEFAULT_ENGINE_TUNING, ...t }
  return (Object.keys(DEFAULT_ENGINE_TUNING) as (keyof EngineTuning)[])
    .map((k) => `${k}=${(merged[k] as number).toFixed(2)}`)
    .join(' ')
}

function isDefault(t: EngineTuning): boolean {
  const m = { ...DEFAULT_ENGINE_TUNING, ...t }
  return (Object.keys(DEFAULT_ENGINE_TUNING) as (keyof EngineTuning)[])
    .every((k) => m[k] === DEFAULT_ENGINE_TUNING[k])
}

async function main() {
  const args = process.argv.slice(2)
  const fixtureIdx = args.indexOf('--fixture')
  const data = fixtureIdx >= 0 ? loadFixture(args[fixtureIdx + 1]) : await loadFromSupabase()
  const { cases } = buildCasesAndValidation(data, 'gpx_only')
  console.log(`[sweep] ${cases.length} courses candidates chargées`)

  const combos = combinations()
  console.log(`[sweep] ${combos.length} combinaisons à évaluer\n`)

  const scored: Scored[] = []
  for (const t of combos) {
    const s = score(cases, t)
    if (s) scored.push(s)
  }
  if (scored.length === 0) {
    console.error('[sweep] aucune course exploitable — abandon.')
    process.exit(1)
  }

  const base = scored.find((s) => isDefault(s.tuning))
  scored.sort((a, b) => a.macroMape - b.macroMape)

  console.log('| réglage | n | MAPE éch. | MAPE macro | biais |')
  console.log('|---|--:|--:|--:|--:|')
  for (const s of scored) {
    const tag = isDefault(s.tuning) ? ' ← PRODUCTION' : ''
    console.log(
      `| ${fmtTuning(s.tuning)} | ${s.n} | ${s.inSampleMape.toFixed(1)} % | ` +
      `${s.macroMape.toFixed(1)} % | ${(s.biasS / 60).toFixed(1)} min |${tag}`,
    )
  }

  const best = scored[0]
  console.log('')
  if (!base) {
    console.log('[sweep] réglage de production absent de la grille — pas de comparaison possible.')
    return
  }
  console.log(`[sweep] production : macro ${base.macroMape.toFixed(2)} % · échantillon ${base.inSampleMape.toFixed(2)} %`)
  console.log(`[sweep] meilleur   : macro ${best.macroMape.toFixed(2)} % · échantillon ${best.inSampleMape.toFixed(2)} % (${fmtTuning(best.tuning)})`)

  // ── VERDICT : leave-one-athlete-out ────────────────────────────────────────
  // Les colonnes ci-dessus sont DESCRIPTIVES : elles classent les réglages sur les
  // athlètes qui les ont élus. Le verdict, lui, choisit le réglage sans voir
  // l'athlète sur lequel il sera mesuré. Sur sept athlètes, c'est toute la
  // différence entre « ce réglage marche » et « ce réglage marche sur eux ».
  const verdict = selectTuningLeaveOneAthleteOut<EngineTuning>(
    scored.map((s): TuningErrors<EngineTuning> => ({ tuning: s.tuning, errorsByAthlete: s.errorsByAthlete })),
    isDefault,
  )

  console.log('')
  if (!verdict) {
    console.log('[sweep] ⚠ Leave-one-athlete-out impossible (moins de deux athlètes exploitables).')
    return
  }

  console.log('── LEAVE-ONE-ATHLETE-OUT ──')
  console.log('| athlète tenu à l’écart | réglage élu par les autres | MAPE hors éch. | MAPE production |')
  console.log('|---|---|--:|--:|')
  for (const p of verdict.perAthlete) {
    console.log(
      `| ${p.athleteId} | ${fmtTuning(p.chosen)} | ${p.heldOutMape.toFixed(1)} % | ${p.baselineMape.toFixed(1)} % |`,
    )
  }
  console.log('')
  console.log(`[loao] production      : ${verdict.baselineMape.toFixed(2)} %`)
  console.log(`[loao] hors échantillon: ${verdict.loaoMape.toFixed(2)} % (${verdict.gain >= 0 ? '+' : ''}${verdict.gain.toFixed(2)} pt)`)
  console.log(`[loao] stabilité de la sélection : ${Math.round(verdict.selectionStability * 100)} % (${verdict.selectionCounts.length} réglage(s) élu(s))`)
  console.log('')
  console.log(verdict.adopt
    ? `[sweep] ✅ ADOPTABLE — ${verdict.reason}\n         Reste à fournir un argument de FORME : un coefficient qui marche sans qu'on sache pourquoi est un surajustement qui s'ignore.`
    : `[sweep] ⛔ NE PAS RETENIR — ${verdict.reason}`)

  // Repère de lecture : l'écart entre le classement en échantillon et le verdict
  // hors échantillon est la mesure directe du surajustement de ce balayage.
  const macroGain = base.macroMape - best.macroMape
  console.log(
    `\n[sweep] Pour mémoire : en échantillon, le meilleur réglage gagnait ${macroGain.toFixed(2)} pt — ` +
    `hors échantillon, ${verdict.gain.toFixed(2)} pt.`,
  )
}

main().catch((err) => {
  console.error('[sweep] échec :', err instanceof Error ? err.message : err)
  process.exit(1)
})
