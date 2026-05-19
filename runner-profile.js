// runner-profile.js
// Profil coureur réel — montée, descente, plat, endurance, sensibilité extérieure
// Algorithmes from scratch. Pas d'IA. Logique explicable.
// Données insuffisantes → signaux prudents uniquement.

import { VLState, sb } from './app-state.js';
import { fetchWeather } from './activity-analysis.js';
import { isRun } from './formatters.js';

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const MIN_SIGNAL  = 5;   // sorties min pour émettre un signal
const GOOD_CONF   = 10;  // sorties min pour confiance 'good'
const MAX_WEATHER = 20;  // max appels archive météo par session

// Cache météo en mémoire (session uniquement, pas persisté)
const _weatherCache = new Map();

// ─── UTILITAIRES ───────────────────────────────────────────────────────────────
function confLevel(n) {
  if (n >= GOOD_CONF) return 'good';
  if (n >= MIN_SIGNAL) return 'medium';
  return 'low';
}

function isTrailAct(a) {
  return (a.type || a.sport_type || '').toLowerCase().includes('trail');
}

// Allure en s/km depuis average_speed (m/s)
function paceS(a) {
  return a.average_speed > 0 ? 1000 / a.average_speed : null;
}

// D+ en m/km (densité verticale)
function vDensity(a) {
  const km = (a.distance || 0) / 1000;
  return km > 0 ? (a.total_elevation_gain || 0) / km : 0;
}

// Allure normalisée — correction linéaire grossière du dénivelé
// ~4 s/km per 10 m/km D+ pour rendre comparables sorties plates et vallonnées
function normPace(a) {
  const p = paceS(a);
  if (!p) return null;
  return p / (1 + vDensity(a) * 0.004);
}

// ─── MÉTÉO ARCHIVE AVEC CACHE ──────────────────────────────────────────────────
async function getWeather(act) {
  if (_weatherCache.has(act.id)) return _weatherCache.get(act.id);
  const lat = act.start_latlng?.[0], lon = act.start_latlng?.[1];
  if (lat == null || lon == null) { _weatherCache.set(act.id, null); return null; }
  const w = await fetchWeather(lat, lon, act.start_date_local || act.start_date).catch(() => null);
  _weatherCache.set(act.id, w);
  return w;
}

// Fetch météo en parallèle (concurrency = 4)
async function batchWeather(acts) {
  const results = new Array(acts.length).fill(null);
  let idx = 0;
  async function worker() {
    while (idx < acts.length) {
      const i = idx++;
      const w = await getWeather(acts[i]);
      if (w) results[i] = { ...acts[i], w };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, acts.length) }, worker));
  return results.filter(Boolean);
}

// ─── 1. PROFIL MONTÉE ──────────────────────────────────────────────────────────
function _climbProfile(activities, userProfile) {
  const uphills = activities.filter(a => (a.total_elevation_gain || 0) > 80 && vDensity(a) > 20);

  // VAM calibrée depuis streams (autoCalibrate), sinon estimée depuis durée+D+
  const vamAvg = userProfile.vam_avg || null;
  const vamMax = userProfile.vam_max || null;

  const estVAMs = uphills.map(a => {
    const h = (a.moving_time || 0) / 3600;
    if (h < 0.25 || !(a.total_elevation_gain > 0)) return null;
    // Facteur correctif : la VAM réelle sur montées pures > VAM calculée sur sortie entière
    return (a.total_elevation_gain / h) * 1.35;
  }).filter(Boolean);
  const estVam = estVAMs.length
    ? Math.round(estVAMs.reduce((s, v) => s + v, 0) / estVAMs.length)
    : null;

  return {
    vamAvg:      vamAvg || estVam,
    vamMax,
    coeffUphill: userProfile.coeff_uphill || null,
    samples:     uphills.length,
    confidence:  confLevel(uphills.length),
    source:      vamAvg ? 'streams_calibrated' : estVam ? 'activity_estimated' : 'none',
  };
}

// ─── 2. PROFIL DESCENTE ────────────────────────────────────────────────────────
function _downhillProfile(activities, userProfile) {
  const mountain = activities.filter(a => vDensity(a) > 30 && a.distance > 8000);
  const gentle   = activities.filter(a => { const v = vDensity(a); return v >= 15 && v <= 30 && a.distance > 5000; });
  const steep    = activities.filter(a => vDensity(a) > 50 && a.distance > 5000);

  const avgPace = mountain.length
    ? mountain.reduce((s, a) => s + (paceS(a) || 0), 0) / mountain.length
    : null;

  return {
    avgDescentPaceS: avgPace,
    gentleSamples:   gentle.length,
    steepSamples:    steep.length,
    coeffDownhill:   userProfile.coeff_downhill || null,
    samples:         mountain.length,
    confidence:      confLevel(mountain.length),
    note:            mountain.length < MIN_SIGNAL ? 'données insuffisantes — coefficients génériques appliqués' : null,
  };
}

