// training-load.js
// Charge d'entraînement — charge aiguë 7j, charge de fond 42j, ratio, tendance
// Algorithme from scratch, sans IA. Logique explicable.
// Pas de promesse médicale. Wording prudent uniquement.

import { FC_MAX_DEFAULT } from './app-state.js';
import { isRun } from './formatters.js';

const TRAIL_TYPES = ['TrailRun', 'Trail Run'];
const MS_7D  =  7 * 86_400_000;
const MS_14D = 14 * 86_400_000;
const MS_42D = 42 * 86_400_000;

// ─── CHARGE ACTIVITÉ ──────────────────────────────────────────────────────────
// Load = durée_min × facteur_intensité × facteur_dénivelé × facteur_type
// Unité arbitraire (score interne), toujours cohérente au sein d'un profil.

export function computeActivityLoad(activity, fcMax) {
  const maxHR = fcMax || FC_MAX_DEFAULT;
  const durationMin = (activity.moving_time || 0) / 60;
  if (durationMin < 5) return 0;

  // Facteur intensité — poids log-croissants inspirés Bannister TRIMP
  // Z5 est ~6-8× plus stressant que Z1, pas 5× (linéaire serait faux)
  let intensity;
  if (activity.average_heartrate && maxHR > 0) {
    const z = activity.average_heartrate / maxHR;
    if (z >= 0.90)      intensity = 7.5;
    else if (z >= 0.80) intensity = 4.5;
    else if (z >= 0.70) intensity = 2.5;
    else if (z >= 0.60) intensity = 1.5;
    else                intensity = 1.0;
  } else {
    const t = activity.sport_type || activity.type || '';
    // Allure en s/km — estimation zone sans FC
    const pace = activity.distance > 100
      ? activity.moving_time / (activity.distance / 1000)
      : 0;
    if (TRAIL_TYPES.includes(t))      intensity = 3.0;
    else if (pace > 0 && pace < 280)  intensity = 3.5; // < 4:40/km → intensif
    else if (pace > 0 && pace < 360)  intensity = 3.0; // < 6:00/km
    else                              intensity = 2.5;
  }

  // Facteur dénivelé — D+/km
  let elev = 1.0;
  if (activity.distance > 100 && activity.total_elevation_gain > 0) {
    const dpKm = activity.total_elevation_gain / (activity.distance / 1000);
    if (dpKm >= 40)      elev = 1.30;
    else if (dpKm >= 20) elev = 1.15;
    else if (dpKm >= 10) elev = 1.05;
  }

  // Facteur type
  const typeFactor = TRAIL_TYPES.includes(activity.sport_type || activity.type || '') ? 1.05 : 1.0;

  return Math.round(durationMin * intensity * elev * typeFactor);
}

// ─── TENDANCE ─────────────────────────────────────────────────────────────────
// Compare charge 7j avec les 7 jours précédents

export function computeLoadTrend(activities, fcMax) {
  const now = Date.now();
  const runs = (activities || []).filter(a => isRun(a.sport_type || a.type));

  const load7  = runs.filter(a => now - new Date(a.start_date).getTime() <= MS_7D)
    .reduce((s, a) => s + computeActivityLoad(a, fcMax), 0);

  const load7prev = runs.filter(a => {
    const age = now - new Date(a.start_date).getTime();
    return age > MS_7D && age <= MS_14D;
  }).reduce((s, a) => s + computeActivityLoad(a, fcMax), 0);

  if (load7prev === 0 && load7 === 0) return 'unknown';
  if (load7prev === 0) return 'increasing';

  const ratio = load7 / load7prev;
  if (ratio > 1.15) return 'increasing';
  if (ratio < 0.85) return 'decreasing';
  return 'stable';
}

// ─── CHARGE GLOBALE ───────────────────────────────────────────────────────────

