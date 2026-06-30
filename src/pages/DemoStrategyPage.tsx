import { useMemo } from 'react'
import { Link } from 'react-router'
import { computeRaceProjection, type GpxPoint } from '../lib/computeRaceProjection'
import { computeNutritionPlan } from '../lib/nutritionPlan'
import { resolveNutritionProducts } from '../lib/nutritionProducts'
import StrategyView from '../components/races/strategy/StrategyView'
import type { RavitoPoint } from '../lib/crewPlan'

// Parcours synthétique réaliste : boucle 25 km / 1 200 m D+ dans les Alpes françaises.
// Les coordonnées GPS sont fictives mais l'algorithme de projection tourne sur de vraies
// données géométriques — l'expérience est identique à un vrai import GPX.
function generateDemoRoute(): GpxPoint[] {
  const N = 500
  const startLat = 45.885
  const startLon = 6.799

  return Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    const distKm = t * 25

    // Trajectoire : arc en boucle ouverte
    const angle = t * Math.PI * 1.65
    const r = 0.03 + Math.sin(t * Math.PI) * 0.026
    const lat = startLat + Math.sin(angle) * r * 0.72
    const lon = startLon + Math.cos(angle) * r

    // Profil altimétrique : montée progressive → replat crêtes → descente rythmée
    let ele: number
    if (distKm <= 9) {
      ele = 1020 + (distKm / 9) * 1180 + Math.sin(distKm * 3.8) * 38
    } else if (distKm <= 14.5) {
      ele = 2200 - ((distKm - 9) / 5.5) * 280 + Math.sin(distKm * 2.6) * 58
    } else {
      const p = (distKm - 14.5) / 10.5
      ele = 1920 - p * 880 + Math.sin(distKm * 2.9) * 44 - p * p * 180
    }

    return { lat, lon, ele: Math.max(950, Math.round(ele)) }
  })
}

const DEMO_RAVITOS: RavitoPoint[] = [
  { km: 8.4, label: 'Ravito Sommet', source: 'manual' },
  { km: 17.2, label: 'Ravito Descente', source: 'manual' },
]

const DEMO_RACE = {
  name: 'Trail des Crêtes · 25 km',
  date: '2026-09-12',
  type: 'Trail',
  goal_time: null as string | null,
  start_time: '06:00',
}

const DEMO_PROFILE = {
  vdot: 46,
  fc_max: 178,
  runner_type: 'trail',
}

export default function DemoStrategyPage() {
  const demoPoints = useMemo<GpxPoint[]>(() => generateDemoRoute(), [])

  const projection = useMemo(
    () => computeRaceProjection(demoPoints, [], DEMO_PROFILE, { type: 'Trail' }, null),
    [demoPoints],
  )

  const nutritionRows = useMemo(
    () => computeNutritionPlan(projection.totalDistM, projection.estTimeS, 'standard', resolveNutritionProducts(undefined)),
    [projection],
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vl-bg)' }}>
      {/* ── Bandeau démo ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: 'var(--vl-ember)', padding: '11px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--vl-ink)', opacity: .65 }}>
            Démo · parcours fictif
          </span>
          <span style={{ fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--vl-ink)' }}>
            Import ton GPX et Vorcelab calcule ta vraie stratégie en quelques secondes.
          </span>
        </div>
        <Link
          to="/"
          style={{
            textDecoration: 'none', display: 'inline-block', flexShrink: 0,
            background: 'var(--vl-ink)', color: 'var(--vl-ember)',
            fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '.04em',
            padding: '7px 16px', borderRadius: 6,
          }}
        >
          ANALYSER MA COURSE →
        </Link>
      </div>

      {/* ── Contenu ── */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--vl-ember)', marginBottom: 6 }}>
            Démonstration · Alpes françaises
          </div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.05, marginBottom: 4 }}>
            Trail des Crêtes · 25 km / 1 200 m D+
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)' }}>
            Stratégie calculée pour un coureur VDOT 46 · profil trail pur · départ 06h00
          </div>
        </div>

        <StrategyView
          projection={projection}
          race={DEMO_RACE}
          athleteName="Toi sur ce parcours"
          nutritionRows={nutritionRows}
          ravitos={DEMO_RAVITOS}
          forecast={null}
          weather={null}
        />

        {/* ── CTA bas de page ── */}
        <div style={{ marginTop: '3rem', textAlign: 'center', padding: '2rem', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r)' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>
            Prêt à analyser ta vraie course ?
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-2)', marginBottom: 22, maxWidth: 380, margin: '0 auto 22px' }}>
            Importe ton GPX, renseigne ton objectif, et Vorcelab calcule
            ta stratégie d'allure et ton plan nutrition personnalisés.
          </div>
          <Link
            to="/"
            className="btn-primary"
            style={{ textDecoration: 'none', display: 'inline-block', padding: '12px 28px', fontSize: '1rem', fontFamily: 'var(--vl-display)', fontWeight: 800, letterSpacing: '.04em' }}
          >
            COMMENCER GRATUITEMENT →
          </Link>
        </div>
      </div>
    </div>
  )
}
