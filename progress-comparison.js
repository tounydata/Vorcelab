// progress-comparison.js — Étape 5
// Comparaison historique sur activités similaires. Algorithmique, sans IA.

import { isRun } from './formatters.js';
import { escapeHTML } from './security.js';

const TRAIL_TYPES = ['TrailRun', 'Trail Run'];

function isTrailAct(a) { return TRAIL_TYPES.includes(a.sport_type || a.type || ''); }
function dpPerKm(a) { const km = (a.distance || 0) / 1000; return km > 0 ? (a.total_elevation_gain || 0) / km : 0; }
function paceS(a) { return a.average_speed > 0 ? 1000 / a.average_speed : null; }

// ─── SIMILARITÉ ───────────────────────────────────────────────────────────────
// Critères : distance ±25%, type trail/route, D+/km ±50%, au moins 2 jours d'écart

export function findSimilarActivities(activity, activities) {
  const dist    = activity.distance || 0;
  const dp      = dpPerKm(activity);
  const isTrail = isTrailAct(activity);
  const actTime = new Date(activity.start_date).getTime();

  return (activities || [])
    .filter(a => {
      if (a.id === activity.id) return false;
      if (!isRun(a.sport_type || a.type)) return false;
      if (isTrailAct(a) !== isTrail) return false;
      const aTime = new Date(a.start_date).getTime();
      if (aTime >= actTime) return false;
      if (actTime - aTime < 2 * 86_400_000) return false;
      const dRatio = dist > 0 ? a.distance / dist : 1;
      if (dRatio < 0.75 || dRatio > 1.30) return false;
      if (dp > 5) {
        const r = dpPerKm(a) / dp;
        if (r < 0.50 || r > 2.0) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
}

// ─── SIGNAUX DE PROGRESSION ───────────────────────────────────────────────────

export function computeProgressSignals(activity, similar) {
  if (!similar || similar.length < 2) return null;

  const curr = paceS(activity);
  const withPace = similar.filter(a => paceS(a) !== null);
  const avgPace  = withPace.length
    ? withPace.reduce((s, a) => s + paceS(a), 0) / withPace.length
    : null;

  let paceSignal = null, paceDiff = null;
  if (curr && avgPace) {
    paceDiff   = (avgPace - curr) / avgPace * 100;
    paceSignal = paceDiff > 3 ? 'faster' : paceDiff < -3 ? 'slower' : 'similar';
  }

  // Efficacité cardiaque : FC / vitesse (m/s) — plus bas = mieux
  const effNow = activity.average_heartrate && curr
    ? activity.average_heartrate / (1000 / curr) : null;
  const effHist = similar
    .filter(a => a.average_heartrate && paceS(a))
    .map(a => a.average_heartrate / (1000 / paceS(a)));
  const avgEff = effHist.length ? effHist.reduce((s, v) => s + v, 0) / effHist.length : null;
  let hrSignal = null;
  if (effNow && avgEff) {
    const d = (avgEff - effNow) / avgEff * 100;
    hrSignal = d > 4 ? 'better' : d < -4 ? 'worse' : 'similar';
  }

  return { paceSignal, paceDiff, hrSignal, n: similar.length };
}

// ─── RENDU ────────────────────────────────────────────────────────────────────

export function renderComparisonBlock(activity, similar, signals) {
  if (!similar || similar.length === 0) return '';

  if (similar.length < 2 || !signals) {
    return `
      <div class="card" style="margin-top:10px">
        <div class="clabel" style="margin:0 0 4px">Comparaison historique</div>
        <div class="mlabel">${similar.length} sortie similaire — pas assez pour comparer.</div>
      </div>`;
  }

  const { paceSignal, paceDiff, hrSignal, n } = signals;

  const paceColor = paceSignal === 'faster'
    ? 'var(--vl-growth)' : paceSignal === 'slower' ? 'var(--vl-ember)' : 'var(--vl-text-2)';
  const paceText = paceSignal === 'faster'
    ? `↑ +${Math.abs(paceDiff).toFixed(1)}% vs historique`
    : paceSignal === 'slower'
    ? `↓ −${Math.abs(paceDiff).toFixed(1)}% vs historique`
    : `→ allure comparable à l'historique`;

  const hrText = hrSignal === 'better' ? 'FC plus basse à allure comparable'
    : hrSignal === 'worse' ? 'FC plus haute à allure comparable' : null;

  return `
    <div class="card" style="margin-top:10px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:${hrText ? '8px' : '0'}">
        <div class="clabel" style="margin:0">Comparaison historique</div>
        <span class="mlabel" style="color:var(--vl-text-3)">${n} sortie${n > 1 ? 's' : ''} similaires</span>
      </div>
      <div style="font-family:var(--vl-mono);font-size:12px;font-weight:700;color:${paceColor}">${paceText}</div>
      ${hrText ? `<div class="mlabel" style="margin-top:5px;color:var(--vl-text-2)">${escapeHTML(hrText)}</div>` : ''}
    </div>
  `;
}
