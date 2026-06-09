import { useState } from 'react'
import SessionCatalog from './SessionCatalog'
import SessionProfile from './SessionProfile'
import SessionFeedback, { type LinkActivity, type SessionLinkCtx } from './SessionFeedback'
import { ChevronLeft } from './coach/CoachIcons'
import type { CatalogEntry } from '../lib/coach/catalog'
import type { RecommendContext } from '../lib/sessionRecommender'
import type { ProgramSession } from './WeekProgram'
import type { SessionLogRow } from '../lib/coach/sessionLog'

const VERDICT_FR: Record<string, string> = {
  conforme: 'Conforme', trop_facile: 'Trop facile', trop_dur: 'Trop dur', a_surveiller: 'À surveiller',
}

/** Données nécessaires pour lier une séance validée à une activité (semaine courante). */
export interface SessionBrowserLink {
  vdot: number
  fcMax: number | null
  weekStartISO: string
  weekPhase?: string
  activities: LinkActivity[]
  sessions: readonly ProgramSession[]
}

function addDaysISO(weekStartISO: string, days: number): string {
  const d = new Date(weekStartISO + (weekStartISO.length <= 10 ? 'T00:00:00' : ''))
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Parcours de séances (choix-first) : catalogue ↔ détail ↔ feedback. L'athlète
 * choisit une carte → voit le profil → peut valider et donner un ressenti.
 * Si `link` est fourni (semaine courante), le feedback propose d'associer une
 * activité Strava (toujours confirmée) pour compiler un verdict.
 */
export default function SessionBrowser({ entries, ctx, link, doneByWorkoutId, onSaved }: {
  entries: CatalogEntry[]
  ctx: RecommendContext
  link?: SessionBrowserLink
  /** Séances déjà validées (depuis session_log), par workoutId → affichage « faite ». */
  doneByWorkoutId?: Map<string, SessionLogRow>
  onSaved?: () => void
}) {
  const [selected, setSelected] = useState<CatalogEntry | null>(null)
  const [validated, setValidated] = useState(false)
  const doneIds = doneByWorkoutId ? new Set(doneByWorkoutId.keys()) : undefined

  function select(e: CatalogEntry | null) {
    setSelected(e)
    // Une séance déjà validée s'ouvre directement sur son verdict.
    setValidated(!!(e && doneByWorkoutId?.has(e.template.id)))
  }

  /** Construit le contexte de liaison pour la séance sélectionnée. */
  function linkCtxFor(entry: CatalogEntry): SessionLinkCtx | undefined {
    if (!link) return undefined
    const planned = link.sessions.find((s) => s.workoutId === entry.template.id)
    const dow = planned?.dayOfWeek ?? 1
    return {
      template: { system: entry.template.system, climbing: entry.template.climbing },
      vdot: link.vdot,
      fcMax: link.fcMax,
      weekStartISO: link.weekStartISO,
      weekPhase: link.weekPhase,
      plannedDayOfWeek: dow,
      plannedDateISO: addDaysISO(link.weekStartISO, dow - 1),
      expectedDurationMin: planned?.targetDurationMin ?? null,
      workoutId: entry.template.id,
      activities: link.activities,
    }
  }

  if (selected) {
    return (
      <div>
        <button className="hbtn" onClick={() => select(null)} style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ChevronLeft size={15} /> Retour
        </button>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, color: 'var(--vl-text)', margin: '0 0 4px' }}>
          {selected.template.name}
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.4 }}>{selected.template.description}</p>
        <SessionProfile workout={selected.workout} />
        {doneByWorkoutId?.has(selected.template.id) && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 'var(--vl-r-sm)', border: '1px solid var(--vl-growth)', background: 'color-mix(in srgb, var(--vl-growth) 12%, transparent)', fontSize: 12.5, color: 'var(--vl-growth)' }}>
            ✓ Séance déjà validée — verdict : {VERDICT_FR[doneByWorkoutId.get(selected.template.id)!.verdict] ?? doneByWorkoutId.get(selected.template.id)!.verdict}
          </div>
        )}
        {validated ? (
          <SessionFeedback link={linkCtxFor(selected)} onSaved={onSaved} />
        ) : (
          <button className="hbtn" onClick={() => setValidated(true)} style={{ marginTop: 12 }}>
            Valider ma séance
          </button>
        )}
      </div>
    )
  }

  return <SessionCatalog entries={entries} ctx={ctx} onSelect={select} doneIds={doneIds} />
}
