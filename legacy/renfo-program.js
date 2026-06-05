// ============================================================
// VORCELAB — RENFO PROGRAM (pure algorithms)
// ============================================================

import { RENFO_EXERCISES, SESSION_EXERCISES, FOCUS_META, RENFO_LOAD_WEIGHTS, DAYS } from './renfo-data.js';
import { sb } from './app-state.js';

// ── HELPERS ────────────────────────────────────────────────────────────────

export function epley1RM(load_kg, reps) {
  if (!load_kg || reps <= 0) return null;
  if (reps === 1) return load_kg;
  return Math.round(load_kg * (1 + reps / 30) * 10) / 10;
}

export function isVariantFeasible(v, profile) {
  const eq = profile.equipment || {};
  if (v.required_equipment) {
    if (v.required_equipment.has_gym_access && !profile.has_gym_access) return false;
    if (v.required_equipment.barbell && !eq.barbell) return false;
    if (v.required_equipment.leg_press && !eq.leg_press) return false;
    if (v.required_equipment.bench && !eq.bench) return false;
    if (v.required_equipment.pullup_bar && !eq.pullup_bar) return false;
    if (v.required_equipment.step && !eq.step) return false;
    if (v.required_equipment.anchor_point && !eq.anchor_point) return false;
    if (v.required_equipment.bands && (!eq.bands || eq.bands.length === 0)) return false;
  }
  if (v.required_equipment_any) {
    const ok = v.required_equipment_any.some(req => {
      if (req.dumbbells_max_kg) return (eq.dumbbells_max_kg || 0) >= req.dumbbells_max_kg;
      if (req.kettlebell_max_kg) return (eq.kettlebell_max_kg || 0) >= req.kettlebell_max_kg;
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

// Meilleure variante réalisable, ou null si aucune (on n'invente plus une variante
// impossible — ex. face pull poulie proposé à la maison).
export function getBestVariant(exercise, profile) {
  const variants = [...exercise.variants].sort((a, b) => a.priority - b.priority);
  for (const v of variants) {
    if (isVariantFeasible(v, profile)) return v;
  }
  return null;
}

// ── GÉNÉRATEUR DE PROGRAMME ────────────────────────────────────────────────

export function generateRenfoProgram(profile) {
  const spw = Math.min(6, Math.max(1, profile.sessions_per_week));
  const ow = profile.objective_weight || 50;

  const focuses = allocateFocuses(spw, ow);
  const sessionDays = pickDays(spw);

  const week_schedule = {};
  DAYS.forEach(day => {
    const idx = sessionDays.indexOf(day);
    if (idx === -1) {
      week_schedule[day] = { rest: true, focus: null, exercises: [] };
    } else {
      const focus = focuses[idx];
      week_schedule[day] = buildSession(focus, profile);
    }
  });

  return week_schedule;
}

export function allocateFocuses(spw, ow) {
  if (spw === 1) return ['force_lourde'];
  if (spw === 2) {
    if (ow <= 30) return ['force_lourde', 'excentrique'];
    if (ow >= 70) return ['force_lourde', 'pliometrie'];
    return ['force_lourde', 'excentrique_pliometrie'];
  }
  // Yoga always included for 3+ sessions (récupération active universelle)
  if (spw === 3) return ['force_lourde', 'excentrique', 'yoga_coureur'];
  if (spw === 4) {
    if (ow >= 70) return ['force_lourde', 'pliometrie', 'excentrique', 'tronc'];
    return ['force_lourde', 'excentrique', 'tronc', 'yoga_coureur'];
  }
  if (spw === 5) {
    if (ow >= 70) return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps'];
    return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'yoga_coureur'];
  }
  // 6 séances : programme complet
  if (ow <= 35) return ['force_lourde', 'excentrique', 'pliometrie', 'tronc', 'yoga_coureur', 'stretching'];
  return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps', 'yoga_coureur'];
}

export function pickDays(spw) {
  const patterns = {
    1: ['tuesday'],
    2: ['tuesday','friday'],
    3: ['monday','wednesday','friday'],
    4: ['monday','tuesday','thursday','friday'],
    5: ['monday','tuesday','wednesday','friday','saturday'],
    6: ['monday','tuesday','wednesday','thursday','friday','saturday']
  };
  return patterns[spw] || patterns[3];
}

export function buildSession(focus, profile) {
  const meta = FOCUS_META[focus] || FOCUS_META['tronc'];
  // On ne retient que les exercices ayant au moins une variante réalisable avec le matériel.
  const allExoIds = (SESSION_EXERCISES[focus] || []).filter(id => {
    const exo = RENFO_EXERCISES[id];
    return exo && getBestVariant(exo, profile) != null;
  });
  const maxExos = (focus === 'tronc' || focus === 'mobilite') ? 5 : 4;
  const weekNum = Math.floor(Date.now() / (7 * 86400000));
  const offset = weekNum % Math.max(1, allExoIds.length - maxExos + 1);
  const exoIds = allExoIds.slice(offset, offset + maxExos);
  const exercises = exoIds.map(id => {
    const exo = RENFO_EXERCISES[id];
    if (!exo) return null;
    const variant = getBestVariant(exo, profile);
    if (!variant) return null;
    return {
      exercise_id: id,
      variant_id: variant.id,
      sets: variant.default_sets,
      reps: variant.default_reps,
      target_rpe: variant.target_rpe,
      rest_seconds: variant.rest_seconds,
      load_type: variant.load_type,
      unit: variant.unit ?? null,
    };
  }).filter(Boolean);

  const duration = (profile.sessions_per_week >= 5) ? meta.duration_short : meta.duration_min;

  return {
    focus,
    label: meta.label,
    duration_min: duration,
    timing_notes: meta.timing_notes || [],
    location: meta.location,
    exercises
  };
}

// ── DUP (Daily Undulating Periodization) ──────────────────────────────────

// 3-week rotating cycle: 0=force, 1=volume, 2=puissance
export function getDUPPhase() {
  return Math.floor(Date.now() / (7 * 86400000)) % 3;
}

export const DUP_PHASE_LABELS = ['FORCE', 'VOLUME', 'PUISSANCE'];

const _DUP_SCHEMA = {
  force_lourde: [
    { sets: 5, reps: 5, target_rpe: 8, rest_seconds: 180 },
    { sets: 4, reps: 10, target_rpe: 7, rest_seconds: 90 },
    { sets: 4, reps: 4, target_rpe: 8, rest_seconds: 150 },
  ],
  excentrique: [
    { sets: 3, reps: 8, target_rpe: 8, rest_seconds: 120 },
    { sets: 3, reps: 12, target_rpe: 7, rest_seconds: 90 },
    { sets: 4, reps: 6, target_rpe: 9, rest_seconds: 120 },
  ],
  pliometrie: [
    { sets: 4, reps: 6, target_rpe: 8, rest_seconds: 150 },
    { sets: 3, reps: 12, target_rpe: 7, rest_seconds: 90 },
    { sets: 5, reps: 4, target_rpe: 8, rest_seconds: 150 },
  ],
};

export function applyDUP(session) {
  if (!session || !session.focus) return session;
  const schema = _DUP_SCHEMA[session.focus];
  if (!schema) return session;
  const params = schema[getDUPPhase()];
  return {
    ...session,
    dup_phase: getDUPPhase(),
    dup_label: DUP_PHASE_LABELS[getDUPPhase()],
    exercises: session.exercises.map(e => ({
      ...e,
      sets: params.sets,
      reps: params.reps,
      target_rpe: params.target_rpe,
      rest_seconds: params.rest_seconds,
    })),
  };
}

// ── CO-PÉRIODISATION RUN + RENFO ───────────────────────────────────────────

export async function getCoPerioWarnings(userId) {
  const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const { data: acts } = await sb.from('strava_activities')
    .select('start_date_local, type, distance, moving_time, total_elevation_gain')
    .eq('user_id', userId)
    .gte('start_date_local', cutoff)
    .order('start_date_local', { ascending: false });

  if (!acts || acts.length === 0) return [];

  const warnings = [];
  const now = Date.now();

  for (const act of acts) {
    const actMs = new Date(act.start_date_local).getTime();
    const daysAgo = Math.round((now - actMs) / 86400000);
    const distKm = (act.distance || 0) / 1000;

    // Long run (>15km) in last 48h → pas de force_lourde ni pliometrie
    if (daysAgo <= 2 && distKm > 15) {
      warnings.push({
        type: 'avoid_force',
        message: `Sortie longue ${distKm.toFixed(0)}km (il y a ${daysAgo}j) → évite la force lourde et la pliométrie haute intensité`,
        avoid: ['force_lourde', 'pliometrie'],
        prefer: ['yoga_coureur', 'stretching', 'tronc'],
        severity: 'warn',
      });
    }

    // Course très longue (>25km) ou sortie D+ élevé en dernier 3j → récup prioritaire
    const dp = act.total_elevation_gain || 0;
    if (daysAgo <= 3 && (distKm > 25 || dp > 1500)) {
      warnings.push({
        type: 'post_long',
        message: `Course exigeante ${distKm.toFixed(0)}km / D+${dp}m → priorité récupération (mobilité ou stretching seulement)`,
        avoid: ['force_lourde', 'pliometrie', 'excentrique'],
        prefer: ['mobilite', 'yoga_coureur', 'stretching'],
        severity: 'alert',
      });
    }

    // Séance rapide hier (allure < 5min/km) → fatigue neuromusculaire
    const pace = distKm > 0 ? (act.moving_time / 60) / distKm : 99; // min/km
    if (daysAgo <= 1 && distKm > 3 && pace < 5) {
      warnings.push({
        type: 'quality_session',
        message: `Séance rapide hier (${pace.toFixed(2)} min/km) → fléchisseurs fatigués, préfère tronc ou yoga aujourd'hui`,
        avoid: ['pliometrie'],
        prefer: ['tronc', 'haut_corps', 'yoga_coureur'],
        severity: 'info',
      });
    }
  }

  // Deduplicate by type (keep most severe)
  const seen = {};
  return warnings.filter(w => {
    if (seen[w.type]) return false;
    seen[w.type] = true;
    return true;
  });
}

// ── AUTO-RÉGULATION ────────────────────────────────────────────────────────

export async function suggestNextLoad(userId, exerciseId) {
  const { data: recent } = await sb.from('renfo_exercise_log')
    .select('*')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .order('session_date', { ascending: false })
    .limit(3);

  if (!recent || recent.length === 0) return null;

  const last = recent[0];
  const currentLoad = last.load_kg;
  if (!currentLoad) return null;

  if (!last.completed_all_reps) {
    if (recent.length >= 2 && !recent[1].completed_all_reps)
      return Math.round(currentLoad * 0.95 / 1.25) * 1.25;
    return currentLoad;
  }

  // +4% arrondi au multiple de 1.25kg le plus proche (plancher 1.25kg)
  if (last.rpe <= 7) {
    const raw = currentLoad * 1.04;
    const inc = Math.max(1.25, Math.round((raw - currentLoad) / 1.25) * 1.25);
    return currentLoad + inc;
  }
  if (last.rpe === 8) return currentLoad;
  if (last.rpe === 9) return Math.round(currentLoad * 0.975 / 1.25) * 1.25;
  if (last.rpe >= 10) return Math.round(currentLoad * 0.95 / 1.25) * 1.25;
  return currentLoad;
}

export async function suggestNextVariant(userId, exerciseId, currentVariantId) {
  const { data: recent } = await sb.from('renfo_exercise_log')
    .select('rpe, load_variant')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .eq('variant_id', currentVariantId)
    .order('session_date', { ascending: false })
    .limit(3);

  if (!recent || recent.length < 3) return currentVariantId;

  const exo = RENFO_EXERCISES[exerciseId];
  if (!exo) return currentVariantId;
  const variants = [...exo.variants].sort((a, b) => a.priority - b.priority);
  const idx = variants.findIndex(v => v.id === currentVariantId);

  const allEasy = recent.every(r => r.rpe <= 7);
  const allHard = recent.filter(r => r.rpe >= 10).length >= 2;

  if (allEasy && idx < variants.length - 1) return variants[idx + 1].id;
  if (allHard && idx > 0) return variants[idx - 1].id;
  return currentVariantId;
}

// ── DÉTECTION PLATEAU ──────────────────────────────────────────────────────

export function daysBetween(dateA, dateB) {
  return Math.abs(new Date(dateA) - new Date(dateB)) / 86400000;
}

export async function checkPlateau(userId, exerciseId) {
  const { data: logs } = await sb.from('renfo_exercise_log')
    .select('session_date, e1rm')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .not('e1rm', 'is', null)
    .order('session_date', { ascending: false });

  if (!logs || logs.length < 6) return null;

  const now = logs[0];
  const threeWeeksAgo = logs.find(l => daysBetween(now.session_date, l.session_date) >= 21);
  const sixWeeksAgo   = logs.find(l => daysBetween(now.session_date, l.session_date) >= 42);

  if (sixWeeksAgo && now.e1rm <= sixWeeksAgo.e1rm)
    return { type: 'change_exercise', message: 'Plateau 6 semaines. Essaie de switcher d\'exercice (squat ↔ presse).' };

  if (threeWeeksAgo && now.e1rm <= threeWeeksAgo.e1rm)
    return { type: 'deload', message: 'Plateau 3 semaines. Semaine de deload recommandée (volume −30%, charges −10%).' };

  return null;
}

// ── JAUGE DOSAGE HEBDO ─────────────────────────────────────────────────────

export function weeklyImpactScore(sessionsLast7) {
  return sessionsLast7.reduce((sum, s) => {
    const w = RENFO_LOAD_WEIGHTS[s.focus] || 1.0;
    return sum + (s.duration_min || 30) * w;
  }, 0);
}

export function weeklyImpactZone(score, objectiveWeight) {
  if (score < 60)  return { zone: 'sous_dose',  label: 'Sous-dosé',          color: '#e74c3c' };
  if (score < 120) return { zone: 'maintien',   label: 'Maintien',           color: '#f39c12' };
  if (score < 180) return { zone: 'adaptation', label: 'Adaptation',         color: '#2ecc71' };
  if (score < 240) return { zone: 'optimal',    label: 'Optimal coureur',    color: '#27ae60' };
  return           { zone: 'surcharge',         label: 'Risque interférence',color: '#e67e22' };
}
