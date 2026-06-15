import PaceZonesCard from '../components/PaceZonesCard'
import WeekProgram from '../components/WeekProgram'
import { getWorkout, type Phase } from '../lib/coach/workouts'
import type { PlanWeek, PlannedSession } from '../lib/coach/planGenerator'
import type { ActivityForLoad } from '../lib/trainingLoad'

// Aperçu public (route additive, sans auth) : démonstration de la VUE HEBDOMADAIRE
// choix-first (une semaine à la fois, navigation ← →). Données d'exemple, pas une
// librairie à parcourir.
const VDOT = 50

// Construit une séance planifiée d'exemple à partir d'un workout de la bibliothèque.
function sample(workoutId: string, dayOfWeek: number): PlannedSession {
  const t = getWorkout(workoutId)!
  return {
    dayOfWeek, workoutId, title: t.name, system: t.system, intensity: t.intensity,
    targetDurationMin: 45, climbing: t.climbing, description: t.description,
  }
}
function week(weekIndex: number, phase: Phase, isRecovery: boolean, focus: string, sessions: PlannedSession[]): PlanWeek {
  return { weekIndex, weekStartISO: '', phase, isRecovery, volumeHours: 0, focus, sessions }
}

const SAMPLE_WEEKS: PlanWeek[] = [
  week(0, 'build', false, 'Développement du seuil.', [sample('endurance_easy', 2), sample('threshold_intervals', 4), sample('long_run_flat', 7)]),
  week(1, 'build', false, 'On monte le volume.', [sample('endurance_easy', 2), sample('vo2_intervals', 4), sample('tempo_run', 6)]),
  week(2, 'specific', true, 'Semaine de décharge.', [sample('recovery_jog', 3), sample('endurance_easy', 5)]),
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
