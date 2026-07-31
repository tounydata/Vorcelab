// BANC D'ABLATION : que vaut RÉELLEMENT chaque correction du moteur ?
//
// Le moteur apprend, par athlète, ses allures par pente, son régime de marche, sa fatigue
// de montée et de descente, ses relances, son endurance. Ça, c'est le cœur — et ce n'est
// pas ce que ce script teste.
//
// Par-dessus, il applique SEPT corrections successives. Plusieurs sont apprises sur les
// MÊMES 3-4 courses étiquetées et corrigent la même chose par des chemins différents. Le
// code le reconnaît lui-même en retenant « la contrainte la plus lente, pas leur produit »
// pour éviter de compter deux fois. C'est l'aveu d'une redondance, et c'est exactement
// dans cette couche que se cachait le cliquet d'ancrage — six points de MAPE, invisibles
// pendant des mois.
//
// Principe : on retire UNE correction, on rejoue les 58 courses, on compare.
//
//   • la précision se dégrade  → la correction sert vraiment, on la garde, et on sait
//                                enfin de combien.
//   • la précision ne bouge pas → elle ne sert à rien. Elle part.
//   • la précision s'AMÉLIORE   → elle nuit. Elle part d'urgence.
//
// Une correction qu'on ne peut pas retirer est une correction qu'on ne peut pas justifier.
//
// Métrique de décision : la MACRO-moyenne des MAPE par athlète (chaque athlète pèse
// pareil, sinon le plus prolifique décide pour tous les autres). Le seuil de matérialité
// est le même que pour le balayage : 0,5 pt. En dessous, sur 7 athlètes, c'est du bruit.
//
// LECTURE SEULE. Usage :
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/ablate-engine.ts

import { loadFixture, loadFromSupabase, buildCasesAndValidation } from './run-real-engine-backtest'
import { runRealBacktest, type RaceCaseInput } from '../src/lib/realBacktest'
import type { EngineAblation } from '../src/lib/computeRaceProjection'

/** Seuil de matérialité (points de MAPE). En dessous : indiscernable du bruit. */
const MATERIALITY_PT = 0.5

const ABLATIONS: { key: keyof EngineAblation | 'none'; label: string }[] = [
  { key: 'none', label: 'AUCUNE (production complète)' },
  { key: 'raceIntensityFactor', label: 'sans FIC (intensité de course)' },
  { key: 'anchor', label: "sans ANCRAGE (entier)" },
  { key: 'durationCalibration', label: "sans axe DURÉE de l'ancrage" },
  { key: 'steepnessCalibration', label: "sans axe PENTE de l'ancrage" },
  { key: 'freshness', label: 'sans FRAÎCHEUR (ACWR)' },
  { key: 'enduranceFade', label: 'sans FADE endurance (Riegel)' },
  { key: 'verticalFatigue', label: 'sans FATIGUE du dénivelé' },
]

interface Scored {
  label: string
  macroMape: number
  inSampleMape: number
  biasMin: number
  n: number
}

function score(cases: RaceCaseInput[], label: string, ablate: EngineAblation): Scored | null {
  const report = runRealBacktest(cases, { ablate })
  const rows = report.rows.filter(
    (r) => r.error_vs_elapsed_pct != null && Number.isFinite(r.error_vs_elapsed_pct),
  )
  if (rows.length === 0) return null

  const abs = (r: (typeof rows)[number]) => Math.abs(r.error_vs_elapsed_pct as number)
  const inSampleMape = rows.reduce((s, r) => s + abs(r), 0) / rows.length
  const biasS = rows.reduce((s, r) => s + (r.error_vs_elapsed_s ?? 0), 0) / rows.length

  const byAthlete = new Map<string, number[]>()
  for (const r of rows) {
    const list = byAthlete.get(r.athlete_id)
    if (list) list.push(abs(r))
    else byAthlete.set(r.athlete_id, [abs(r)])
  }
  let macro = 0
  for (const [, errs] of byAthlete) macro += errs.reduce((a, b) => a + b, 0) / errs.length
  macro /= byAthlete.size

  return { label, macroMape: macro, inSampleMape, biasMin: biasS / 60, n: rows.length }
}

async function main() {
  const args = process.argv.slice(2)
  const fixtureIdx = args.indexOf('--fixture')
  const data = fixtureIdx >= 0 ? loadFixture(args[fixtureIdx + 1]) : await loadFromSupabase()
  const { cases } = buildCasesAndValidation(data, 'gpx_only')
  console.log(`[ablation] ${cases.length} courses candidates\n`)

  const results: Scored[] = []
  for (const { key, label } of ABLATIONS) {
    const ablate: EngineAblation = key === 'none' ? {} : { [key]: true }
    const s = score(cases, label, ablate)
    if (s) results.push(s)
  }
  const base = results[0]
  if (!base) {
    console.error('[ablation] aucune course exploitable — abandon.')
    process.exit(1)
  }

  console.log('| correction retirée | n | MAPE macro | Δ macro | MAPE éch. | biais |')
  console.log('|---|--:|--:|--:|--:|--:|')
  for (const r of results) {
    const d = r.macroMape - base.macroMape
    const delta = r === base ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)} pt`
    console.log(
      `| ${r.label} | ${r.n} | ${r.macroMape.toFixed(2)} % | ${delta} | ` +
      `${r.inSampleMape.toFixed(2)} % | ${r.biasMin.toFixed(1)} min |`,
    )
  }

  console.log('\n── Verdict par correction ──────────────────────────────────────')
  for (const r of results.slice(1)) {
    const d = r.macroMape - base.macroMape
    if (d < -MATERIALITY_PT) {
      console.log(`❌ ${r.label} : la RETIRER AMÉLIORE de ${(-d).toFixed(2)} pt → elle NUIT, à supprimer.`)
    } else if (d > MATERIALITY_PT) {
      console.log(`✅ ${r.label} : la retirer dégrade de ${d.toFixed(2)} pt → elle SERT, à garder.`)
    } else {
      console.log(`🟡 ${r.label} : écart de ${d >= 0 ? '+' : ''}${d.toFixed(2)} pt, sous le seuil de ${MATERIALITY_PT} pt → INUTILE en l'état, candidate à la suppression.`)
    }
  }

  console.log(
    '\nRappel : « inutile » signifie « ne sert pas SUR CET ÉCHANTILLON » (58 courses, ' +
    '7 athlètes, aucune au-delà de 57 km). Une correction pensée pour l\'ultra peut être ' +
    'muette ici et indispensable plus tard — vérifier son domaine d\'action avant de la ' +
    'retirer, et ne jamais supprimer sur la seule foi de ce tableau.',
  )
}

main().catch((err) => {
  console.error('[ablation] échec :', err instanceof Error ? err.message : err)
  process.exit(1)
})
