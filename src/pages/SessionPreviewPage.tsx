import PaceZonesCard from '../components/PaceZonesCard'
import WeekProgram, { type ProgramWeek } from '../components/WeekProgram'
import type { ActivityForLoad } from '../lib/trainingLoad'

// Aperçu public (route additive, sans auth) : démonstration de la VUE HEBDOMADAIRE
// choix-first (une semaine à la fois, navigation ← →). Données d'exemple, pas une
// librairie à parcourir.
const VDOT = 50

const SAMPLE_WEEKS: ProgramWeek[] = [
  { weekIndex: 0, phase: 'build', isRecovery: false, focus: 'Développement du seuil.', sessions: [{ workoutId: 'endurance_easy' }, { workoutId: 'threshold_intervals' }, { workoutId: 'long_run_flat' }] },
  { weekIndex: 1, phase: 'build', isRecovery: false, focus: 'On monte le volume.', sessions: [{ workoutId: 'endurance_easy' }, { workoutId: 'vo2_intervals' }, { workoutId: 'tempo_run' }] },
  { weekIndex: 2, phase: 'specific', isRecovery: true, focus: 'Semaine de décharge.', sessions: [{ workoutId: 'recovery_jog' }, { workoutId: 'endurance_easy' }] },
]

// Une sortie dure récente → la reco met en avant le facile (badge), démo du contexte.
const SAMPLE_ACTIVITIES: ActivityForLoad[] = [
  {
    start_date: new Date(Date.now() - 86_400_000).toISOString(),
    average_heartrate: 175, moving_time: 3000, distance: 10000,
    type: 'Run', sport_type: 'Run', total_elevation_gain: 60,
  },
]

export default function SessionPreviewPage() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h1 style={{ fontFamily: 'var(--vl-display)', fontSize: 28, margin: '0 0 4px' }}>Aperçu hebdomadaire</h1>
      <p style={{ fontSize: 13, color: 'var(--vl-text-3)', margin: '0 0 20px' }}>
        Démonstration choix-first (VDOT {VDOT}) — ta semaine, séance par séance.
      </p>
      <PaceZonesCard prs={{ '10k': { timeS: 2400, dist: 10000 } }} fcMax={190} />
      <WeekProgram weeks={SAMPLE_WEEKS} vdot={VDOT} activities={SAMPLE_ACTIVITIES} fcMax={190} />
    </div>
  )
}