// ─── 3. PROFIL PLAT ────────────────────────────────────────────────────────────
function _flatProfile(runs, userProfile, fcMax) {
  const flatRoad  = runs.filter(a => !isTrailAct(a) && vDensity(a) < 10  && a.distance > 3000);
  const flatTrail = runs.filter(a =>  isTrailAct(a) && vDensity(a) < 15  && a.distance > 3000);

  const avgRoad  = flatRoad.length
    ? flatRoad.reduce((s, a)  => s + (paceS(a) || 0), 0) / flatRoad.length  : null;
  const avgTrail = flatTrail.length
    ? flatTrail.reduce((s, a) => s + (paceS(a) || 0), 0) / flatTrail.length : null;

  // Efficacité FC : allure / (FC% FCmax) — indicateur d'économie de course
  const flatHr = flatRoad.filter(a => a.average_heartrate && fcMax > 0);
  const economy = flatHr.length
    ? Math.round(flatHr.reduce((s, a) => s + (paceS(a) || 0) / (a.average_heartrate / fcMax), 0) / flatHr.length)
    : null;

  return {
    avgRoadPaceS:   avgRoad,
    avgTrailPaceS:  avgTrail,
    runningEconomy: economy,
    coeffFlat:      userProfile.coeff_flat || null,
    roadSamples:    flatRoad.length,
    trailSamples:   flatTrail.length,
    confidence:     confLevel(flatRoad.length + flatTrail.length),
  };
}

// ─── 4. ENDURANCE / SORTIE LONGUE ──────────────────────────────────────────────
function _enduranceProfile(runs, raceCtx) {
  const longestKm  = runs.length ? Math.max(...runs.map(a => a.distance / 1000))               : null;
  const biggestDp  = runs.length ? Math.max(...runs.map(a => a.total_elevation_gain || 0))      : null;
  const longestMin = runs.length ? Math.max(...runs.map(a => Math.round((a.moving_time || 0) / 60))) : null;

  const raceKm = raceCtx?.distance  || null;
  const raceDp = raceCtx?.elevation || null;

  const distRatio = raceKm && longestKm && longestKm > 0 ? raceKm / longestKm : null;
  const dpRatio   = raceDp && biggestDp  && biggestDp  > 0 ? raceDp / biggestDp  : null;

  const alerts = [];
  if (distRatio && distRatio > 1.5)
    alerts.push(`Distance course ${(distRatio * 100 - 100).toFixed(0)}% supérieure à ta sortie max récente — estimation prudente conseillée.`);
  if (dpRatio && dpRatio > 1.5)
    alerts.push(`D+ course ${(dpRatio * 100 - 100).toFixed(0)}% supérieur à ton D+ max récent.`);

  return {
    longestDistanceKm:    longestKm,
    biggestElevationM:    biggestDp,
    longestEffortMin:     longestMin,
    distanceRatioToRace:  distRatio,
    elevationRatioToRace: dpRatio,
    alerts,
    samples: runs.length,
  };
}

// ─── 5a. SENSIBILITÉ CHALEUR ───────────────────────────────────────────────────
function _heatSensitivity(actsW, fcMax) {
  const optimal = actsW.filter(a => a.w.temp >= 8  && a.w.temp < 18 && normPace(a));
  const warm    = actsW.filter(a => a.w.temp >= 18 && a.w.temp < 25 && normPace(a));
  const hot     = actsW.filter(a => a.w.temp >= 25 && normPace(a));
  const hotAll  = [...warm, ...hot];

  if (optimal.length < MIN_SIGNAL || hotAll.length < MIN_SIGNAL) {
    return { sensitivity: 'unknown', pacePenaltyPer10C: null, hrDriftSignal: null,
             confidence: 'low', samples: actsW.length };
  }

  const avgOpt = optimal.reduce((s, a) => s + normPace(a), 0) / optimal.length;
  const avgHot = hotAll.reduce((s, a)  => s + normPace(a), 0) / hotAll.length;
  const avgT   = hotAll.reduce((s, a)  => s + a.w.temp,   0) / hotAll.length;
  const dT     = Math.max(1, avgT - 16);
  const pDelta = (avgHot - avgOpt) / avgOpt;
  const pen10C = pDelta > 0 ? (pDelta / dT) * 10 : 0;

  // Dérive FC à effort comparable (signal supplémentaire)
  const optHr = optimal.filter(a => a.average_heartrate && fcMax > 0);
  const hotHr = hotAll.filter(a  => a.average_heartrate && fcMax > 0);
  let drift = null;
  if (optHr.length >= 3 && hotHr.length >= 3) {
    drift = (hotHr.reduce((s, a) => s + a.average_heartrate / fcMax, 0) / hotHr.length)
          - (optHr.reduce((s, a) => s + a.average_heartrate / fcMax, 0) / optHr.length);
  }

  return {
    sensitivity:       pen10C > 0.06 ? 'high' : pen10C > 0.025 ? 'medium' : 'low',
    pacePenaltyPer10C: +pen10C.toFixed(4),
    hrDriftSignal:     drift !== null ? +drift.toFixed(4) : null,
    confidence:        confLevel(Math.min(optimal.length, hotAll.length)),
    samples:           actsW.length,
  };
}

