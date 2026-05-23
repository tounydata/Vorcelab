import { useEffect } from 'react'
import { fmtD } from '../../utils/formatters'
import type { CrewPlan } from '../../utils/crewPlan'

export function CrewPlanComponent({ plan }: { plan: CrewPlan }) {
  // Inject print isolation styles once
  useEffect(() => {
    const id = 'vl-crew-print-style'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @media print {
        body.vl-printing-crew { visibility: hidden; background: #fff; }
        body.vl-printing-crew #vl-crew-plan-wrapper,
        body.vl-printing-crew #vl-crew-plan-wrapper * { visibility: visible; color: #000 !important; }
        body.vl-printing-crew #vl-crew-plan-wrapper {
          position: absolute; left: 0; top: 0; width: 100%; padding: 16px;
          font-family: 'JetBrains Mono', monospace; font-size: 11px;
        }
        body.vl-printing-crew #vl-crew-plan-wrapper table {
          border-collapse: collapse; width: 100%;
        }
        body.vl-printing-crew #vl-crew-plan-wrapper td,
        body.vl-printing-crew #vl-crew-plan-wrapper th {
          border: 1px solid #aaa; padding: 4px 6px; text-align: left; vertical-align: top;
        }
        @page { margin: 1.5cm; }
      }
    `
    document.head.appendChild(style)
    return () => { document.getElementById(id)?.remove() }
  }, [])

  function handlePrint() {
    document.body.classList.add('vl-printing-crew')
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('vl-printing-crew')
    }, { once: true })
    window.print()
  }

  const dateStr = plan.raceDate
    ? new Date(plan.raceDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  const startLabel = `${plan.raceStartHour}h00`

  return (
    <div id="vl-crew-plan-wrapper">
      {/* Header row (print button hidden in print) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }} className="vl-no-print-internal">
        <div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 4 }}>PLAN ASSISTANCE — POINTS DE PASSAGE ESTIMÉS</div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>{plan.raceName}</div>
          {dateStr && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginTop: 2 }}>{dateStr} · départ {startLabel}</div>}
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginTop: 2 }}>
            Athlète : <strong style={{ color: 'var(--vl-text-2)' }}>{plan.athleteName}</strong>
            &nbsp;·&nbsp; Cible {fmtD(plan.estTimeS)} ({fmtD(plan.timeMinS)} – {fmtD(plan.timeMaxS)})
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-amber)', marginTop: 4 }}>
            Points de passage estimés algorithmiquement — non officiels.
          </div>
        </div>
        <button
          onClick={handlePrint}
          style={{ flexShrink: 0, fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', background: 'none', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', marginTop: 4 }}
        >
          Imprimer ↗
        </button>
      </div>

      {plan.checkpoints.length === 0 ? (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', textAlign: 'center', padding: '20px 0' }}>
          Pas assez de sections pour générer un plan assistance.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--vl-mono)', fontSize: '.55rem' }}>
            <thead>
              <tr>
                {['Point', 'Agressif', 'Cible', 'Prudent', 'À donner', 'Déjà pris', 'Vigilance / Rappel'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--vl-text-3)', fontWeight: 700, letterSpacing: '.07em', borderBottom: '1px solid var(--vl-line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.checkpoints.map((cp, i) => (
                <tr key={i} style={{ background: cp.isHighlight ? 'rgba(229,86,42,.06)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                  <td style={{ padding: '7px 8px', color: 'var(--vl-text-2)', whiteSpace: 'nowrap', fontWeight: 700 }}>
                    {cp.label}
                  </td>
                  <td style={{ padding: '7px 8px', color: 'var(--vl-growth)', whiteSpace: 'nowrap' }}>{cp.timeAggH}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--vl-text-1)', whiteSpace: 'nowrap', fontWeight: 700 }}>{cp.timeCibleH}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--vl-text-3)', whiteSpace: 'nowrap' }}>{cp.timePrudentH}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--vl-ember)', lineHeight: 1.5 }}>{cp.nutrDonner}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--vl-text-3)', lineHeight: 1.5 }}>{cp.alreadyTaken}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--vl-text-2)', lineHeight: 1.5 }}>
                    <span style={{ display: 'block', color: cp.isHighlight ? 'var(--vl-amber)' : 'var(--vl-text-3)', fontSize: '.5rem' }}>{cp.vigilance}</span>
                    {cp.rappel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
