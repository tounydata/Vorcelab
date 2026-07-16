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
  'race_id', 'athlete_id', 'date', 'sport', 'distance_km', 'dplus_m', 'dplus_per_km',
  'actual_s', 'actual_elapsed_s', 'predicted_s', 'low_s', 'high_s', 'error_s',
  'absolute_error_s', 'error_pct', 'inside_interval', 'confidence',
  'activities_before_count', 'stream_coverage', 'alt_coverage', 'used_fallback',
  'profile_quality', 'has_weather', 'has_hr', 'engine_version', 'profile_version', 'computed_at',
]

function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
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

/** report.md : rapport lisible (métriques globales + ventilations + détail par course). */
export function toReportMarkdown(report: BacktestReport): string {
  const o = report.overall
  const out: string[] = []
  out.push('# Banc de validation réel du moteur Vorcelab')
  out.push('')
  out.push(`> Généré le ${report.generatedAt} · moteur \`${report.engineVersion}\` · profil \`${report.profileVersion}\``)
  out.push('')
  out.push('## Périmètre')
  out.push('')
  out.push(`- Courses candidates : **${report.counts.candidates}**`)
  out.push(`- Confirmées : **${report.counts.confirmed}**`)
  out.push(`- Exclues : **${report.counts.excluded}**`)
  out.push(`- Réellement testées : **${report.counts.tested}**`)
  out.push('')
  if (report.validation) {
    const v = report.validation
    out.push('### Validation des candidats')
    out.push('')
    out.push(`- Confirmées : **${v.confirmed}** · rejetées : **${v.rejected}** · en attente : **${v.pending}**`)
    const fmtReasons = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, n]) => `\`${k}\` ×${n}`).join(', ')
    if (Object.keys(v.rejectedReasons).length) out.push(`- Raisons de rejet : ${fmtReasons(v.rejectedReasons)}`)
    if (Object.keys(v.pendingReasons).length) out.push(`- Raisons d'attente : ${fmtReasons(v.pendingReasons)}`)
    out.push('')
  }
  out.push('## Métriques globales')
  out.push('')
  out.push('| Métrique | Valeur |')
  out.push('|---|--:|')
  out.push(`| MAE (erreur absolue moyenne) | ${fmtHms(o.maeS)} (${Math.round(o.maeS)} s) |`)
  out.push(`| MAPE | ${n1(o.mapePct)} % |`)
  out.push(`| Biais moyen signé (prévu − réel) | ${o.meanBiasS >= 0 ? '+' : ''}${fmtHms(o.meanBiasS)} |`)
  out.push(`| Erreur médiane | ${fmtHms(o.medianAbsS)} |`)
  out.push(`| P75 | ${fmtHms(o.p75AbsS)} |`)
  out.push(`| P90 | ${fmtHms(o.p90AbsS)} |`)
  out.push(`| Couverture de l'intervalle | ${o.intervalCoverage == null ? '—' : pct(o.intervalCoverage)} |`)
  out.push(`| Projections optimistes (trop rapides) | ${pct(o.optimisticPct, 0)} |`)
  out.push(`| Projections pessimistes (trop lentes) | ${pct(o.pessimisticPct, 0)} |`)
  out.push('')
  out.push('## Ventilations par catégorie')
  out.push(categoryTable('Par athlète (anonymisé)', report.byAthlete))
  out.push(categoryTable('Route vs Trail', report.byTerrain))
  out.push(categoryTable('Par distance', report.byDistance))
  out.push(categoryTable('Par D+/km', report.byDplus))
  out.push(categoryTable('Par qualité du profil historique', report.byProfileQuality))
  out.push(categoryTable('Avec / sans météo', report.byWeather))
  out.push(categoryTable('Avec / sans FC', report.byHr))
  out.push(categoryTable('Moteur : historique vs fallback', report.byEngineMode))
  out.push('')
  out.push('## Détail par course')
  out.push('')
  out.push('| Course | Athlète | Date | Sport | Dist (km) | D+ (m) | Réel | Prévu | Erreur | % | Interv. | Conf. | Hist. | Fallback |')
  out.push('|---|---|---|---|--:|--:|--:|--:|--:|--:|:--:|:--:|--:|:--:|')
  for (const r of report.rows) {
    out.push(`| ${r.race_id} | ${r.athlete_id} | ${r.date} | ${r.sport} | ${r.distance_km.toFixed(1)} | ${r.dplus_m} | ${fmtHms(r.actual_s)} | ${fmtHms(r.predicted_s)} | ${r.error_s >= 0 ? '+' : ''}${fmtHms(r.error_s)} | ${r.error_pct >= 0 ? '+' : ''}${r.error_pct.toFixed(1)} % | ${r.inside_interval ? '✓' : '✗'} | ${r.confidence} | ${r.activities_before_count} | ${r.used_fallback ? 'oui' : 'non'} |`)
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
  out.push('_Aucune coordonnée GPS ni donnée nominative dans ce rapport. Les temps réels utilisent `moving_time`._')
  out.push('')
  return out.join('\n')
}
