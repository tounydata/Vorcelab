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
  'gpx_only_dplus_m', 'official_dplus_m', 'post_race_strava_dplus_m', 'elevation_reference_mode',
  'actual_moving_s', 'actual_elapsed_s', 'predicted_s', 'low_s', 'high_s',
  'error_vs_moving_s', 'error_vs_elapsed_s', 'error_vs_moving_pct', 'error_vs_elapsed_pct',
  'stop_gap_s', 'stop_gap_pct', 'stop_class', 'inside_interval', 'inside_interval_elapsed', 'confidence',
  'activities_before_count', 'prior_runs_count', 'prior_runs_with_streams', 'prior_stream_coverage_pct',
  'historical_data_quality', 'stream_coverage', 'alt_coverage',
  'steepness_calibration_active', 'steepness_calibration_race_count',
  'steepness_calibration_spread_dplus_per_km', 'steepness_calibration_reason',
  'auto_best_efforts_count', 'critical_speed_mps', 'used_stream_best_efforts',
  'used_personal_fade', 'personal_fade_exponent', 'predicted_s_no_be',
  'used_fallback', 'fcmax_source',
  'profile_quality', 'has_weather', 'has_hr', 'engine_version', 'profile_version', 'computed_at', 'as_of_at',
  'history_window_days', 'runner_profile_window_days',
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

  // ── Fenêtres moteur ───────────────────────────────────────────────────────────
  out.push('## Fenêtres')
  out.push('')
  out.push(`- \`engine_history_days\` : **${report.windows.engineHistoryDays}** (historique global six mois)`)
  out.push(`- \`runner_profile_window_days\` : **${report.windows.runnerProfileWindowDays}** (profil récent par pente)`)
  out.push(`- \`elevation_reference_mode\` (métrique principale) : **${report.elevationReferenceMode}**`)
  out.push('')

  // ── Volume d'activités chargé (diagnostic) ────────────────────────────────────
  const av = report.activityVolume
  const smc = report.sixMonthCounts
  out.push('## Volume d’activités chargé (fenêtre six mois)')
  out.push('')
  out.push(`- Moyenne : **${av.meanActivityCount}** · P75 : **${av.p75ActivityCount}** · P90 : **${av.p90ActivityCount}** · max : **${av.maxActivityCount}**`)
  out.push(`- Charge utile approx. : **${(av.approxPayloadBytes / 1024).toFixed(1)} Kio** / projection (≈ ${av.meanActivityCount} activités)`)
  out.push(`- Moyenne running/trail : **${smc.meanRunningActivities}** · runs avec streams : **${smc.meanRunsWithStreams}** · couverture streams : **${n1(smc.meanStreamCoveragePct)} %**`)
  out.push(`- Compétitions confirmées (ancrage) : **${smc.confirmedRaceAnchorCount}**`)
  out.push('> La fenêtre temporelle peut retourner **plus de 150 activités** pour un athlète très actif (la limite arbitraire `.limit(150)` a été retirée).')
  out.push('')

  // ── Records auto détectés depuis les streams (Étape 1) ────────────────────────
  const roadRows = report.rows.filter((r) => r.sport === 'road')
  const usedBE = roadRows.filter((r) => r.used_stream_best_efforts).length
  const withCS = report.rows.filter((r) => r.critical_speed_mps != null)
  const meanCS = withCS.length ? withCS.reduce((s, r) => s + (r.critical_speed_mps as number), 0) / withCS.length : NaN
  const meanBE = report.rows.length ? report.rows.reduce((s, r) => s + r.auto_best_efforts_count, 0) / report.rows.length : 0
  out.push('## Records auto (détectés depuis les streams, toutes sorties)')
  out.push('')
  out.push(`- Courses ROUTE s'appuyant sur des records auto : **${usedBE}/${roadRows.length}**`)
  out.push(`- Records auto détectés en moyenne par course : **${meanBE.toFixed(1)}**`)
  out.push(`- Vitesse critique estimée (moy.) : **${Number.isFinite(meanCS) ? meanCS.toFixed(2) + ' m/s' : '—'}** (sur ${withCS.length} courses)`)
  const usedFade = report.rows.filter((r) => r.used_personal_fade)
  const meanExp = usedFade.length ? usedFade.reduce((s, r) => s + (r.personal_fade_exponent as number), 0) / usedFade.length : NaN
  out.push(`- Durabilité : exposant d'endurance personnel utilisé sur **${usedFade.length}** courses (moy. **${Number.isFinite(meanExp) ? meanExp.toFixed(3) : '—'}**)`)
  out.push('')
  // A/B déterministe : précision AVEC vs SANS les features stream (records + durabilité).
  const ab = report.streamBestEffortsAB
  const line = (label: string, s: typeof ab.overall) => {
    if (s.n === 0) return `- **${label}** : aucune course impactée.`
    const delta = s.mapeElapsedWithoutPct - s.mapeElapsedWithPct
    const verdict = delta > 0.01 ? `**améliore** de ${delta.toFixed(2)} pt` : delta < -0.01 ? `**dégrade** de ${(-delta).toFixed(2)} pt` : 'neutre'
    return `- **${label} (${s.n})** — MAPE elapsed SANS : **${n1(s.mapeElapsedWithoutPct)} %** → AVEC : **${n1(s.mapeElapsedWithPct)} %** (${verdict}) · MAE ${fmtHms(s.maeElapsedWithoutS)} → ${fmtHms(s.maeElapsedWithS)}`
  }
  out.push('### A/B records auto + durabilité (contrefactuel déterministe)')
  out.push('')
  out.push(line('Global', ab.overall))
  out.push(line('Route', ab.road))
  out.push(line('Trail', ab.trail))
  out.push('> Même horloge, mêmes données, projection recalculée SANS les features stream → isole leur effet propre. Les records touchent surtout la route, la durabilité surtout le trail long.')
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

  // ── Analyse d'erreur par groupes (PAS du hors-échantillon) ───────────────────
  const groupTable = (o: typeof report.groupedErrorAnalysisByDate) => [
    `- Folds : **${o.folds}** · n : **${o.n}** · hors-échantillon réel : **${o.is_true_out_of_sample ? 'oui' : 'non'}**`,
    `- MAPE elapsed : **${n1(o.elapsed.mapePct)} %** (macro par fold : ${n1(o.macroMapeElapsedPct)} %) · biais ${o.elapsed.meanBiasS >= 0 ? '+' : ''}${fmtHms(o.elapsed.meanBiasS)}`,
    `- MAPE moving : **${n1(o.moving.mapePct)} %** (macro par fold : ${n1(o.macroMapeMovingPct)} %)`,
    `- Médiane elapsed ${fmtHms(o.elapsed.medianAbsS)} · P75 ${fmtHms(o.elapsed.p75AbsS)} · P90 ${fmtHms(o.elapsed.p90AbsS)} · couverture ${o.elapsed.intervalCoverage == null ? '—' : pct(o.elapsed.intervalCoverage)}`,
  ]
  out.push('## Analyse d’erreur par groupes')
  out.push('')
  out.push('> ⚠ Ce n’est **PAS** du hors-échantillon (`is_true_out_of_sample = false`) : les projections ne sont pas recalculées en excluant un fold — les erreurs déjà obtenues sont simplement **regroupées** par date/événement ou par athlète. Le découpage garantit qu’un même groupe n’est jamais scindé ; la **macro-moyenne par fold** révèle une éventuelle dépendance à un groupe.')
  out.push('')
  out.push('### Groupé par date / événement')
  out.push('')
  out.push(...groupTable(report.groupedErrorAnalysisByDate))
  out.push('')
  out.push('### Groupé par athlète')
  out.push('')
  out.push(...groupTable(report.groupedErrorAnalysisByAthlete))
  out.push('')
  out.push('### Vraie validation hors échantillon')
  out.push('')
  out.push(`- Par date : ${report.trueLeaveOneDateOut == null ? '**non applicable** dans ce lot (aucun coefficient global recalibré ; calibration & ancrage PERSONNELS)' : 'calculée'}`)
  out.push(`- Par athlète : ${report.trueLeaveOneAthleteOut == null ? '**non applicable** dans ce lot' : 'calculée'}`)
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