// ─── 5b. SENSIBILITÉ FROID ─────────────────────────────────────────────────────
function _coldSensitivity(actsW) {
  const optimal = actsW.filter(a => a.w.temp >= 8 && a.w.temp < 18 && normPace(a));
  const cold    = actsW.filter(a => a.w.temp < 8  && normPace(a));

  if (optimal.length < MIN_SIGNAL || cold.length < MIN_SIGNAL) {
    return { sensitivity: 'unknown', warmupPenaltySignal: null, pacePenalty: null,
             confidence: 'low', samples: actsW.length };
  }

  const avgOpt  = optimal.reduce((s, a) => s + normPace(a), 0) / optimal.length;
  const avgCold = cold.reduce((s, a)    => s + normPace(a), 0) / cold.length;
  const penalty = (avgCold - avgOpt) / avgOpt;

  return {
    sensitivity:         penalty > 0.04 ? 'high' : penalty > 0.015 ? 'medium' : 'low',
    warmupPenaltySignal: null, // nécessite streams (premières minutes) — prévu étape 4
    pacePenalty:         +penalty.toFixed(4),
    confidence:          confLevel(Math.min(optimal.length, cold.length)),
    samples:             actsW.length,
  };
}

// ─── 5c. SENSIBILITÉ VENT ──────────────────────────────────────────────────────
function _windSensitivity(actsW) {
  const calm  = actsW.filter(a => (a.w.wind || 0) < 10  && normPace(a));
  const windy = actsW.filter(a => (a.w.wind || 0) >= 10 && normPace(a));

  if (calm.length < MIN_SIGNAL || windy.length < MIN_SIGNAL) {
    return { sensitivity: 'unknown', pacePenaltyPer20Kmh: null,
             confidence: 'low', samples: actsW.length };
  }

  const avgCalm = calm.reduce((s, a)  => s + normPace(a), 0) / calm.length;
  const avgWind = windy.reduce((s, a) => s + normPace(a), 0) / windy.length;
  const avgSpd  = windy.reduce((s, a) => s + (a.w.wind || 0), 0) / windy.length;
  const pDelta  = (avgWind - avgCalm) / avgCalm;
  const pen20   = pDelta > 0 ? (pDelta / Math.max(1, avgSpd - 5)) * 20 : 0;

  return {
    sensitivity:         pen20 > 0.05 ? 'high' : pen20 > 0.02 ? 'medium' : 'low',
    pacePenaltyPer20Kmh: +pen20.toFixed(4),
    confidence:          confLevel(Math.min(calm.length, windy.length)),
    samples:             actsW.length,
  };
}

// ─── 5d. SENSIBILITÉ PLUIE ─────────────────────────────────────────────────────
function _rainSensitivity(actsW) {
  const dry = actsW.filter(a => (a.w.precip || 0) < 0.1  && normPace(a));
  const wet = actsW.filter(a => (a.w.precip || 0) >= 0.1 && normPace(a));

  if (dry.length < MIN_SIGNAL || wet.length < MIN_SIGNAL) {
    return { sensitivity: 'unknown', downhillPenaltySignal: null, terrainPenaltySignal: null,
             confidence: 'low', samples: actsW.length };
  }

  const avgDry = dry.reduce((s, a) => s + normPace(a), 0) / dry.length;
  const avgWet = wet.reduce((s, a) => s + normPace(a), 0) / wet.length;
  const pen    = (avgWet - avgDry) / avgDry;

  // Signal descente humide : sorties trail avec fort D+
  const tDry = dry.filter(a => isTrailAct(a) && vDensity(a) > 25);
  const tWet = wet.filter(a => isTrailAct(a) && vDensity(a) > 25);
  let dPen = null;
  if (tDry.length >= 3 && tWet.length >= 3) {
    const pDry = tDry.reduce((s, a) => s + (paceS(a) || 0), 0) / tDry.length;
    const pWet = tWet.reduce((s, a) => s + (paceS(a) || 0), 0) / tWet.length;
    dPen = (pWet - pDry) / pDry;
  }

  return {
    sensitivity:           pen > 0.05 ? 'high' : pen > 0.02 ? 'medium' : 'low',
    downhillPenaltySignal: dPen !== null ? +dPen.toFixed(4) : null,
    terrainPenaltySignal:  pen > 0 ? +pen.toFixed(4) : null,
    confidence:            confLevel(Math.min(dry.length, wet.length)),
    samples:               actsW.length,
  };
}

