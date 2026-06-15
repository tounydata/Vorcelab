import { useCoachPlan } from '../../lib/coach/useCoachPlan'

// « Ton moteur » : ce que l'algo lit du coureur (VDOT, VMA/seuil, CTL, fraîcheur,
// durabilité, côtes). Déplacé de la page Coach vers Profil › LABO — c'est de la
// donnée d'analyse, pas une action de la semaine. Autonome : il relit le plan
// partagé (useCoachPlan, dédupliqué par TanStack Query).

const LEVEL_LABELS: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Confirmé' }

function fmtPaceMMSS(secPerKm: number): string {
  const s = Math.max(0, Math.round(secPerKm))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const ANCHOR_SOURCE_LABEL: Record<string, string> = { test: 'test', history: 'historique', vdot: 'VDOT' }

export default function CoachEngine() {
  const { profile, vdot, level, weaknesses, fitnessAnchor, pmcToday, currentCTL } = useCoachPlan()

  const rp = profile?.runner_profile ?? null
  const driftVal = rp?.hrDriftPct
  const durability = driftVal != null
    ? {
        v: `${driftVal > 0 ? '+' : ''}${driftVal.toFixed(0)}%`,
        sub: rp!.hrDriftStatus === 'marked' ? 'Faiblit en fin' : rp!.hrDriftStatus === 'moderate' ? 'Correcte' : 'Solide',
        color: rp!.hrDriftStatus === 'marked' ? 'var(--vl-status-watch)' : 'var(--vl-status-prod)',
      }
    : { v: '—', sub: 'Données à venir', color: 'var(--vl-text-3)' }
  const climbWeak = weaknesses.includes('climbing')
  const climb = rp
    ? { v: climbWeak ? 'À renforcer' : 'OK', sub: climbWeak ? 'Point faible' : 'Point fort', color: climbWeak ? 'var(--vl-status-watch)' : 'var(--vl-status-prod)' }
    : { v: '—', sub: 'Données à venir', color: 'var(--vl-text-3)' }

  const engine: { cl: string; v: string; sub: string; color: string }[] = [
    { cl: 'Niveau · VDOT', v: String(Math.round(vdot)), sub: LEVEL_LABELS[level] ?? level, color: 'var(--vl-text)' },
    ...(fitnessAnchor ? [{
      cl: 'VMA · seuil',
      v: `${(fitnessAnchor.vmaMetersPerSec * 3.6).toFixed(1)}`,
      sub: `km/h · CS ${fmtPaceMMSS(fitnessAnchor.csPaceSecPerKm)}/km · via ${ANCHOR_SOURCE_LABEL[fitnessAnchor.source]}`,
      color: 'var(--vl-growth)',
    }] : []),
    { cl: 'Fond · CTL', v: currentCTL != null ? String(currentCTL) : '—', sub: 'Charge chronique', color: 'var(--vl-ember)' },
    { cl: 'Fraîcheur · TSB', v: pmcToday ? (pmcToday.tsb > 0 ? `+${pmcToday.tsb}` : String(pmcToday.tsb)) : '—', sub: pmcToday ? (pmcToday.tsb > 5 ? 'Frais' : pmcToday.tsb < -10 ? 'Chargé' : 'Stable') : '—', color: 'var(--vl-status-peak)' },
    { cl: 'Durabilité', v: durability.v, sub: durability.sub, color: durability.color },
    { cl: 'Côtes · VAM', v: climb.v, sub: climb.sub, color: climb.color },
  ]

  return (
    <>
      <div className="coach-block-h">
        <span className="coach-block-ttl">Ton moteur</span>
        <span className="coach-block-sub">Ce que l'algo lit de toi</span>
      </div>
      <div className="coach-engine">
        {engine.map((c) => (
          <div key={c.cl} className="coach-cell">
            <div className="coach-cell-cl">{c.cl}</div>
            <div className="coach-cell-v" style={{ color: c.color }}>{c.v}</div>
            <div className="coach-cell-sub">{c.sub}</div>
          </div>
        ))}
      </div>
    </>
  )
}
