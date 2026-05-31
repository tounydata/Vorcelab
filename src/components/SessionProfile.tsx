import { workoutChartBars } from '../lib/workoutChart'
import { formatPace, type PaceZone } from '../lib/paceEngine'
import type { Workout, Block } from '../lib/sessionGenerator'

// Couleurs de zones alignées sur la palette FC de l'app (bleu→vert→jaune→orange→rouge).
// Déterministe et stable par zone (cf. ui-spec).
const ZONE_COLOR: Record<PaceZone, string> = {
  E: '#22c55e', // facile
  M: '#eab308', // marathon
  T: '#f97316', // seuil
  I: '#ef4444', // VO2max
  R: '#b91c1c', // répétition / vitesse
}
const RECOVERY_COLOR = '#3b82f6' // récup / échauffement / retour au calme

function barColor(kind: Block['kind'], zone?: PaceZone): string {
  if (kind === 'recovery') return RECOVERY_COLOR
  if (zone) return ZONE_COLOR[zone]
  return ZONE_COLOR.T // bloc sans allure (côte, piloté RPE)
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec % 60 === 0) return `${sec / 60} min`
  const m = Math.floor(sec / 60)
  return `${m}:${String(sec % 60).padStart(2, '0')}`
}

function BlockRow({ block }: { block: Block }) {
  const detail = block.paceSecPerKm
    ? `${formatPace(block.paceSecPerKm)}/km`
    : typeof block.rpe === 'number'
      ? `RPE ${block.rpe}`
      : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ width: 4, height: 18, borderRadius: 2, background: barColor(block.kind, block.zone), flexShrink: 0 }} />
      <span style={{ flex: 1, color: 'var(--vl-text)' }}>{block.label}</span>
      {block.durationSec ? (
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>{fmtDur(block.durationSec)}</span>
      ) : null}
      {detail ? (
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-2)', fontWeight: 700 }}>{detail}</span>
      ) : null}
    </div>
  )
}

/** Écran de séance — profil d'intensité (barres) + liste des blocs. Présentationnel. */
export default function SessionProfile({ workout }: { workout: Workout }) {
  const bars = workoutChartBars(workout)
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div className="clabel" style={{ margin: 0 }}>{workout.type.replace(/_/g, ' ').toUpperCase()}</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-2)' }}>{workout.totalMin} min</div>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.4 }}>{workout.intent}</p>

      <div
        role="img"
        aria-label="Profil d'intensité"
        style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 90, marginBottom: 14 }}
      >
        {bars.map((b, i) => (
          <div
            key={i}
            title={b.label}
            style={{
              flexGrow: b.widthPct,
              flexBasis: 0,
              height: `${b.heightPct}%`,
              background: barColor(b.kind, b.zone),
              borderRadius: '3px 3px 0 0',
              minWidth: 2,
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {workout.blocks.map((b, i) => (
          <BlockRow key={i} block={b} />
        ))}
      </div>
    </div>
  )
}
