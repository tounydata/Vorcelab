// runner-profile.js
// Profil coureur réel — montée, descente, plat, endurance, sensibilité extérieure
// Algorithmes from scratch. Pas d'IA. Logique explicable.
// Données insuffisantes → signaux prudents uniquement.

import { VLState, sb } from './app-state.js';
import { fetchWeather } from './weather.js';
import { isRun } from './formatters.js';

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const MIN_SIGNAL  = 5;   // sorties min pour émettre un signal
const GOOD_CONF   = 10;  // sorties min pour confiance 'good'
const MAX_WEATHER = 10;  // max appels archive météo par session (MVP)

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

// Allure normalisée — correction dénivelé calibrée sur données trail réelles
// ~6 s/km per 10 m/km D+ (0.004 sous-estimait de ~2× à partir de 30 m/km)
function normPace(a) {
  const p = paceS(a);
  if (!p) return null;
  return p / (1 + vDensity(a) * 0.006);
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

  // Estimation VAM sans streams supprimée : D+_total / durée_totale × facteur_arbitraire
  // introduisait une erreur systématique (le facteur dépend du % de temps en montée,
  // inconnu sans streams). On n'émet de VAM que si autoCalibrate a tourné.

  return {
    vamAvg:      vamAvg || null,
    vamMax,
    coeffUphill: userProfile.coeff_uphill || null,
    samples:     uphills.length,
    confidence:  vamAvg ? confLevel(uphills.length) : 'low',
    source:      vamAvg ? 'streams_calibrated' : 'none',
  };
}

