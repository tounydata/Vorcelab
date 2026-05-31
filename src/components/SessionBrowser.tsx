import { useState } from 'react'
import SessionCatalog from './SessionCatalog'
import SessionProfile from './SessionProfile'
import SessionFeedback from './SessionFeedback'
import type { CatalogEntry } from '../lib/coach/catalog'
import type { RecommendContext } from '../lib/sessionRecommender'

/**
 * Parcours de séances (choix-first) : catalogue ↔ détail ↔ feedback. L'athlète
 * choisit une carte → voit le profil → peut valider et donner un ressenti.
 * État local, réutilisable (aperçu public ET page authentifiée).
 */
export default function SessionBrowser({ vdot, ctx, trail }: { vdot: number; ctx: RecommendContext; trail?: boolean }) {
  const [selected, setSelected] = useState<CatalogEntry | null>(null)
  const [validated, setValidated] = useState(false)

  function select(e: CatalogEntry | null) {
    setSelected(e)
    setValidated(false)
  }

  if (selected) {
    return (
      <div>
        <button className="hbtn" onClick={() => select(null)} style={{ marginBottom: 12 }}>
          ← Retour au catalogue
        </button>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, color: 'var(--vl-text)', margin: '0 0 4px' }}>
          {selected.template.name}
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.4 }}>{selected.template.description}</p>
        <SessionProfile workout={selected.workout} />
        {validated ? (
          <SessionFeedback />
        ) : (
          <button className="hbtn" onClick={() => setValidated(true)} style={{ marginTop: 12 }}>
            Valider ma séance
          </button>
        )}
      </div>
    )
  }

  return <SessionCatalog vdot={vdot} ctx={ctx} trail={trail} onSelect={select} />
}