// ─── 6. QUALITÉ DONNÉES ────────────────────────────────────────────────────────
function _dataQuality(all, actsW, runs, trails) {
  const now = Date.now();
  const recent90 = runs.filter(a => now - new Date(a.start_date).getTime() < 90 * 86_400_000);
  return {
    totalActivities:       all.length,
    totalRuns:             runs.length,
    totalTrails:           trails.length,
    activitiesWithHr:      runs.filter(a => a.average_heartrate).length,
    activitiesWithWeather: actsW.length,
    recentActivities90d:   recent90.length,
    freshness:             recent90.length >= 10 ? 'good' : recent90.length >= 4 ? 'medium' : 'low',
  };
}

// ─── EXPORT PRINCIPAL ──────────────────────────────────────────────────────────
export async function computeRunnerProfile(activities, userProfile, raceCtx, opts = {}) {
  const maxW  = opts.maxWeatherFetch ?? MAX_WEATHER;
  const fcMax = userProfile.fc_max || 185;

  const all    = activities || [];
  const runs   = all.filter(a => isRun(a.type || a.sport_type || ''));
  const trails = runs.filter(isTrailAct);

  // Fetch météo archive sur les N sorties récentes avec GPS (parallèle, concurrency=4)
  const candidates = runs.filter(a => a.start_latlng?.[0] != null).slice(0, maxW);
  const actsW = await batchWeather(candidates);

  const rp = {
    climbProfile:    _climbProfile(trails.length >= 3 ? trails : runs, userProfile),
    downhillProfile: _downhillProfile(trails.length >= 3 ? trails : runs, userProfile),
    flatProfile:     _flatProfile(runs, userProfile, fcMax),
    enduranceProfile: _enduranceProfile(runs, raceCtx),
    externalSensitivity: {
      heat:     _heatSensitivity(actsW, fcMax),
      cold:     _coldSensitivity(actsW),
      wind:     _windSensitivity(actsW),
      rain:     _rainSensitivity(actsW),
      humidity: { sensitivity: 'unknown', confidence: 'low', samples: 0 },
    },
    dataQuality: _dataQuality(all, actsW, runs, trails),
    _actCount: all.length, // clé de cache — invalide si nouvelles activités
  };

  console.info(`[VL] RunnerProfile calculé : ${rp.dataQuality.totalRuns} sorties, ${rp.dataQuality.activitiesWithWeather} avec météo`);

  // Persistance Supabase (fire and forget — ne bloque pas le prédicteur)
  if (VLState.currentUser?.id) {
    const rpAt = new Date().toISOString();
    const rpSave = { ...rp, _computedAt: rpAt };
    sb.from('profiles').upsert({
      id: VLState.currentUser.id,
      runner_profile: rpSave,
      runner_profile_at: rpAt,
    }).then(({ error }) => {
      if (error) console.warn('[VL] runner_profile save error', error.message);
    });
    rp._computedAt = rpAt;
  }

  return rp;
}

// ─── HELPER UI ─────────────────────────────────────────────────────────────────
export function sensitivityLabel(factor) {
  if (!factor || factor.sensitivity === 'unknown') return 'données insuffisantes';
  return {
    low:    'signal faible',
    medium: 'tendance observée — à confirmer',
    high:   'sensibilité probable',
  }[factor.sensitivity] || 'données insuffisantes';
}

// Libellé source montée
export function climbSourceLabel(rp) {
  if (!rp?.climbProfile) return 'générique (Minetti)';
  const cp = rp.climbProfile;
  if (cp.source === 'streams_calibrated') return `VAM calibrée ${cp.vamAvg} m/h`;
  if (cp.source === 'activity_estimated') return `VAM estimée ${cp.vamAvg} m/h`;
  return 'générique (Minetti)';
}
