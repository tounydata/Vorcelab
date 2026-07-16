// Formatage du rapport de banc (JSON / CSV / Markdown). Logique PURE, testable.
// Ne produit QUE des données pseudonymisées (les lignes en entrée le sont déjà) :
// aucun nom, UUID brut ni coordonnée GPS.

import type { BacktestReport, BacktestRow, CategoryMetrics } from './realBacktest'

export function fmtHms(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const sign = seconds < 0 ? '-' : ''
  const s = Math.abs(Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${sign}${h}h${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${sign}${m}:${String(sec).padStart(2, '0')}`
}

function pct(x: number, digits = 1): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(digits)} %` : '—'
}
function n1(x: number): string {
  return Number.isFinite(x) ? x.toFixed(1) : '—'
}

/** summary.json : rapport complet (déjà pseudonymisé) tel quel. */
export function toSummaryJson(report: BacktestReport): string {
  return JSON.stringify(report, null, 2)
}

const CSV_COLUMNS: (keyof BacktestRow)[] = [
  'race_id', 'athlete_id', 'date', 'event_key', 'sport', 'distance_km', 'dplus_m', 'dplus_per_km',
  'stored_dplus_m', 'raw_gpx_dplus_m', 'smoothed_gpx_dplus_m', 'dplus_calibration_ratio', 'dplus_was_calibrated',
  'actual_moving_s', 'actual_elapsed_s', 'predicted_s', 'low_s', 'high_s',
  'error_vs_moving_s', 'error_vs_elapsed_s', 'error_vs_moving_pct', 'error_vs_elapsed_pct',
  'stop_gap_s', 'stop_gap_pct', 'stop_class', 'inside_interval', 'inside_interval_elapsed', 'confidence',
  'activities_before_count', 'prior_runs_count', 'prior_runs_with_streams', 'prior_stream_coverage_pct',
  'historical_data_quality', 'stream_coverage', 'alt_coverage', 'used_fallback', 'fcmax_source',
  'profile_quality', 'has_weather', 'has_hr', 'engine_version', 'profile_version', 'computed_at', 'as_of_at',
]

function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = Array.isArray(v) ? v.join('|') : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** results.csv : une ligne par course testée. */
export function toResultsCsv(report: BacktestReport): string {
  const header = CSV_COLUMNS.join(',')
  const lines = report.rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(','))
  return [header, ...lines].join('\n') + '\n'
}

function metricsRow(label: string, m: CategoryMetrics): string {
  return `| ${label} | ${m.n} | ${fmtHms(m.maeS)} | ${n1(m.mapePct)} % | ${m.meanBiasS >= 0 ? '+' : ''}${fmtHms(m.meanBiasS)} | ${fmtHms(m.medianAbsS)} | ${fmtHms(m.p75AbsS)} | ${fmtHms(m.p90AbsS)} | ${m.intervalCoverage == null ? '—' : pct(m.intervalCoverage)} | ${pct(m.optimisticPct, 0)} | ${pct(m.pessimisticPct, 0)} |`
}

function categoryTable(title: string, groups: Record<string, CategoryMetrics>): string {
  const keys = Object.keys(groups)
  if (keys.length === 0) return ''
  const head = `\n### ${title}\n\n| Catégorie | n | MAE | MAPE | Biais | Médiane | P75 | P90 | Couv. | Optim. | Pessim. |\n|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|`
  const rows = keys.map((k) => metricsRow(k, groups[k]))
  return [head, ...rows].join('\n') + '\n'
}

/** Bloc « métriques » (MAE/MAPE/biais/médiane/P75/P90/couverture) pour un CategoryMetrics. */
function metricsBlock(m: CategoryMetrics): string[] {
  return [
    '| Métrique | Valeur |',
    '|---|--:|',
    `| n | ${m.n} |`,
    `| MAE | ${fmtHms(m.maeS)} (${Number.isFinite(m.maeS) ? Math.round(m.maeS) : '—'} s) |`,
    `| MAPE | ${n1(m.mapePct)} % |`,
    `| Biais moyen (prévu − réel) | ${m.meanBiasS >= 0 ? '+' : ''}${fmtHms(m.meanBiasS)} |`,
    `| Médiane | ${fmtHms(m.medianAbsS)} |`,
    `| P75 | ${fmtHms(m.p75AbsS)} |`,
    `| P90 | ${fmtHms(m.p90AbsS)} |`,
    `| Couverture intervalle | ${m.intervalCoverage == null ? '—' : pct(m.intervalCoverage)} |`,
  ]
}

/** report.md : rapport lisible (échantillon, elapsed/moving, hors échantillon, D+…). */
export function toReportMarkdown(report: BacktestReport): string {
  const out: string[] = []
  out.push('# Banc de validation réel du moteur Vorcelab')
  out.push('')
  out.push(`> Généré le ${report.generatedAt} · moteur \`${report.engineVersion}\` · profil \`${report.profileVersion}\``)
  out.push('>')
  out.push('> `computed_at` = instant d\'exécution du banc · `as_of_at` = date historique du moteur (départ de la course). Horloge historique injectée → deux exécutions à des dates système différentes produisent les MÊMES projections.')
  out.push('')

  // ── Qualité de l'échantillon ──────────────────────────────────────────────────
  const s = report.sample
  out.push('## Qualité de l’échantillon')
  out.push('')
  out.push(`- Courses candidates : **${s.candidates}** · confirmées : **${s.confirmed}** · exclues : **${report.counts.excluded}** · testées : **${s.tested}**`)
  out.push(`- Athlètes : **${s.athletes}** · dates/événements distincts : **${s.distinctEvents}**`)
  out.push(`- Route : **${s.road}** · Trail : **${s.trail}**`)
  out.push(`- Qualité des streams historiques : good **${s.historicalQuality.good}** · partial **${s.historicalQuality.partial}** · poor **${s.historicalQuality.poor}**`)
  out.push('')
  if (report.validation) {
    const v = report.validation
    const fmtReasons = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, n]) => `\`${k}\` ×${n}`).join(', ')
    out.push(`- Validation candidats : confirmées **${v.confirmed}** · rejetées **${v.rejected}** · en attente **${v.pending}**`)
    if (Object.keys(v.rejectedReasons).length) out.push(`  - Rejet : ${fmtReasons(v.rejectedReasons)}`)
    if (Object.keys(v.pendingReasons).length) out.push(`  - Attente : ${fmtReasons(v.pendingReasons)}`)
    out.push('')
  }

  // ── Métriques temps écoulé (PRINCIPAL) ───────────────────────────────────────
  out.push('## Métriques — temps écoulé (elapsed, métrique PRINCIPALE)')
  out.push('')
  out.push('> Le temps écoulé représente l’heure d’arrivée réelle (pauses incluses). Métrique principale, sauf elapsed manifestement incohérent ou chrono officiel plus fiable.')
  out.push('')
  out.push(...metricsBlock(report.overallElapsed))
  out.push('')

  // ── Métriques temps en mouvement (SECONDAIRE) ────────────────────────────────
  out.push('## Métriques — temps en mouvement (moving, secondaire)')
  out.push('')
  out.push(...metricsBlock(report.overallMoving))
  out.push('')

  // ── Couverture des intervalles ───────────────────────────────────────────────
  out.push('## Couverture des intervalles')
  out.push('')
  out.push(`- Couverture vs moving : ${report.coverageVsMoving == null ? '—' : pct(report.coverageVsMoving)}`)
  out.push(`- Couverture vs elapsed : ${report.coverageVsElapsed == null ? '—' : pct(report.coverageVsElapsed)}`)
  out.push('')
  out.push('> Largeur de l’intervalle **inchangée** dans ce lot — seule sa couverture est re-mesurée après horloge historique, D+ lissé et évaluation elapsed/hors échantillon. La calibration de l’intervalle n’est PAS annoncée tant que le hors-échantillon n’est pas stable.')
  out.push('')

  // ── Validation hors échantillon ──────────────────────────────────────────────
  const oosTable = (o: typeof report.leaveOneDateOut) => [
    `- Folds : **${o.folds}** · n : **${o.n}**`,
    `- MAPE elapsed : **${n1(o.elapsed.mapePct)} %** (macro par fold : ${n1(o.macroMapeElapsedPct)} %) · biais ${o.elapsed.meanBiasS >= 0 ? '+' : ''}${fmtHms(o.elapsed.meanBiasS)}`,
    `- MAPE moving : **${n1(o.moving.mapePct)} %** (macro par fold : ${n1(o.macroMapeMovingPct)} %)`,
    `- Médiane elapsed ${fmtHms(o.elapsed.medianAbsS)} · P75 ${fmtHms(o.elapsed.p75AbsS)} · P90 ${fmtHms(o.elapsed.p90AbsS)} · couverture ${o.elapsed.intervalCoverage == null ? '—' : pct(o.elapsed.intervalCoverage)}`,
  ]
  out.push('## Validation hors échantillon')
  out.push('')
  out.push('> Aucun coefficient n’est ajusté dans ce lot : le découpage garantit qu’un même groupe (date/événement, ou athlète) n’est jamais scindé. Le moteur étant figé, l’agrégat des folds tenus à l’écart = l’échantillon complet ; la **macro-moyenne par fold** révèle une éventuelle dépendance à un groupe.')
  out.push('')
  out.push('### Leave-one-date-out')
  out.push('')
  out.push(...oosTable(report.leaveOneDateOut))
  out.push('')
  out.push('### Leave-one-athlete-out')
  out.push('')
  out.push(...oosTable(report.leaveOneAthleteOut))
  out.push('')

  // ── Bonne qualité uniquement ─────────────────────────────────────────────────
  out.push('## Restreint aux historiques de bonne qualité (streams > 85 %)')
  out.push('')
  out.push(`- Courses : **${report.goodQualityOnly.n}**`)
  out.push(`- MAPE elapsed : **${n1(report.goodQualityOnly.elapsed.mapePct)} %** · MAPE moving : **${n1(report.goodQualityOnly.moving.mapePct)} %**`)
  out.push(`- Couverture elapsed : ${report.goodQualityOnly.elapsed.intervalCoverage == null ? '—' : pct(report.goodQualityOnly.elapsed.intervalCoverage)}`)
  out.push('')

  // ── Contrôle du D+ ───────────────────────────────────────────────────────────
  const d = report.dplusControl
  out.push('## Contrôle du dénivelé (brut / lissé / Strava)')
  out.push('')
  out.push(`- Courses avec D+ Strava : **${d.n}**`)
  out.push(`- Écart moyen |D+ brut − Strava| : **${Number.isFinite(d.meanRawVsStoredM) ? Math.round(d.meanRawVsStoredM) : '—'} m**`)
  out.push(`- Écart moyen |D+ lissé − Strava| : **${Number.isFinite(d.meanSmoothedVsStoredM) ? Math.round(d.meanSmoothedVsStoredM) : '—'} m**`)
  out.push(`- Parcours recalés proportionnellement : **${d.calibratedCount}**`)
  if (d.largestGaps.length) {
    out.push('')
    out.push('| Course | Stocké | Brut | Lissé |')
    out.push('|---|--:|--:|--:|')
    for (const g of d.largestGaps) out.push(`| ${g.race_id} | ${g.stored ?? '—'} | ${g.raw} | ${g.smoothed} |`)
  }
  out.push('')

  // ── Ventilations ─────────────────────────────────────────────────────────────
  out.push('## Ventilations par catégorie (temps en mouvement)')
  out.push(categoryTable('Par athlète (anonymisé)', report.byAthlete))
  out.push(categoryTable('Route vs Trail', report.byTerrain))
  out.push(categoryTable('Par distance', report.byDistance))
  out.push(categoryTable('Par D+/km', report.byDplus))
  out.push(categoryTable('Par qualité du profil historique', report.byProfileQuality))
  out.push(categoryTable('Par qualité des streams historiques', report.byDataQuality))
  out.push(categoryTable('Par source de FC max', report.byFcMaxSource))
  out.push(categoryTable('Avec / sans météo', report.byWeather))
  out.push(categoryTable('Avec / sans FC', report.byHr))
  out.push(categoryTable('Moteur : historique vs fallback', report.byEngineMode))
  out.push('')

  // ── Détail par course ────────────────────────────────────────────────────────
  out.push('## Détail par course')
  out.push('')
  out.push('| Course | Athlète | Date | Sport | Dist | D+ (str/brut/liss) | Moving | Elapsed | Prévu | Err elapsed | Interv.(e) | Conf. | Qual. | FCmax | Fallback |')
  out.push('|---|---|---|---|--:|--:|--:|--:|--:|--:|:--:|:--:|:--:|:--:|:--:|')
  for (const r of report.rows) {
    out.push(`| ${r.race_id} | ${r.athlete_id} | ${r.date} | ${r.sport} | ${r.distance_km.toFixed(1)} | ${r.stored_dplus_m ?? '—'}/${r.raw_gpx_dplus_m}/${r.smoothed_gpx_dplus_m} | ${fmtHms(r.actual_moving_s)} | ${r.actual_elapsed_s == null ? '—' : fmtHms(r.actual_elapsed_s)} | ${fmtHms(r.predicted_s)} | ${r.error_vs_elapsed_s == null ? '—' : (r.error_vs_elapsed_s >= 0 ? '+' : '') + fmtHms(r.error_vs_elapsed_s)} | ${r.inside_interval_elapsed == null ? '—' : (r.inside_interval_elapsed ? '✓' : '✗')} | ${r.confidence} | ${r.historical_data_quality} | ${r.fcmax_source} | ${r.used_fallback ? 'oui' : 'non'} |`)
  }
  out.push('')
  if (report.excluded.length > 0) {
    out.push('## Courses exclues')
    out.push('')
    out.push('| Course | Athlète | Date | Raison |')
    out.push('|---|---|---|---|')
    for (const e of report.excluded) out.push(`| ${e.race_id} | ${e.athlete_id} | ${e.date} | \`${e.exclusion_reason}\` |`)
    out.push('')
  }
  out.push('---')
  out.push('')
  out.push('_Aucune coordonnée GPS ni donnée nominative dans ce rapport. Métrique principale = `elapsed_time` ; `moving_time` en secondaire. Les coefficients moteur ne sont PAS modifiés dans ce lot._')
  out.push('')
  return out.join('\n')
}
