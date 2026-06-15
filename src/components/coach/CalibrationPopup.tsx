import { useEffect, useState } from 'react'
import { vmaFromHalfCooperM, CS_TO_VMA } from '../../lib/criticalSpeed'

// Calibrage VMA (test demi-Cooper) proposé en POP-UP, une seule fois par objectif
// (course). En début de prépa : si l'athlète veut affiner ses allures, il fait le
// test ; sinon « plus tard » et on reste sur l'historique. Masqué si déjà calibré
// par test. La décision (faite ou reportée) est mémorisée par course.

function dismissKey(raceId: string) {
  return `vl-calib-popup-${raceId}`
}

export default function CalibrationPopup({ raceId, source, saving, onSave }: {
  raceId: string
  source?: string
  saving: boolean
  onSave: (m: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [dist, setDist] = useState('')

  // Une fois par course : on ouvre si pas déjà calibré par test et pas déjà vu.
  useEffect(() => {
    if (source === 'test') return
    if (localStorage.getItem(dismissKey(raceId))) return
    setOpen(true)
  }, [raceId, source])

  if (!open || source === 'test') return null

  const m = parseInt(dist, 10)
  const valid = Number.isFinite(m) && m >= 800 && m <= 3000
  const vmaKmh = valid ? +(vmaFromHalfCooperM(m) * 3.6).toFixed(1) : null
  const csKmh = vmaKmh != null ? +(vmaKmh * CS_TO_VMA).toFixed(1) : null

  function close() {
    localStorage.setItem(dismissKey(raceId), '1')
    setOpen(false)
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Calibrons ton plan"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={close}
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
          <button className="hbtn" disabled={!valid || saving} onClick={() => { if (valid) { onSave(m); close() } }}
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
          <button className="hbtn" onClick={close} style={{ fontSize: '.82rem' }}>Plus tard · utiliser mon historique</button>
        </div>
      </div>
    </div>
  )
}
