import { useState } from 'react'
import SessionCatalog from './SessionCatalog'
import SessionProfile from './SessionProfile'
import type { CatalogEntry } from '../lib/sessionCatalog'
import type { RecommendContext } from '../lib/sessionRecommender'

/**
 * Parcours de séances (choix-first) : catalogue ↔ détail. L'athlète choisit une
 * carte → voit le profil détaillé, puis revient au catalogue. État local, réutilisable
 * (aperçu public ET page authentifiée).
 */
export default function SessionBrowser({ vdot, ctx }: { vdot: number; ctx: RecommendContext }) {
  const [selected, setSelected] = useState<CatalogEntry | null>(null)

  if (selected) {
    return (
      <div>
        <button
          className="hbtn"
          onClick={() => setSelected(null)}
          style={{ marginBottom: 12 }}
        >
          ← Retour au catalogue
        </button>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, color: 'var(--vl-text)', margin: '0 0 10px' }}>
          {selected.label}
        </div>
        <SessionProfile workout={selected.workout} />
      </div>
    )
  }

  return <SessionCatalog vdot={vdot} ctx={ctx} onSelect={setSelected} />
}
