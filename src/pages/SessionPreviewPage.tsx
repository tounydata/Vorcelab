import SessionProfile from '../components/SessionProfile'
import PaceZonesCard from '../components/PaceZonesCard'
import { easyRun, tempoRun, cruiseIntervals, vo2_30_30, hillSession } from '../lib/sessionGenerator'

// Aperçu public des séances générées (route additive, sans authentification ni données).
// Démontre le rendu du profil d'intensité à partir du sessionGenerator + paceEngine.
const VDOT = 50
const SAMPLES = [
  easyRun(VDOT, 45),
  tempoRun(VDOT, 20),
  cruiseIntervals(VDOT, 5, 6),
  vo2_30_30(VDOT, 12),
  hillSession('force', 8),
]

export default function SessionPreviewPage() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h1 style={{ fontFamily: 'var(--vl-display)', fontSize: 28, margin: '0 0 4px' }}>Aperçu des séances</h1>
      <p style={{ fontSize: 13, color: 'var(--vl-text-3)', margin: '0 0 20px' }}>
        Profils d'intensité générés (VDOT {VDOT}) — démonstration du moteur de séances.
      </p>
      <PaceZonesCard prs={{ '10k': { timeS: 2400, dist: 10000 } }} fcMax={190} />
      {SAMPLES.map((w, i) => (
        <SessionProfile key={i} workout={w} />
      ))}
    </div>
  )
}