export function computeTrainingLoad(activities, fcMax) {
  const now  = Date.now();
  const runs = (activities || []).filter(a => isRun(a.sport_type || a.type));

  const recent42 = runs.filter(a => now - new Date(a.start_date).getTime() <= MS_42D);
  const recent7  = recent42.filter(a => now - new Date(a.start_date).getTime() <= MS_7D);

  // Décroissance exponentielle — Bannister TRIMP model
  // ATL (charge aiguë) : τ = 7 jours / CTL (charge chronique) : τ = 42 jours
  // Les sommes sont normalisées par la somme des poids exponentiels afin que
  // acuteLoad et chronicLoad soient deux moyennes pondérées comparables à l'échelle.
  // Sans normalisation, CTL accumule plus de poids (42j > 7j) et le ratio ACWR
  // serait systématiquement biaisé vers des valeurs < 1 même en charge stable.
  const acute = recent7.reduce((acc, a) => {
    const ageDays = (now - new Date(a.start_date).getTime()) / 86_400_000;
    const weight = Math.exp(-ageDays / 7);
    const load = computeActivityLoad(a, fcMax);
    return { sum: acc.sum + load * weight, weight: acc.weight + weight };
  }, { sum: 0, weight: 0 });

  const chronic = recent42.reduce((acc, a) => {
    const ageDays = (now - new Date(a.start_date).getTime()) / 86_400_000;
    const weight = Math.exp(-ageDays / 42);
    const load = computeActivityLoad(a, fcMax);
    return { sum: acc.sum + load * weight, weight: acc.weight + weight };
  }, { sum: 0, weight: 0 });

  const acuteLoad  = acute.weight   > 0 ? acute.sum   / acute.weight   : 0;
  const chronicLoad = chronic.weight > 0 ? chronic.sum / chronic.weight : 0;
  const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : null;
  const trend = computeLoadTrend(activities, fcMax);

  return {
    acuteLoad:   Math.round(acuteLoad),
    chronicLoad: Math.round(chronicLoad),
    ratio,
    trend,
    count7:  recent7.length,
    count42: recent42.length,
    hasHR:   recent7.some(a => a.average_heartrate),
  };
}

// ─── STATUT ───────────────────────────────────────────────────────────────────

// Seuils ACWR issus de Gabbett 2016 (Br J Sports Med) :
// 0.8–1.3 = zone optimale, >1.5 = risque de blessure augmenté
export function getLoadStatus(ratio) {
  if (ratio === null || ratio === undefined)
    return { label: 'inconnu',           color: 'var(--vl-text-3)', code: 'unknown'  };
  if (ratio < 0.80)
    return { label: 'récupération',      color: 'var(--vl-growth)', code: 'recovery' };
  if (ratio <= 1.30)
    return { label: 'stable',            color: 'var(--vl-growth)', code: 'stable'   };
  if (ratio <= 1.50)
    return { label: 'charge élevée',     color: '#f59e0b',           code: 'elevated' };
  return   { label: 'surcharge probable',color: 'var(--vl-ember)',  code: 'overload' };
}

// ─── RENDU DASHBOARD ──────────────────────────────────────────────────────────

export function renderLoadBlock(loadData) {
  const { acuteLoad, chronicLoad, ratio, trend, count7, count42 } = loadData;

  // Données insuffisantes
  if (count42 < 2) {
    return `
      <div class="clabel" style="margin:0 0 8px">Charge d'entraînement</div>
      <div style="font-family:var(--vl-mono);font-size:.8rem;color:var(--vl-text-2)">Données insuffisantes</div>
      <div class="mlabel" style="margin-top:4px">Au moins 2 sorties récentes nécessaires.</div>
    `;
  }

  const status = getLoadStatus(ratio);

  const trendArrow = { increasing: '↑', stable: '→', decreasing: '↓', unknown: '—' }[trend] || '—';
  const trendColor = trend === 'increasing'
    ? (ratio !== null && ratio > 1.20 ? 'var(--vl-ember)' : '#f59e0b')
    : trend === 'decreasing' ? 'var(--vl-growth)' : 'var(--vl-text-2)';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="clabel" style="margin:0">Charge d'entraînement</div>
      <span style="font-family:var(--vl-mono);font-size:9px;font-weight:700;letter-spacing:.1em;padding:3px 8px;border-radius:3px;background:${status.color}22;color:${status.color}">${status.label.toUpperCase()}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div class="s-stat">
        <div class="s-sv">${acuteLoad}</div>
        <div class="s-sl">Charge 7j</div>
      </div>
      <div class="s-stat">
        <div class="s-sv">${chronicLoad}</div>
        <div class="s-sl">Charge de fond</div>
      </div>
      <div class="s-stat">
        <div class="s-sv" style="color:${trendColor}">${trendArrow}</div>
        <div class="s-sl">Tendance</div>
      </div>
    </div>
  `;
}
