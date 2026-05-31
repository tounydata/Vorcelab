import { buildCatalog, type CatalogEntry } from '../lib/sessionCatalog'
import { recommendSessions, BADGE_LABEL, type BadgeKind, type RecommendContext } from '../lib/sessionRecommender'

// Style des badges (DA Vorcelab : mono, sobre, accents ember/growth/amber).
const BADGE_COLOR: Record<Exclude<BadgeKind, null>, string> = {
  recommended: 'var(--vl-ember)',
  recovery: 'var(--vl-growth)',
  caution: 'var(--vl-amber)',
  repeat: 'var(--vl-text-3)',
}

function DifficultyDots({ level }: { level: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }} aria-label={`Difficulté ${level} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          style={{ width: 6, height: 6, borderRadius: 1, background: n <= level ? 'var(--vl-ember)' : 'var(--vl-line)' }}
        />
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

function SessionCard({ entry, badge }: { entry: CatalogEntry; badge: BadgeKind }) {
  return (
    <button
      className="card"
      style={{
        display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.75rem',
        cursor: 'pointer', border: badge === 'recommended' ? '1px solid var(--vl-ember)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--vl-display)', fontSize: 19, color: 'var(--vl-text)', letterSpacing: '.01em' }}>
          {entry.label}
        </span>
        {badge ? <Badge kind={badge} /> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-2)' }}>{entry.workout.totalMin} min</span>
        <DifficultyDots level={entry.difficulty} />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--vl-text-3)', lineHeight: 1.4 }}>{entry.workout.intent}</p>
    </button>
  )
}

/**
 * Catalogue de séances (choix-first) : l'athlète parcourt et choisit librement.
 * Les badges (issus de recommendSessions) ne sont qu'une indication douce.
 */
export default function SessionCatalog({ vdot, ctx }: { vdot: number; ctx: RecommendContext }) {
  const entries = buildCatalog(vdot)
  const recs = recommendSessions(entries.map((e) => e.category), ctx)
  const badgeByCat = new Map(recs.map((r) => [r.category, r.badge]))

  return (
    <div>
      {entries.map((e) => (
        <SessionCard key={e.category} entry={e} badge={badgeByCat.get(e.category) ?? null} />
      ))}
    </div>
  )
}
