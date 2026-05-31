import { deriveRunnerPaces } from '../lib/runnerPaces'
import { formatPace, hrFromMax, type PaceZone } from '../lib/paceEngine'

const ZONE_COLOR: Record<PaceZone, string> = { E: '#22c55e', M: '#eab308', T: '#f97316', I: '#ef4444', R: '#b91c1c' }
const ZONE_LABEL: Record<PaceZone, string> = { E: 'Facile', M: 'Marathon', T: 'Seuil', I: 'VO2max', R: 'Vitesse' }
const ZONES: PaceZone[] = ['E', 'M', 'T', 'I', 'R']

const FC_ZONES = [
  { label: 'Z1', color: '#3b82f6', from: 0, to: 0.6 },
  { label: 'Z2', color: '#22c55e', from: 0.6, to: 0.7 },
  { label: 'Z3', color: '#eab308', from: 0.7, to: 0.8 },
  { label: 'Z4', color: '#f97316', from: 0.8, to: 0.9 },
  { label: 'Z5', color: '#ef4444', from: 0.9, to: 1 },
]

/** Carte « Mes allures » — allures d'entraînement réelles + zones FC. Null-safe. */
export default function PaceZonesCard({ prs, vo2max, fcMax }: {
  prs?: Record<string, unknown> | null
  vo2max?: number | null
  fcMax?: number | null
}) {
  const rp = deriveRunnerPaces(prs, vo2max)

  if (!rp && !fcMax) {
    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="clabel" style={{ margin: '0 0 6px' }}>MES ALLURES</div>
        <p style={{ fontSize: 13, color: 'var(--vl-text-3)', margin: 0 }}>
          Ajoute ta VO2max ou un temps de course récent pour calculer tes allures cibles.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div className="clabel" style={{ margin: 0 }}>MES ALLURES</div>
        {rp ? (
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
            VDOT {rp.vdot} · {rp.source === 'race_pr' ? "d'après ta course" : 'estimé (VO2max)'}
          </div>
        ) : null}
      </div>

      {rp ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: fcMax ? 14 : 0 }}>
          {ZONES.map((z) => (
            <div key={z} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 4, height: 18, borderRadius: 2, background: ZONE_COLOR[z], flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--vl-text)' }}>{ZONE_LABEL[z]}</span>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-2)', fontWeight: 700 }}>
                {formatPace(rp.paces[z].fastSecPerKm)}–{formatPace(rp.paces[z].slowSecPerKm)}/km
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {fcMax ? (
        <div>
          <div className="clabel" style={{ margin: '0 0 6px', fontSize: 9 }}>ZONES FC · %FCMAX {fcMax}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {FC_ZONES.map((z) => (
              <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ width: 4, height: 14, borderRadius: 2, background: z.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--vl-text-2)' }}>{z.label}</span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)' }}>
                  {z.from > 0 ? `${hrFromMax(fcMax, z.from)}–` : '<'}{hrFromMax(fcMax, z.to)} bpm
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
