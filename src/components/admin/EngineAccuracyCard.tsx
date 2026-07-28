import { useQuery } from '@tanstack/react-query'
import { loadProjectionAccuracy } from '../../lib/loadProjectionAccuracy'
import { describeBias } from '../../lib/projectionAccuracy'
import type { ErrorMetrics } from '../../lib/engineBacktest'

// ─── Précision RÉELLE du moteur de projection ────────────────────────────────
// Confronte les prédictions FIGÉES AVANT chaque course (snapshots prospectifs,
// immuables) aux résultats réels, ventilées par version de moteur. C'est le seul
// endroit du produit qui répond à « est-ce que la version N+1 a amélioré ou dégradé
// la précision ? » — `last_projection` ne peut pas y répondre : il est réécrit à
// chaque ouverture de page, et une projection recalculée après la course inclut la
// course elle-même dans son ancrage, ce qui écrase l'erreur.

function fmtMin(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const sign = seconds < 0 ? '−' : ''
  const m = Math.abs(seconds) / 60
  return `${sign}${m.toFixed(1)} min`
}

function fmtPct(x: number): string {
  return Number.isFinite(x) ? `${x.toFixed(1)} %` : '—'
}

function fmtRate(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)} %`
}

function MetricRow({ label, m, optimistic }: { label: string; m: ErrorMetrics; optimistic: number | null }) {
  return (
    <tr>
      <td style={{ padding: '4px 10px 4px 0', color: 'var(--vl-text-2)' }}>{label}</td>
      <td style={{ padding: '4px 10px 4px 0', textAlign: 'right' }}>{m.n}</td>
      <td style={{ padding: '4px 10px 4px 0', textAlign: 'right' }}>{fmtPct(m.mapePct)}</td>
      <td style={{ padding: '4px 10px 4px 0', textAlign: 'right' }}>{fmtMin(m.meanBiasS)}</td>
      <td style={{ padding: '4px 10px 4px 0', textAlign: 'right' }}>{fmtMin(m.medianAbsS)}</td>
      <td style={{ padding: '4px 0', textAlign: 'right' }}>
        {m.intervalCoverage == null ? '—' : `${Math.round(m.intervalCoverage * 100)} %`}
      </td>
      <td style={{ padding: '4px 0 4px 10px', textAlign: 'right' }}>{fmtRate(optimistic)}</td>
    </tr>
  )
}

export default function EngineAccuracyCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projection-accuracy'],
    queryFn: () => loadProjectionAccuracy(),
    staleTime: 5 * 60 * 1000,
  })

  const bias = data ? describeBias(data.overallMoving) : null

  return (
    <div className="card" style={{ marginBottom: '1.5rem', padding: '14px 16px' }}>
      <div className="clabel" style={{ marginBottom: 4 }}>PRÉCISION RÉELLE DU MOTEUR</div>
      <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginBottom: 12 }}>
        Prédictions figées <strong>avant</strong> le départ, confrontées au résultat réel.
        Biais négatif = le moteur annonce plus vite que la réalité.
      </div>

      {isLoading && <div style={{ fontSize: 12, color: 'var(--vl-text-3)' }}>Chargement…</div>}
      {error && <div style={{ fontSize: 12, color: 'var(--vl-ember)' }}>Erreur de chargement.</div>}

      {data && data.evaluatedCount === 0 && (
        <div style={{ fontSize: 12, color: 'var(--vl-text-2)' }}>
          Aucune course évaluée pour l’instant
          {data.pendingCount > 0 && ` — ${data.pendingCount} projection(s) figée(s) en attente de résultat`}.
          {' '}Le résultat s’enregistre automatiquement en liant l’activité à la course.
        </div>
      )}

      {data && data.evaluatedCount > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 12, fontFamily: 'var(--vl-mono)', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ color: 'var(--vl-text-3)', fontSize: 10 }}>
                  <th style={{ textAlign: 'left', padding: '0 10px 6px 0' }}>VERSION</th>
                  <th style={{ textAlign: 'right', padding: '0 10px 6px 0' }}>N</th>
                  <th style={{ textAlign: 'right', padding: '0 10px 6px 0' }}>MAPE</th>
                  <th style={{ textAlign: 'right', padding: '0 10px 6px 0' }}>BIAIS</th>
                  <th style={{ textAlign: 'right', padding: '0 10px 6px 0' }}>MÉDIAN</th>
                  <th style={{ textAlign: 'right', padding: '0 0 6px 0' }}>COUV.</th>
                  <th style={{ textAlign: 'right', padding: '0 0 6px 10px' }}>OPTIM.</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Toutes versions" m={data.overallMoving} optimistic={data.optimisticRate} />
                {data.byVersion.map((v) => (
                  <MetricRow key={v.engineVersion} label={v.engineVersion} m={v.moving} optimistic={v.optimisticRate} />
                ))}
              </tbody>
            </table>
          </div>

          {bias && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--vl-text-2)' }}>{bias}</div>
          )}
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--vl-text-3)' }}>
            Base : temps de <strong>mouvement</strong> (celle sur laquelle le moteur est calibré).
            Sur le chrono officiel, le MAPE global est de {fmtPct(data.overallElapsed.mapePct)}.
            {data.pendingCount > 0 && ` ${data.pendingCount} projection(s) encore sans résultat.`}
          </div>
        </>
      )}
    </div>
  )
}
