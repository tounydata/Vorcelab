import { useState } from 'react'
import type { RacePromptResult } from '../../lib/racePrompt'

/**
 * Pop-up « Comment s'est passée ta course ? » — proposé le jour J (ou à la première
 * connexion suivante) pour une course récente non encore liée. Bouton de liaison :
 * lie l'activité auto-détectée (marquée « course » automatiquement) puis ouvre le
 * débrief, ou renvoie vers la page course pour choisir manuellement.
 */
export default function PostRaceModal({
  prompt, onLink, onOpenRace, onDismiss,
}: {
  prompt: RacePromptResult
  /** Lie l'activité suggérée puis ouvre le débrief. */
  onLink: (activityId: string) => Promise<void> | void
  /** Ouvre la page course (choix manuel de l'activité). */
  onOpenRace: () => void
  /** Écarte le pop-up (mémorisé, ne réapparaît pas pour cette course). */
  onDismiss: () => void
}) {
  const [busy, setBusy] = useState(false)
  const { race, suggestion } = prompt
  const km = race.distance != null ? `${race.distance} km` : ''
  const sugKm = suggestion?.distance != null ? (suggestion.distance / 1000).toFixed(1) : null

  const handleLink = async () => {
    if (!suggestion?.id) { onOpenRace(); return }
    setBusy(true)
    try { await onLink(suggestion.id) } finally { setBusy(false) }
  }

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 420, padding: '22px 22px 18px', borderRadius: 'var(--vl-r)', border: '1px solid var(--vl-line)' }}
      >
        <div style={{ fontSize: 26, marginBottom: 6 }}>🏁</div>
        <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 6 }}>Comment s'est passée ta course ?</div>
        <div style={{ fontSize: '.92rem', color: 'var(--vl-text-2)', lineHeight: 1.45, marginBottom: 16 }}>
          <strong style={{ color: 'var(--vl-text)' }}>{race.name || 'Ta course'}</strong>{km ? ` · ${km}` : ''}. Lie ton activité Strava pour ton débrief complet — allure prévue vs réelle, cardiaque, terrain, enseignements.
        </div>

        {suggestion && (
          <div style={{ background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginBottom: 2 }}>ON A TROUVÉ CETTE ACTIVITÉ</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggestion.name || 'Sortie'}</span>
              {sugKm && <span className="mono" style={{ fontSize: 12, color: 'var(--vl-text-2)' }}>{sugKm} km</span>}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="hbtn" onClick={handleLink} disabled={busy}
            style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none', fontWeight: 600, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Liaison…' : suggestion ? 'Oui — lier et voir mon débrief' : 'Lier mon activité'}
          </button>
          {suggestion && (
            <button className="hbtn" onClick={onOpenRace} disabled={busy} style={{ fontSize: '.85rem' }}>
              Choisir une autre activité
            </button>
          )}
          <button className="hbtn" onClick={onDismiss} disabled={busy} style={{ fontSize: '.82rem', color: 'var(--vl-text-2)', border: 'none', background: 'transparent' }}>
            Plus tard
          </button>
        </div>
      </div>
    </div>
  )
}
