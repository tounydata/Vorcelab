import { useState } from 'react'
import type { ProjectionResult } from '../../lib/computeRaceProjection'
import type { NutritionRow } from '../../lib/nutritionPlan'
import type { RavitoPoint, CrewCheckpoint } from '../../lib/crewPlan'
import { generateCrewPlan } from '../../lib/crewPlan'

interface Props {
  projection: ProjectionResult
  nutritionRows: NutritionRow[]
  ravitos: RavitoPoint[]
  onAddRavito: (r: RavitoPoint) => void
  onRemoveRavito: (km: number) => void
  athleteName: string
}

export default function CrewPlan({ projection, nutritionRows, ravitos, onAddRavito, onRemoveRavito, athleteName }: Props) {
  const [newKm, setNewKm] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const totalKm = projection.totalDistM / 1000

  const checkpoints: CrewCheckpoint[] = generateCrewPlan(projection, nutritionRows, ravitos)

  function handleAddRavito() {
    const km = parseFloat(newKm)
    if (isNaN(km) || km <= 0 || km >= totalKm) return
    onAddRavito({ km, label: newLabel || `Ravito ${km} km`, source: 'manual' })
    setNewKm('')
    setNewLabel('')
  }

  function printAssistance() {
    document.body.classList.add('print-mode-assistance')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('print-mode-assistance')
    }, 80)
  }

  return (
    <div>
      {/* Ravito management */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="clabel" style={{ marginBottom: '0.5rem' }}>RAVITAILLEMENTS</div>

        {ravitos.length === 0 && (
          <div className="mlabel" style={{ marginBottom: '0.75rem', color: 'var(--vl-text-2)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>
            Renseignez les emplacements des ravitaillements (km de course) pour personnaliser votre plan assistance.
          </div>
        )}

        {ravitos.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            {ravitos.map((r) => (
              <div key={r.km} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--vl-line)' }}>
                <span className="mlabel">
                  {r.source === 'gpx' && <span style={{ color: 'var(--vl-growth)', marginRight: 6, fontSize: 10 }}>GPX</span>}
                  {r.label}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 11 }}>{r.km.toFixed(1)} km</span>
                  <button className="hbtn no-print" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => onRemoveRavito(r.km)}>✕</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div className="mlabel" style={{ fontSize: 10, marginBottom: 3 }}>KM (0–{totalKm.toFixed(0)})</div>
            <input
              type="number"
              min={0}
              max={totalKm}
              step={0.5}
              value={newKm}
              onChange={e => setNewKm(e.target.value)}
              placeholder="ex: 15"
              style={{ width: 80, background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '6px 10px', color: 'var(--vl-text)', fontFamily: 'var(--vl-mono)', fontSize: 13 }}
            />
          </div>
          <div>
            <div className="mlabel" style={{ fontSize: 10, marginBottom: 3 }}>NOM (optionnel)</div>
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="ex: Col du Galibier"
              style={{ width: 160, background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '6px 10px', color: 'var(--vl-text)', fontSize: 13 }}
            />
          </div>
          <button className="hbtn" onClick={handleAddRavito}>+ Ajouter</button>
        </div>
      </div>

      {/* Crew plan table */}
      {checkpoints.length > 0 ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="clabel" style={{ marginBottom: '0.75rem' }}>
            PLAN ASSISTANCE — {athleteName.toUpperCase()}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--vl-line)' }}>
                  <th className="mlabel" style={{ textAlign: 'left', padding: '4px 8px' }}>Km</th>
                  <th className="mlabel" style={{ textAlign: 'left', padding: '4px 8px' }}>Point</th>
                  <th className="mlabel" style={{ textAlign: 'center', padding: '4px 8px' }}>Agressif</th>
                  <th className="mlabel" style={{ textAlign: 'center', padding: '4px 8px' }}>Cible</th>
                  <th className="mlabel" style={{ textAlign: 'center', padding: '4px 8px' }}>Prudent</th>
                  <th className="mlabel" style={{ textAlign: 'left', padding: '4px 8px' }}>À donner</th>
                  <th className="mlabel" style={{ textAlign: 'left', padding: '4px 8px' }}>Vigilance</th>
                </tr>
              </thead>
              <tbody>
                {checkpoints.map((cp, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--vl-line)', background: cp.isRavito ? 'var(--vl-surf-2)' : 'transparent' }}>
                    <td className="mono" style={{ padding: '8px 8px', fontWeight: cp.isRavito ? 700 : 400 }}>{cp.km.toFixed(1)}</td>
                    <td className="mlabel" style={{ padding: '8px 8px', color: cp.isRavito ? 'var(--vl-growth)' : 'var(--vl-text)' }}>{cp.label}</td>
                    <td className="mono" style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--vl-growth)' }}>{cp.timeAgressif}</td>
                    <td className="mono" style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 700 }}>{cp.timeCible}</td>
                    <td className="mono" style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--vl-text-2)' }}>{cp.timePrudent}</td>
                    <td className="mlabel" style={{ padding: '8px 8px', maxWidth: 140 }}>{cp.nutritionToGive}</td>
                    <td className="mlabel" style={{ padding: '8px 8px', color: cp.vigilance ? 'var(--vl-ember)' : 'var(--vl-text-3)', fontStyle: cp.vigilance ? 'normal' : 'italic' }}>
                      {cp.vigilance || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="no-print" style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button className="hbtn" onClick={printAssistance}>Imprimer plan assistance</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>
            Ajoutez au moins un ravito ou une course de plus de 15 km pour générer le plan assistance.
          </div>
        </div>
      )}
    </div>
  )
}
