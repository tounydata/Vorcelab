import { useState } from 'react'
import { assessPain } from '../lib/safetyGuards'

// Feedback post-séance NON ANXIOGÈNE : étage 1 = ressenti en 1 tap ; étage 2
// (optionnel) = raisons fixes ; la douleur n'apparaît QUE si l'athlète la signale
// (opt-in). Aucune relance, aucune question de douleur imposée.

const FEELINGS = [
  { key: 'good', emoji: '😀', label: 'Bien' },
  { key: 'ok', emoji: '😐', label: 'Bof' },
  { key: 'bad', emoji: '😟', label: 'Dur' },
] as const

const REASONS = ['Allures trop dures', 'Trop long', 'Pas en forme', 'Douleur'] as const

export default function SessionFeedback() {
  const [feeling, setFeeling] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [painLevel, setPainLevel] = useState<number | null>(null)

  const painAssessment = reason === 'Douleur' && painLevel !== null ? assessPain({ level: painLevel }) : null

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="clabel" style={{ margin: '0 0 8px' }}>Comment c'était ?</div>

      <div style={{ display: 'flex', gap: 8 }}>
        {FEELINGS.map((f) => (
          <button
            key={f.key}
            className="hbtn"
            onClick={() => {
              setFeeling(f.key)
              if (f.key === 'good') { setReason(null); setPainLevel(null) }
            }}
            style={{ flex: 1, borderColor: feeling === f.key ? 'var(--vl-ember)' : undefined }}
          >
            <span style={{ fontSize: 16, marginRight: 4 }}>{f.emoji}</span>{f.label}
          </button>
        ))}
      </div>

      {feeling === 'good' ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--vl-growth)' }}>Noté, belle séance 💪</div>
      ) : null}

      {feeling && feeling !== 'good' ? (
        <div style={{ marginTop: 10 }}>
          <div className="mlabel" style={{ marginBottom: 6 }}>Qu'est-ce qui a coincé ? (optionnel)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {REASONS.map((r) => (
              <button
                key={r}
                className="hbtn"
                onClick={() => { setReason(r); if (r !== 'Douleur') setPainLevel(null) }}
                style={{ borderColor: reason === r ? 'var(--vl-ember)' : undefined }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {reason === 'Douleur' ? (
        <div style={{ marginTop: 10 }}>
          <div className="mlabel" style={{ marginBottom: 6 }}>Niveau de douleur : {painLevel ?? 0}/10</div>
          <input
            type="range" min={0} max={10} value={painLevel ?? 0}
            onChange={(e) => setPainLevel(Number(e.target.value))}
            style={{ width: '100%' }}
            aria-label="Niveau de douleur 0 à 10"
          />
          {painAssessment ? (
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4, color: painAssessment.refer ? 'var(--vl-ember)' : 'var(--vl-text-2)' }}>
              {painAssessment.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
