import { buildWorkoutCatalog, type CatalogEntry } from '../lib/coach/catalog'
import { recommendWorkouts, BADGE_LABEL, type BadgeKind, type RecommendContext } from '../lib/sessionRecommender'
import type { Intensity } from '../lib/coach/workouts'

// Style des badges (DA Vorcelab : mono, sobre, accents ember/growth/amber).
const BADGE_COLOR: Record<Exclude<BadgeKind, null>, string> = {
  recommended: 'var(--vl-ember)',
  recovery: 'var(--vl-growth)',
  caution: 'var(--vl-amber)',
  repeat: 'var(--vl-text-3)',
}

const INTENSITY_DOTS: Record<Intensity, number> = { easy: 1, moderate: 3, hard: 4 }

function DifficultyDots({ level }: { level: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }} aria-label={`Difficulté ${level} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ width: 6, height: 6, borderRadius: 1, background: n <= level ? 'var(--vl-ember)' : 'var(--vl-line)' }} />
      ))}
    </span>
  )
}

function Badge({ kind }: { kind: Exclude<BadgeKind, null> }) {
  return (
    <span
      style={{
        fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em',
        color: BADGE_COLOR[kind], border: `1px solid ${BADGE_COLOR[kind]}`,
        borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}
    >
      {BADGE_LABEL[kind]}
    </span>
  )
}

function SessionCard({ entry, badge, onSelect }: { entry: CatalogEntry; badge: BadgeKind; onSelect?: (e: CatalogEntry) => void }) {
  return (
    <button
      className="card"
      onClick={() => onSelect?.(entry)}
      style={{
        display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.75rem',
        cursor: 'pointer', border: badge === 'recommended' ? '1px solid var(--vl-ember)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--vl-display)', fontSize: 19, color: 'var(--vl-text)', letterSpacing: '.01em' }}>
          {entry.template.name}
        </span>
        {badge ? <Badge kind={badge} /> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-2)' }}>{entry.workout.totalMin} min</span>
        <DifficultyDots level={INTENSITY_DOTS[entry.template.intensity]} />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--vl-text-3)', lineHeight: 1.4 }}>{entry.template.description}</p>
    </button>
  )
}

/**
 * Catalogue de séances (choix-first) : l'athlète parcourt et choisit librement.
 * Les badges (issus de recommendWorkouts) ne sont qu'une indication douce.
 */
export default function SessionCatalog({ vdot, ctx, trail, onSelect }: {
  vdot: number
  ctx: RecommendContext
  trail?: boolean
  onSelect?: (e: CatalogEntry) => void
}) {
  const entries = buildWorkoutCatalog(vdot, { trail })
  const recs = recommendWorkouts(entries.map((e) => e.template), ctx)
  const badgeById = new Map(recs.map((r) => [r.workoutId, r.badge]))

  return (
    <div>
      {entries.map((e) => (
        <SessionCard key={e.template.id} entry={e} badge={badgeById.get(e.template.id) ?? null} onSelect={onSelect} />
      ))}
    </div>
  )
}
