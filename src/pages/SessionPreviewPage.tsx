import PaceZonesCard from '../components/PaceZonesCard'
import SessionBrowser from '../components/SessionBrowser'

// Aperçu public (route additive, sans auth ni données réelles) : démontre le parcours
// choix-first — allures + catalogue + détail au tap.
const VDOT = 50

export default function SessionPreviewPage() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h1 style={{ fontFamily: 'var(--vl-display)', fontSize: 28, margin: '0 0 4px' }}>Aperçu des séances</h1>
      <p style={{ fontSize: 13, color: 'var(--vl-text-3)', margin: '0 0 20px' }}>
        Démonstration choix-first (VDOT {VDOT}) — tu choisis ta séance.
      </p>
      <PaceZonesCard prs={{ '10k': { timeS: 2400, dist: 10000 } }} fcMax={190} />
      <div className="clabel" style={{ margin: '8px 0 10px' }}>CATALOGUE — TU CHOISIS</div>
      <SessionBrowser vdot={VDOT} ctx={{ phase: 'build', daysSinceHard: 1, recentCategories: ['tempo'] }} />
    </div>
  )
}
