// session-quality.js — Étape 4
// Classification de séance et dérive cardiaque. Algorithmique, sans IA.

import { FC_MAX_DEFAULT } from './app-state.js';

const TRAIL_TYPES = ['TrailRun', 'Trail Run'];

// ─── CLASSIFICATION ───────────────────────────────────────────────────────────

export function classifySession(activity, fcMax) {
  const maxHR  = fcMax || FC_MAX_DEFAULT;
  const durMin = (activity.moving_time || 0) / 60;
  const distKm = (activity.distance   || 0) / 1000;
  const dpKm   = distKm > 0 ? (activity.total_elevation_gain || 0) / distKm : 0;
  const isTrail = TRAIL_TYPES.includes(activity.sport_type || activity.type || '');
  const hrPct   = activity.average_heartrate && maxHR > 0
    ? activity.average_heartrate / maxHR : null;

  if (durMin < 15) return 'sortie courte';

  if (hrPct !== null) {
    if (hrPct >= 0.90) return 'effort maximal';
    if (hrPct >= 0.82) return 'fractionné probable';
    if (hrPct >= 0.75) return 'tempo / seuil';
    if (hrPct >= 0.68) return durMin >= 90 ? 'sortie longue' : 'endurance active';
    if (hrPct >= 0.60) return durMin >= 90 ? 'sortie longue' : 'endurance facile';
    return durMin >= 60 ? 'sortie longue (récup)' : 'récupération';
  }

  // Fallback sans FC
  if (isTrail && dpKm >= 40) return 'trail vallonné';
  if (isTrail)               return 'trail';
  if (durMin >= 120)         return 'sortie longue';
  const pace = distKm > 0 ? activity.moving_time / distKm : 0;
  if (pace > 0 && pace < 270) return 'effort soutenu';
  if (durMin >= 60)          return 'endurance';
  return 'sortie';
}

// ─── DÉRIVE CARDIAQUE ─────────────────────────────────────────────────────────

export function computeCardiacDrift(streams) {
  const hr = streams?.heartrate?.data;
  if (!hr || hr.length < 40) return null;
  const mid   = Math.floor(hr.length / 2);
  const first  = hr.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
  const second = hr.slice(mid).reduce((s, v) => s + v, 0) / (hr.length - mid);
  const driftPct = first > 0 ? +((second - first) / first * 100).toFixed(1) : 0;
  return { first: Math.round(first), second: Math.round(second), driftPct };
}

// ─── INSIGHTS ─────────────────────────────────────────────────────────────────

export function buildSessionInsights(activity, streams, fcMax) {
  const maxHR  = fcMax || FC_MAX_DEFAULT;
  const type   = classifySession(activity, maxHR);
  const drift  = computeCardiacDrift(streams);
  const durMin = (activity.moving_time || 0) / 60;
  const distKm = (activity.distance   || 0) / 1000;
  const dpKm   = distKm > 0 ? (activity.total_elevation_gain || 0) / distKm : 0;
  const hrPct  = activity.average_heartrate && maxHR > 0
    ? activity.average_heartrate / maxHR : null;
  const hasHR  = !!activity.average_heartrate;

  const insights = [];

  if (durMin >= 180) insights.push({ key: 'durée', value: `${Math.round(durMin / 60)}h${String(Math.round(durMin % 60)).padStart(2, '0')}` });
  if (dpKm >= 25)   insights.push({ key: 'D+/km',  value: `${Math.round(dpKm)} m/km` });

  if (hrPct !== null) {
    const zone = hrPct >= 0.90 ? 'Z5' : hrPct >= 0.80 ? 'Z4' : hrPct >= 0.70 ? 'Z3' : hrPct >= 0.60 ? 'Z2' : 'Z1';
    insights.push({ key: 'zone moy', value: zone });
  }

  return { type, drift, insights, hasHR };
}

// ─── RENDU ────────────────────────────────────────────────────────────────────

export function renderSessionQualityBlock(data) {
  const { type, drift, insights, hasHR } = data;
  if (!hasHR && insights.length === 0) return '';

  const driftHtml = drift && Math.abs(drift.driftPct) >= 3
    ? `<div class="s-stat"><div class="s-sv" style="color:${
        drift.driftPct > 10 ? 'var(--vl-ember)' : drift.driftPct > 5 ? '#f59e0b' : 'var(--vl-growth)'
      }">${drift.driftPct > 0 ? '+' : ''}${drift.driftPct}%</div><div class="s-sl">Dérive FC</div></div>`
    : '';

  const insightHtml = insights.map(ins =>
    `<div class="s-stat"><div class="s-sv">${ins.value}</div><div class="s-sl">${ins.key}</div></div>`
  ).join('');

  const hasContent = driftHtml || insightHtml;

  return `
    <div class="card" style="margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${hasContent ? '10px' : '0'}">
        <div class="clabel" style="margin:0">Qualité de séance</div>
        <span style="font-family:var(--vl-mono);font-size:9px;font-weight:700;letter-spacing:.1em;padding:3px 8px;border-radius:3px;background:var(--vl-surf-2);color:var(--vl-text-2)">${type.toUpperCase()}</span>
      </div>
      ${hasContent ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${driftHtml}${insightHtml}</div>` : ''}
    </div>
  `;
}
