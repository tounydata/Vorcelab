// race-predictor.js — Étape 6
// Fonctions pures de prédiction extraites de race-strategy.js.
// Intégration fraîcheur via training-load.js.

import { computeTrainingLoad } from './training-load.js';
import { isRun } from './formatters.js';
import { FC_MAX_DEFAULT } from './app-state.js';

// ─── FRAÎCHEUR ────────────────────────────────────────────────────────────────
// Multiplicateur sur le temps de course basé sur la charge récente.
// Seuils alignés sur Gabbett 2016 (cohérents avec getLoadStatus de training-load.js).
// Plafonnés à ±4% — prudent, l'effet réel peut dépasser mais on ne surprédit pas.

export function computeFreshnessAdjustment(activities, fcMax) {
  const load = computeTrainingLoad(activities, fcMax || FC_MAX_DEFAULT);
  if (load.ratio === null || load.count42 < 3)
    return { multiplier: 1, label: null };

  const r = load.ratio;
  if (r > 1.50) return { multiplier: 1.04, label: 'surcharge', loadStatus: 'overload' };
  if (r > 1.30) return { multiplier: 1.02, label: 'fatigue',   loadStatus: 'elevated' };
  if (r < 0.80) return { multiplier: 0.99, label: 'fraîcheur', loadStatus: 'recovery' };
  return { multiplier: 1, label: null, loadStatus: 'stable' };
}

// ─── PROGRESSION ──────────────────────────────────────────────────────────────
// Facteur de progression depuis sessions Z3+ — version pure (pas de VLState).
// Identique à computeProgressionFactor() de race-strategy.js, paramétrisée.

export function computeProgressionFactor(activities, fcMax, trailOnly = false) {
  const maxHR  = fcMax || FC_MAX_DEFAULT;
  const z3min  = Math.round(maxHR * 0.80);
  const TRAIL  = ['TrailRun', 'Trail Run'];

  let sessions = (activities || []).filter(a => {
    if (!isRun(a.sport_type || a.type)) return false;
    if (trailOnly && !TRAIL.includes(a.sport_type || a.type)) return false;
    return a.average_heartrate > z3min && a.distance > 3000;
  }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  if (sessions.length < 4 && trailOnly)
    return computeProgressionFactor(activities, fcMax, false);
  if (sessions.length < 4) return 1;

  const half   = Math.floor(sessions.length / 2);
  const early  = sessions.slice(0, half);
  const recent = sessions.slice(-half);
  // Pondération par moving_time : une sortie de 2h Z3+ pèse 8× plus qu'une de 15min
  const weightedAvg = (arr) => {
    const totalTime = arr.reduce((s, a) => s + (a.moving_time || 0), 0);
    return totalTime > 0
      ? arr.reduce((s, a) => s + a.average_speed * (a.moving_time || 0), 0) / totalTime
      : 0;
  };
  const avgE = weightedAvg(early);
  const avgR = weightedAvg(recent);
  return avgE > 0 ? Math.min(1.10, Math.max(0.90, avgR / avgE)) : 1;
}
