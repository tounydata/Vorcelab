import { useState } from 'react'
import { vmaFromHalfCooperM, CS_TO_VMA } from '../../lib/criticalSpeed'

// Calibrage VMA (test demi-Cooper) en POP-UP. Proposé tant que l'athlète n'a NI
// fait le test NI cliqué « plus tard ». La décision est persistée CÔTÉ SERVEUR
// (profiles.demi_cooper) — surtout PAS en localStorage — sinon en navigation privée
// le pop-up réapparaît à chaque visite. Toujours refaisable dans Profil › LABO.

export default function CalibrationPopup({ show, saving, onSave, onSkip }: {
  /** Afficher ? (parent : vrai tant que demi_cooper non renseigné, ni test ni report). */
  show: boolean
  saving: boolean
  onSave: (m: number) => void
  /** Reporter — persiste le choix côté serveur pour ne plus re-proposer. */
  onSkip: () => void
}) {
  const [closed, setClosed] = useState(false)
  const [dist, setDist] = useState('')
  if (!show || closed) return null

  const m = parseInt(dist, 10)
  const valid = Number.isFinite(m) && m >= 800 && m <= 3000
  const vmaKmh = valid ? +(vmaFromHalfCooperM(m) * 3.6).toFixed(1) : null
  const csKmh = vmaKmh != null ? +(vmaKmh * CS_TO_VMA).toFixed(1) : null

  function skip() { setClosed(true); onSkip() }
  function save() { if (valid) { onSave(m); setClosed(true) } }

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Calibrons ton plan"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={skip}
    >
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: '18px 20px', borderLeft: '4px solid var(--vl-status-peak)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--vl-display)', fontWeight: 700, fontSize: '1.15rem', marginBottom: 6 }}>Calibrons ton plan</div>
        <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.55, marginBottom: 12 }}>
          On démarre ta prépa. Pour caler toutes tes allures, fais un <strong>test VMA (demi-Cooper)</strong> :
          6 min à fond après échauffement, puis entre la distance couverte. 5 min qui rendent ton plan plus juste.
          Sinon, on se base sur ton <strong>historique récent</strong>.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="number" inputMode="numeric" value={dist} onChange={(e) => setDist(e.target.value)}
            placeholder="Distance en 6 min (m)"
            style={{ width: 170, padding: '7px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontFamily: 'var(--vl-mono)', fontSize: 13 }}
          />
          <button className="hbtn" disabled={!valid || saving} onClick={save}
            style={{ background: valid ? 'var(--vl-ember)' : 'var(--vl-surf-2)', color: valid ? 'var(--vl-ink)' : 'var(--vl-text-3)', border: 'none', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer le test'}
          </button>
        </div>
        {csKmh != null && (
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--vl-text-3)', marginTop: 8 }}>
            ≈ VMA {vmaKmh} km/h · CS (allure ~60 min) {csKmh} km/h
          </div>
        )}
        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <button className="hbtn" onClick={skip} style={{ fontSize: '.82rem' }}>Plus tard · utiliser mon historique</button>
        </div>
      </div>
    </div>
  )
}
