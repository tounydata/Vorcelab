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

export function getBestVariant(exercise, profile) {
  const eq = profile.equipment || {};
  const variants = [...exercise.variants].sort((a, b) => a.priority - b.priority);
  for (const v of variants) {
    if (v.required_equipment) {
      if (v.required_equipment.has_gym_access && !profile.has_gym_access) continue;
      if (v.required_equipment.barbell && !eq.barbell) continue;
      if (v.required_equipment.leg_press && !eq.leg_press) continue;
      if (v.required_equipment.bench && !eq.bench) continue;
      if (v.required_equipment.pullup_bar && !eq.pullup_bar) continue;
      if (v.required_equipment.step && !eq.step) continue;
      if (v.required_equipment.anchor_point && !eq.anchor_point) continue;
      if (v.required_equipment.bands && (!eq.bands || eq.bands.length === 0)) continue;
    }
    if (v.required_equipment_any) {
      const ok = v.required_equipment_any.some(req => {
        if (req.dumbbells_max_kg) return (eq.dumbbells_max_kg || 0) >= req.dumbbells_max_kg;
        if (req.kettlebell_max_kg) return (eq.kettlebell_max_kg || 0) >= req.kettlebell_max_kg;
        return false;
      });
      if (!ok) continue;
    }
    return v;
  }
  return variants[variants.length - 1];
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
  if (spw === 3) {
    const base = ['force_lourde', 'pliometrie', 'excentrique'];
    if (ow <= 30) return ['force_lourde', 'excentrique', 'mobilite'];
    return base;
  }
  if (spw === 4) return ['force_lourde', 'pliometrie', 'excentrique', 'tronc'];
  if (spw === 5) return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps'];
  return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps', 'mobilite'];
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
  const allExoIds = SESSION_EXERCISES[focus] || [];
  const maxExos = (focus === 'tronc' || focus === 'mobilite') ? 5 : 4;
  const weekNum = Math.floor(Date.now() / (7 * 86400000));
  const offset = weekNum % Math.max(1, allExoIds.length - maxExos + 1);
  const exoIds = allExoIds.slice(offset, offset + maxExos);
  const exercises = exoIds.map(id => {
    const exo = RENFO_EXERCISES[id];
    if (!exo) return null;
    const variant = getBestVariant(exo, profile);
    return {
      exercise_id: id,
      variant_id: variant.id,
      sets: variant.default_sets,
      reps: variant.default_reps,
      target_rpe: variant.target_rpe,
      rest_seconds: variant.rest_seconds,
      load_type: variant.load_type
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
