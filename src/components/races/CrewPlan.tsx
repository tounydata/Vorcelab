import { useState } from 'react'
import type { ProjectionResult } from '../../lib/computeRaceProjection'
import type { NutritionRow } from '../../lib/nutritionPlan'
import type { RavitoPoint, UnclassifiedWaypoint, CrewCheckpoint } from '../../lib/crewPlan'
import { generateCrewPlan } from '../../lib/crewPlan'

interface Props {
  projection: ProjectionResult
  nutritionRows: NutritionRow[]
  ravitos: RavitoPoint[]
  unclassifiedWaypoints: UnclassifiedWaypoint[]
  onAddRavito: (r: RavitoPoint) => void
  onRemoveRavito: (km: number) => void
  onPromoteWaypoint: (w: UnclassifiedWaypoint) => void
  athleteName: string
  /** Heure de départ 'HH:MM' → affiche l'heure d'arrivée (horloge) au lieu du temps écoulé. */
  startTime?: string | null
}

export default function CrewPlan({
  projection,
  nutritionRows,
  ravitos,
  unclassifiedWaypoints,
  onAddRavito,
  onRemoveRavito,
  onPromoteWaypoint,
  athleteName,
  startTime,
}: Props) {
  const [newKm, setNewKm] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const totalKm = projection.totalDistM / 1000

  const checkpoints: CrewCheckpoint[] = generateCrewPlan(projection, nutritionRows, ravitos, startTime)
  const hasClock = checkpoints.some((c) => c.clockCible)

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
      {/* ── Ravito management ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="clabel" style={{ marginBottom: '0.5rem' }}>RAVITAILLEMENTS</div>

        {ravitos.length === 0 && unclassifiedWaypoints.length === 0 && (
          <div className="mlabel" style={{ marginBottom: '0.75rem', color: 'var(--vl-text-2)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>
            Renseignez les emplacements des ravitaillements (km de course) pour personnaliser votre plan assistance.
          </div>
        )}

        {/* Ravitos connus */}
        {ravitos.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            {ravitos.map((r) => (
              <div key={r.km} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--vl-line)' }}>
                <span className="mlabel">
                  {r.source === 'gpx' && <span style={{ color: 'var(--vl-growth)', marginRight: 6, fontSize: 10, fontFamily: 'var(--vl-mono)' }}>GPX</span>}
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

        {/* Waypoints non classés (depuis GPX, non identifiés comme ravitos) */}
        {unclassifiedWaypoints.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div className="mlabel" style={{ color: 'var(--vl-text-3)', marginBottom: 6, fontSize: 11 }}>
              WAYPOINTS NON CLASSÉS
            </div>
            {unclassifiedWaypoints.map((w) => (
              <div key={w.km} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--vl-line)', opacity: 0.8 }}>
                <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>
                  <span style={{ marginRight: 6, fontSize: 10, fontFamily: 'var(--vl-mono)', color: 'var(--vl-text-3)' }}>?</span>
                  {w.label}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)' }}>{w.km.toFixed(1)} km</span>
                  <button
                    className="hbtn no-print"
                    style={{ padding: '2px 8px', fontSize: 10, color: 'var(--vl-growth)', borderColor: 'var(--vl-growth)' }}
                    onClick={() => onPromoteWaypoint(w)}
                  >
                    + Ravito
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Ajout manuel */}
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

      {/* ── Tableau plan assistance ────────────────────────────────────────── */}
      {checkpoints.length > 0 ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="clabel" style={{ marginBottom: hasClock ? '0.4rem' : '0.75rem' }}>
            PLAN ASSISTANCE — {athleteName.toUpperCase()}
          </div>
          {hasClock && (
            <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              Heure d'arrivée estimée au ravito — <strong>fourchette agressif → prudent</strong> (l'assistance n'est pas toujours au milieu). Temps écoulé indiqué en dessous.
            </div>
          )}

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
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid var(--vl-line)',
                      background: cp.kind === 'ravito' ? 'var(--vl-surf-2)' : 'transparent',
                    }}
                  >
                    <td className="mono" style={{ padding: '8px 8px', fontWeight: cp.kind === 'ravito' ? 700 : 400 }}>
                      {cp.km.toFixed(1)}
                    </td>
                    <td style={{ padding: '8px 8px' }}>
                      {cp.kind === 'ravito' ? (
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span className="mlabel" style={{ color: 'var(--vl-growth)' }}>{cp.label}</span>
                          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-growth)', letterSpacing: '0.08em' }}>RAVITO</span>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span className="mlabel" style={{ color: 'var(--vl-text-2)' }}>{cp.label}</span>
                          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '0.08em' }}>CHECKPOINT ESTIMÉ</span>
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--vl-growth)' }}>
                      {cp.clockAgressif ?? cp.timeAgressif}
                      {cp.clockAgressif && <div style={{ fontSize: 9, color: 'var(--vl-text-3)' }}>{cp.timeAgressif}</div>}
                    </td>
                    <td className="mono" style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 700 }}>
                      {cp.clockCible ?? cp.timeCible}
                      {cp.clockCible && <div style={{ fontSize: 9, color: 'var(--vl-text-3)', fontWeight: 400 }}>{cp.timeCible}</div>}
                    </td>
                    <td className="mono" style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--vl-text-2)' }}>
                      {cp.clockPrudent ?? cp.timePrudent}
                      {cp.clockPrudent && <div style={{ fontSize: 9, color: 'var(--vl-text-3)' }}>{cp.timePrudent}</div>}
                    </td>
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