// ─── 2. PROFIL DESCENTE ────────────────────────────────────────────────────────
function _downhillProfile(activities, userProfile) {
  const steep  = activities.filter(a => vDensity(a) > 50 && a.distance > 5000);
  const gentle = activities.filter(a => { const v = vDensity(a); return v >= 25 && v < 50 && a.distance > 5000; });
  const mountain = [...steep, ...gentle];

  const avgSteepPaceS  = steep.length
    ? Math.round(steep.reduce((s, a) => s + (paceS(a) || 0), 0) / steep.length)
    : null;
  const avgGentlePaceS = gentle.length
    ? Math.round(gentle.reduce((s, a) => s + (paceS(a) || 0), 0) / gentle.length)
    : null;

  // Signal "downhillAbility" sans streams :
  // normPace corrige le D+ mais pas le D- → un bon descendeur aura un normPace
  // sur terrain montagneux proche de son normPace sur plat.
  // Ratio normPace_montagne / normPace_plat > 1.08 : descente pénalisante → faible
  // Ratio ≤ 0.97 : descente efficace (compense la correction D+) → fort
  // Seuils empiriques prudents — signal agrégé, pas section par section.
  let downhillAbility = 'average';
  let abilityRatio    = null;
  const flatActs = activities.filter(a => vDensity(a) < 15 && a.distance > 3000);

  if (mountain.length >= MIN_SIGNAL && flatActs.length >= MIN_SIGNAL) {
    const normMtn  = mountain.map(normPace).filter(Boolean);
    const normFlat = flatActs.map(normPace).filter(Boolean);
    if (normMtn.length >= MIN_SIGNAL && normFlat.length >= MIN_SIGNAL) {
      const avgNormMtn  = normMtn.reduce((s, v) => s + v, 0)  / normMtn.length;
      const avgNormFlat = normFlat.reduce((s, v) => s + v, 0) / normFlat.length;
      abilityRatio = avgNormMtn / avgNormFlat;
      if      (abilityRatio <= 0.97) downhillAbility = 'strong';
      else if (abilityRatio >= 1.08) downhillAbility = 'weak';
    }
  }

  return {
    coeffDownhill:      userProfile.coeff_downhill || null,
    downhillAbility:    mountain.length >= MIN_SIGNAL ? downhillAbility : 'average',
    abilityRatio:       abilityRatio !== null ? +abilityRatio.toFixed(3) : null,
    gentleDescentPaceS: avgGentlePaceS,
    steepDescentPaceS:  avgSteepPaceS,
    samples:            mountain.length,
    confidence:         confLevel(mountain.length),
    note:               'signal agrégé depuis historique trail — affinage par sections via streams prévu',
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

  // Efficacité cardiaque : vitesse (m/s) / FC% FCmax
  // "combien de m/s obtenus par unité d'effort cardiaque relatif" — plus élevé = plus efficace
  // Ce n'est PAS l'économie de course au sens biomécanique (VO2/vitesse) — proxy FC uniquement
  const flatHr = flatRoad.filter(a => a.average_heartrate && fcMax > 0);
  const cardiacEfficiency = flatHr.length
    ? +(flatHr.reduce((s, a) => s + a.average_speed / (a.average_heartrate / fcMax), 0) / flatHr.length).toFixed(3)
    : null;

  return {
    avgRoadPaceS:      avgRoad,
    avgTrailPaceS:     avgTrail,
    cardiacEfficiency,
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
    alerts.push(`Distance course ${(distRatio * 100 - 100).toFixed(0)}% supérieure à ta sortie max récente.`);
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
  // Seuil optimal [8-15°C] : Ely et al. 2007 montre déclin dès 13-15°C pour efforts longs
  const optimal = actsW.filter(a => a.w.temp >= 8  && a.w.temp < 15 && normPace(a));
  const warm    = actsW.filter(a => a.w.temp >= 15 && a.w.temp < 25 && normPace(a));
  const hot     = actsW.filter(a => a.w.temp >= 25 && normPace(a));
  const hotAll  = [...warm, ...hot];

  if (optimal.length < MIN_SIGNAL || hotAll.length < MIN_SIGNAL) {
    return { sensitivity: 'unknown', pacePenaltyPer10C: null, hrDriftSignal: null,
             confidence: 'low', samples: actsW.length };
  }

  const avgOpt = optimal.reduce((s, a) => s + normPace(a), 0) / optimal.length;
  const avgHot = hotAll.reduce((s, a)  => s + normPace(a), 0) / hotAll.length;
  const avgT   = hotAll.reduce((s, a)  => s + a.w.temp,   0) / hotAll.length;
  const dT     = Math.max(1, avgT - 15); // référence = borne haute de la zone optimale [8-15°C]
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
  const optimal = actsW.filter(a => a.w.temp >= 8 && a.w.temp < 15 && normPace(a));
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

// ─── 6. RELANCE APRÈS SECTION DIFFICILE ───────────────────────────────────────
// Signal streams uniquement — non calculable depuis les résumés d'activité.
// Prévu dans une prochaine passe avec fetchStreams sur activités trail.
function _reaccelerationProfile() {
  return {
    ability: 'unknown',
    speedRecoveryRatio: null,
    samples: 0,
    confidence: 'low',
  };
}

// ─── 7. RÉCUPÉRATION FC APRÈS MONTÉE ──────────────────────────────────────────
// Signal streams uniquement — non calculable depuis les résumés d'activité.
// Prévu dans une prochaine passe avec fetchStreams sur activités trail.
function _hrRecoveryProfile() {
  return {
    hrDrop60: null,
    hrDrop120: null,
    recoveryLevel: 'unknown',
    samples: 0,
    confidence: 'low',
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

  // Fetch météo archive sur les N sorties récentes avec GPS (parallèle, concurrency=4, timeout 8s)
  const candidates = runs.filter(a => a.start_latlng?.[0] != null).slice(0, maxW);
  const timeoutMs = opts.timeoutMs ?? 8000;
  const actsW = await Promise.race([
    batchWeather(candidates),
    new Promise(resolve => setTimeout(() => resolve([]), timeoutMs)),
  ]);
  if (actsW.length === 0 && candidates.length > 0) {
    console.warn(`[VL] RunnerProfile: fetch météo ignoré (timeout ${timeoutMs}ms) — sensibilités non calculées`);
  }

  const rp = {
    climbProfile:          _climbProfile(trails.length >= 3 ? trails : runs, userProfile),
    downhillProfile:       _downhillProfile(trails.length >= 3 ? trails : runs, userProfile),
    flatProfile:           _flatProfile(runs, userProfile, fcMax),
    enduranceProfile:      _enduranceProfile(runs, raceCtx),
    reaccelerationProfile: _reaccelerationProfile(),
    hrRecoveryProfile:     _hrRecoveryProfile(),
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
  // Fallback silencieux si colonnes absentes : profil reste disponible en mémoire
  if (VLState.currentUser?.id) {
    const rpAt = new Date().toISOString();
    const rpSave = { ...rp, _computedAt: rpAt };
    sb.from('profiles').upsert({
      id: VLState.currentUser.id,
      runner_profile: rpSave,
      runner_profile_at: rpAt,
    }).then(({ error }) => {
      if (error) console.warn('[VL] runner_profile persist failed (profil en mémoire seulement):', error.message);
    }).catch(e => {
      console.warn('[VL] runner_profile persist exception (profil en mémoire seulement):', e?.message);
    });
    rp._computedAt = rpAt;
  }


  return rp;
}

// ─── HELPER UI ─────────────────────────────────────────────────────────────────
export function sensitivityLabel(factor) {
  if (!factor || factor.sensitivity === 'unknown') return '';
  return { low: 'faible', medium: 'moyen', high: 'élevé' }[factor.sensitivity] || '';
}

// Libellé source montée
export function climbSourceLabel(rp) {
  if (!rp?.climbProfile) return 'Minetti';
  const cp = rp.climbProfile;
  if (cp.source === 'streams_calibrated') return `VAM ${cp.vamAvg} m/h`;
  return 'Minetti';
}
