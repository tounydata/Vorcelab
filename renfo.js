// ============================================================
// VORCELAB — MODULE RENFORCEMENT MUSCULAIRE
// ============================================================

import { VLState, sb } from './app-state.js';
import { showToast } from './ui.js';
import {
  _SUPA_EXO, _GIF_REMOVED, getExerciseGifUrl, gifPlaceholder, fmtRest,
  RENFO_FOCUS_COLORS, RENFO_EXERCISES, INTER_SET_REST, SESSION_EXERCISES,
  FOCUS_META, RENFO_LOAD_WEIGHTS, RENFO_DAY_NAMES, RENFO_DAY_FR, DAYS,
} from './renfo-data.js';
import {
  epley1RM, getBestVariant, generateRenfoProgram,
  suggestNextLoad, suggestNextVariant, checkPlateau,
  weeklyImpactScore, weeklyImpactZone,
} from './renfo-program.js';

VLState.RENFO_FOCUS_COLORS = RENFO_FOCUS_COLORS;



// ── UI & STATE (renfo.js) ──────────────────────────────────────────────────

// RENFO MODULE
// ════════════════════════════════════════════════════

let renfoProfile = null;
let renfoProgram = null;
let renfoSessionLogs = [];
let _renfoOnboarding = { equipment: {} };

export async function preloadRenfoState() {
  if(!VLState.currentUser) return;
  const [{ data: prog }, { data: logs }] = await Promise.all([
    sb.from('renfo_program').select('*').eq('user_id', VLState.currentUser.id).maybeSingle(),
    sb.from('renfo_session_log').select('*').eq('user_id', VLState.currentUser.id),
  ]);
  VLState.renfoProgram = prog || null;
  VLState.renfoSessionLogs = logs || [];
  VLState.RENFO_FOCUS_COLORS = RENFO_FOCUS_COLORS;
}

export async function loadRenfoApp() {
  const el = document.getElementById('renfoApp');
  if (!el || !VLState.currentUser) return;
  el.innerHTML = `<div style="padding:48px 0;text-align:center;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem">Chargement…</div>`;

  const { data: profile } = await sb.from('renfo_profile').select('*').eq('user_id', VLState.currentUser.id).maybeSingle();
  renfoProfile = profile;

  if (!profile || !profile.onboarding_completed) {
    el.innerHTML = '';
    _renfoOnboarding = { equipment: {} };
    renderOnboardingStep(1);
    return;
  }

  const [{ data: program }, { data: logs }] = await Promise.all([
    sb.from('renfo_program').select('*').eq('user_id', VLState.currentUser.id).maybeSingle(),
    sb.from('renfo_session_log').select('*').eq('user_id', VLState.currentUser.id)
      .gte('session_date', new Date(Date.now() - 14*86400000).toISOString().slice(0,10))
      .order('session_date', { ascending: false })
  ]);

  renfoProgram = program;
  renfoSessionLogs = logs || [];
  VLState.renfoProgram = renfoProgram;
  VLState.renfoSessionLogs = renfoSessionLogs;
  renderRenfoHome();
  if (window._pendingRenfoFocus) {
    const f = window._pendingRenfoFocus; window._pendingRenfoFocus = null;
    const entry = Object.entries(renfoProgram?.week_schedule||{}).find(([,s])=>!s.rest&&s.focus===f);
    startRenfoSession(entry?.[0] || f);
  }
}

export function renderOnboardingStep(step) {
  const el = document.getElementById('renfoApp');
  if (!el) return;

  const obBtn = (v, type, title, sub) => `<button class="vl-ob-btn" data-val="${v}" data-type="${type}" onclick="Vorcelab.renfoObSelect(this)"
    style="text-align:left;padding:14px 16px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text);touch-action:manipulation;-webkit-tap-highlight-color:transparent;width:100%">
    <div style="font-family:var(--vl-display);font-size:1.05rem;font-weight:700;margin-bottom:3px">${title}</div>
    <div style="font-size:.73rem;color:var(--vl-text-2)">${sub}</div>
  </button>`;

  const eqLabel = (k, l) => `<label style="display:flex;align-items:center;gap:8px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:10px;padding:10px 12px;cursor:pointer;touch-action:manipulation">
    <input type="checkbox" onchange="renfoEquipSet('${k}',this.checked)" style="accent-color:var(--vl-ember);width:16px;height:16px;flex-shrink:0">
    <span style="font-size:.78rem;color:var(--vl-text)">${l}</span>
  </label>`;

  const contents = [null,
    `<div style="display:flex;flex-direction:column;gap:10px">
      ${obBtn(25,'obj','Renforcement préventif','Excentrique · Mobilité · Stabilité')}
      ${obBtn(75,'obj','Progresser en performance','Force lourde · Pliométrie · Économie de course')}
      ${obBtn(50,'obj','Les deux à parts égales','Programme équilibré')}
    </div>`,
    `<div style="display:flex;flex-direction:column;gap:10px">
      ${obBtn(1,'spw','1 séance / semaine','~50 min · Force lourde uniquement')}
      ${obBtn(3,'spw','2–3 séances / semaine ⭐','~35–50 min · Recommandé scientifique (Blagrove 2018)')}
      ${obBtn(5,'spw','4–5 séances / semaine','~30–40 min · Force + pliométrie + tronc + haut du corps')}
      ${obBtn(6,'spw','6 séances / semaine','~20–30 min · Format court quotidien')}
    </div>`,
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <div style="font-family:var(--vl-mono);font-size:.6rem;letter-spacing:.08em;color:var(--vl-text-2);margin-bottom:8px">À DOMICILE — disponible tous les jours</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${eqLabel('pullup_bar','Barre de traction')}
          ${eqLabel('step','Step / marche')}
          ${eqLabel('anchor_point','Point d\'ancrage')}
        </div>
        <div style="margin-top:8px">
          <div style="font-size:.73rem;color:var(--vl-text-2);margin-bottom:5px">Haltères — charge max : <strong id="dbVal">0</strong> kg</div>
          <input type="range" min="0" max="50" step="2.5" value="0" oninput="document.getElementById('dbVal').textContent=this.value;_renfoOnboarding.equipment.dumbbells_max_kg=+this.value" style="width:100%;accent-color:var(--vl-ember)">
        </div>
        <div style="margin-top:8px">
          <div style="font-size:.73rem;color:var(--vl-text-2);margin-bottom:5px">Kettlebell — charge max : <strong id="kbVal">0</strong> kg</div>
          <input type="range" min="0" max="40" step="4" value="0" oninput="document.getElementById('kbVal').textContent=this.value;_renfoOnboarding.equipment.kettlebell_max_kg=+this.value" style="width:100%;accent-color:var(--vl-ember)">
        </div>
        <div style="margin-top:8px">
          <div style="font-size:.73rem;color:var(--vl-text-2);margin-bottom:6px">Élastiques de résistance</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${['Léger','Moyen','Fort','Extra-fort'].map((b,i)=>{
              const val = ['light','medium','heavy','extra-heavy'][i];
              return `<button type="button" id="band-${val}" onclick="Vorcelab.renfoToggleBand(this,'${val}')"
                style="padding:7px 13px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:8px;cursor:pointer;font-size:.75rem;color:var(--vl-text);touch-action:manipulation;-webkit-tap-highlight-color:transparent">${b}</button>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div>
        <div style="font-family:var(--vl-mono);font-size:.6rem;letter-spacing:.08em;color:var(--vl-text-2);margin-bottom:8px">EN SALLE — si tu as accès à une salle</div>
        <label style="display:flex;align-items:center;gap:10px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:10px;padding:12px;cursor:pointer;touch-action:manipulation;margin-bottom:8px">
          <input type="checkbox" id="gymAccessCheck" onchange="renfoEquipSet('_gym',this.checked)" style="accent-color:var(--vl-ember);width:18px;height:18px;flex-shrink:0">
          <div>
            <div style="font-size:.82rem;color:var(--vl-text);font-weight:600">J'ai accès à une salle régulièrement</div>
            <div style="font-size:.7rem;color:var(--vl-text-2)">Débloque les variantes avec barres et machines</div>
          </div>
        </label>
        <div id="gymEquipSection" style="display:none;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${eqLabel('barbell','Barre + disques')}
          ${eqLabel('leg_press','Presse à cuisses')}
          ${eqLabel('bench','Banc')}
        </div>
      </div>
    </div>`
  ];

  const titles = [null, 'Ton objectif', 'Ton rythme', 'Ton matériel'];
  const subs   = [null,
    'Le programme s\'adaptera à ta priorité.',
    'Sois réaliste — 2 séances tenues valent mieux que 5 ratées.',
    'Le programme choisit automatiquement les meilleures variantes.'
  ];

  el.innerHTML = `<div style="padding:4px 0 24px">
    <div style="font-family:var(--vl-mono);font-size:.6rem;letter-spacing:.12em;color:var(--vl-ember);margin-bottom:8px">ÉTAPE ${step} / 3</div>
    <div style="font-family:var(--vl-display);font-size:1.8rem;font-weight:800;line-height:1.1;margin-bottom:6px">${titles[step]}</div>
    <div style="font-size:.8rem;color:var(--vl-text-2);margin-bottom:20px">${subs[step]}</div>
    ${contents[step]}
    <div style="display:flex;gap:10px;margin-top:24px">
      ${step > 1 ? `<button onclick="Vorcelab.renderOnboardingStep(${step-1})" style="flex:1;padding:14px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text);font-family:var(--vl-mono);touch-action:manipulation">← Retour</button>` : ''}
      ${step < 3
        ? `<button onclick="Vorcelab.renfoNextStep(${step})" style="flex:2;padding:14px;background:var(--vl-ember);border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-mono);font-weight:700;touch-action:manipulation">Suivant →</button>`
        : `<button onclick="Vorcelab.finishRenfoOnboarding()" style="flex:2;padding:14px;background:var(--vl-ember);border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-mono);font-weight:700;touch-action:manipulation">Générer mon programme →</button>`}
    </div>
  </div>`;
}

export function renfoNextStep(current) {
  if (current === 1 && _renfoOnboarding.objective_weight === undefined) {
    showToast('Choisis un objectif pour continuer', 'info'); return;
  }
  if (current === 2 && _renfoOnboarding.sessions_per_week === undefined) {
    showToast('Choisis un rythme de séances', 'info'); return;
  }
  renderOnboardingStep(current + 1);
}

function renfoEquipSet(key, val) {
  if (!_renfoOnboarding.equipment) _renfoOnboarding.equipment = {};
  if (key === '_gym') {
    _renfoOnboarding.has_gym_access = val;
    const sec = document.getElementById('gymEquipSection');
    if (sec) sec.style.display = val ? 'grid' : 'none';
  } else {
    _renfoOnboarding.equipment[key] = val;
  }
}

export function renfoObSelect(btn) {
  const type = btn.dataset.type;
  const val = +btn.dataset.val;
  document.querySelectorAll(`.vl-ob-btn[data-type="${type}"]`).forEach(b => {
    b.style.borderColor = 'var(--vl-border)';
    b.style.background = 'var(--vl-bg2)';
  });
  btn.style.borderColor = 'var(--vl-ember)';
  btn.style.background = 'rgba(229,86,42,.1)';
  if (type === 'obj') _renfoOnboarding.objective_weight = val;
  if (type === 'spw') _renfoOnboarding.sessions_per_week = val;
}

export function renfoToggleBand(btn, band) {
  if (!_renfoOnboarding.equipment) _renfoOnboarding.equipment = {};
  if (!_renfoOnboarding.equipment.bands) _renfoOnboarding.equipment.bands = [];
  const idx = _renfoOnboarding.equipment.bands.indexOf(band);
  if (idx === -1) {
    _renfoOnboarding.equipment.bands.push(band);
    btn.style.borderColor = 'var(--vl-ember)';
    btn.style.background = 'rgba(229,86,42,.1)';
  } else {
    _renfoOnboarding.equipment.bands.splice(idx, 1);
    btn.style.borderColor = 'var(--vl-border)';
    btn.style.background = 'var(--vl-bg2)';
  }
}

export async function finishRenfoOnboarding() {
  const el = document.getElementById('renfoApp');
  el.innerHTML = `<div style="padding:48px 0;text-align:center;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem">Génération du programme…</div>`;

  const profile = {
    user_id: VLState.currentUser.id,
    objective_weight: _renfoOnboarding.objective_weight || 50,
    sessions_per_week: _renfoOnboarding.sessions_per_week || 3,
    equipment: _renfoOnboarding.equipment || {},
    has_gym_access: _renfoOnboarding.has_gym_access || false,
    onboarding_completed: true
  };

  const { error: pe } = await sb.from('renfo_profile').upsert(profile);
  if (pe) { showToast('Erreur sauvegarde profil', 'error'); return; }
  renfoProfile = profile;

  const schedule = generateRenfoProgram(profile);
  const { error: re } = await sb.from('renfo_program').upsert({
    user_id: VLState.currentUser.id,
    week_schedule: schedule,
    generated_at: new Date().toISOString(),
    generation_inputs: profile
  });
  if (re) { showToast('Erreur génération programme', 'error'); return; }

  renfoProgram = { week_schedule: schedule };
  renfoSessionLogs = [];
  VLState.renfoProgram = renfoProgram;
  VLState.renfoSessionLogs = renfoSessionLogs;
  showToast('Programme généré 🎯', 'success');
  renderRenfoHome();
}

// ── Inline SVG icons ─────────────────────────────────────────────────────────
const _ICON_PLAY = `<svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor" style="display:block;flex-shrink:0"><path d="M0 0.5l9 5-9 5z"/></svg>`;
const _ICON_CHECK = `<svg width="13" height="10" viewBox="0 0 13 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0"><polyline points="1 5 5 9 12 1"/></svg>`;
const _ICON_GEAR = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const _ICON_CHEVRON = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M1 1l4 4 4-4"/></svg>`;
const _ICON_ARROW_LEFT = `<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M7 1L1 7l6 6"/></svg>`;


function _localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function _currentWeekStartStr() {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  return _localDateStr(weekStart);
}

function _findDoneLogForKey(dayKey) {
  const weekStartStr = _currentWeekStartStr();
  const session = renfoProgram?.week_schedule?.[dayKey];
  const focus = session?.focus || dayKey;
  return renfoSessionLogs.find(l =>
    l.session_date >= weekStartStr &&
    ((renfoProgram?.week_schedule?.[l.day_key]?.focus === focus) || l.day_key === dayKey)
  );
}

function _openRenfoDoneMenu(dayKey) {
  const session = renfoProgram?.week_schedule?.[dayKey];
  const label = session?.label || FOCUS_META[dayKey]?.label || dayKey;
  document.getElementById('renfoDoneMenu')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'renfoDoneMenu';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:8000;display:flex;align-items:flex-end;touch-action:none';
  overlay.innerHTML = `<div style="width:100%;background:var(--vl-bg2);border-radius:20px 20px 0 0;padding:20px 20px calc(32px + env(safe-area-inset-bottom,0px))" onclick="event.stopPropagation()">
    <div style="width:36px;height:4px;background:var(--vl-border);border-radius:2px;margin:0 auto 18px"></div>
    <div style="font-family:var(--vl-display);font-size:1.1rem;font-weight:700;margin-bottom:4px">${label}</div>
    <div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);margin-bottom:20px">Séance validée cette semaine</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button onclick="_changeDoneSessionDate('${dayKey}')" style="width:100%;padding:13px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text);font-family:var(--vl-mono);font-size:.75rem;touch-action:manipulation">Modifier la date</button>
      <button onclick="Vorcelab.cancelRenfoSession('${dayKey}')" style="width:100%;padding:13px;background:var(--vl-bg);border:1.5px solid rgba(239,68,68,.35);border-radius:12px;cursor:pointer;color:#ef4444;font-family:var(--vl-mono);font-size:.75rem;touch-action:manipulation">Annuler la validation</button>
      <button onclick="document.getElementById('renfoDoneMenu').remove()" style="width:100%;padding:11px;background:none;border:none;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.7rem;touch-action:manipulation">Fermer</button>
    </div>
  </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function _changeDoneSessionDate(dayKey) {
  const session = renfoProgram?.week_schedule?.[dayKey];
  const label = session?.label || FOCUS_META[dayKey]?.label || dayKey;
  const weekStartStr = _currentWeekStartStr();
  const todayStr = _localDateStr(new Date());
  const inner = document.querySelector('#renfoDoneMenu > div');
  if (!inner) return;
  inner.innerHTML = `
    <div style="width:36px;height:4px;background:var(--vl-border);border-radius:2px;margin:0 auto 18px"></div>
    <div style="font-family:var(--vl-display);font-size:1.1rem;font-weight:700;margin-bottom:4px">Modifier la date</div>
    <div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);margin-bottom:20px">Rétrodatage · semaine en cours (lun–dim)</div>
    <input id="renfoDoneDateInput" type="date" min="${weekStartStr}" max="${todayStr}" value="${todayStr}"
      style="width:100%;padding:12px;border:1.5px solid var(--vl-border);border-radius:10px;background:var(--vl-bg);color:var(--vl-text);font-family:var(--vl-mono);font-size:.85rem;margin-bottom:14px;box-sizing:border-box">
    <div style="display:flex;gap:10px">
      <button onclick="_openRenfoDoneMenu('${dayKey}')" style="flex:1;padding:12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:10px;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem;touch-action:manipulation">Annuler</button>
      <button onclick="_confirmDoneSessionDate('${dayKey}')" style="flex:1;padding:12px;background:#7c3aed;border:none;border-radius:10px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:.85rem;font-weight:700;touch-action:manipulation">Confirmer</button>
    </div>`;
}

async function _confirmDoneSessionDate(dayKey) {
  const session = renfoProgram?.week_schedule?.[dayKey];
  const focus = session?.focus || dayKey;
  const weekStartStr = _currentWeekStartStr();
  const todayStr = _localDateStr(new Date());
  const newDate = document.getElementById('renfoDoneDateInput')?.value;
  if (!newDate || newDate < weekStartStr || newDate > todayStr) {
    showToast('Date invalide', 'error'); return;
  }
  const log = _findDoneLogForKey(dayKey);
  if (!log) { showToast('Séance introuvable', 'error'); return; }
  if (log.session_date === newDate) { document.getElementById('renfoDoneMenu')?.remove(); return; }
  const { error: delErr } = await sb.from('renfo_session_log')
    .delete().eq('user_id', VLState.currentUser.id).eq('session_date', log.session_date);
  if (delErr) { showToast('Erreur modification', 'error'); return; }
  const { error: insErr } = await sb.from('renfo_session_log').upsert({
    user_id: VLState.currentUser.id, session_date: newDate,
    day_key: log.day_key, completed_exercises: log.completed_exercises
  }, { onConflict: 'user_id,session_date' });
  if (insErr) { showToast('Erreur modification', 'error'); return; }
  renfoSessionLogs = renfoSessionLogs.filter(l => l.session_date !== log.session_date);
  renfoSessionLogs.unshift({ ...log, session_date: newDate });
  VLState.renfoSessionLogs = renfoSessionLogs;
  document.getElementById('renfoDoneMenu')?.remove();
  showToast('Date modifiée', 'success');
  renderRenfoHome();
}

export function openRenfoSessionActions(dayKey) { _openRenfoDoneMenu(dayKey); }

export async function cancelRenfoSession(dayKey) {
  document.getElementById('renfoDoneMenu')?.remove();
  const log = _findDoneLogForKey(dayKey);
  if (!log) { showToast('Séance introuvable', 'error'); return; }
  const { error } = await sb.from('renfo_session_log')
    .delete()
    .eq('user_id', VLState.currentUser.id)
    .eq('session_date', log.session_date);
  if (error) { showToast('Erreur suppression', 'error'); return; }
  renfoSessionLogs = renfoSessionLogs.filter(l => l.session_date !== log.session_date);
  VLState.renfoSessionLogs = renfoSessionLogs;
  showToast('Validation annulée', 'success');
  renderRenfoHome();
}

function _renfoTabBar(active) {
  const tabs = [
    { id: 'programme',   label: 'Programme',   fn: 'Vorcelab.renderRenfoHome()' },
    { id: 'bibliotheque', label: 'Bibliothèque', fn: 'Vorcelab.showRenfoLibraryIndex()' },
    { id: 'reglages',    label: 'Réglages',     fn: 'Vorcelab.showRenfoSettings()' },
  ];
  return `<div style="display:flex;border-bottom:2px solid var(--vl-border);margin-bottom:16px">${
    tabs.map(t => `<button onclick="${t.fn}" style="background:none;border:none;border-bottom:3px solid ${active===t.id?'var(--vl-ember)':'transparent'};margin-bottom:-2px;color:${active===t.id?'var(--vl-ember)':'var(--vl-text-3)'};font-family:var(--vl-mono);font-size:12px;font-weight:600;letter-spacing:.06em;padding:10px 16px;cursor:pointer;text-transform:uppercase;transition:color .15s,border-color .15s;touch-action:manipulation">${t.label}</button>`).join('')
  }</div>`;
}

export function renderRenfoHome() {
  const el = document.getElementById('renfoApp');
  if (!el || !renfoProgram) return;

  const today = new Date();
  const todayMs = today.getTime();

  // Weekly done count
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = _localDateStr(weekStart);
  const thisWeekLogs = renfoSessionLogs.filter(l => l.session_date >= weekStartStr);

  // Load 7j
  const last7 = renfoSessionLogs.filter(l => (todayMs - new Date(l.session_date).getTime()) / 86400000 <= 7);
  const last7WithFocus = last7.map(l => ({
    focus: renfoProgram.week_schedule?.[l.day_key]?.focus || l.day_key || 'tronc',
    duration_min: renfoProgram.week_schedule?.[l.day_key]?.duration_min || FOCUS_META[l.day_key]?.duration_min || 30,
  }));
  const loadScore = weeklyImpactScore(last7WithFocus);
  const loadMax = 240;
  const loadPct = Math.min(100, loadScore / loadMax * 100).toFixed(1);
  const loadZone = weeklyImpactZone(loadScore, renfoProfile?.objective_weight || 50);

  // Focus → dayKey mapping from program
  const focusToDayKey = {};
  for (const [dk, s] of Object.entries(renfoProgram.week_schedule || {})) {
    if (!s.rest) focusToDayKey[s.focus] = dk;
  }

  // Per-focus: dernière fois + charge 30j
  const focusLastDate = {};
  const focusCount30 = {};
  for (const log of renfoSessionLogs) {
    const focus = renfoProgram.week_schedule?.[log.day_key]?.focus || log.day_key;
    if (!focus) continue;
    const ageDays = (todayMs - new Date(log.session_date).getTime()) / 86400000;
    if (!focusLastDate[focus] || log.session_date > focusLastDate[focus]) focusLastDate[focus] = log.session_date;
    if (ageDays <= 30) focusCount30[focus] = (focusCount30[focus] || 0) + 1;
  }

  const lastFmt = focus => {
    const d = focusLastDate[focus];
    if (!d) return 'jamais';
    const days = Math.round((todayMs - new Date(d).getTime()) / 86400000);
    if (days === 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    return `il y a ${days}j`;
  };

  const FOCUS_CARDS = [
    { key: 'force_lourde', sub: 'squat, soulevé, presse' },
    { key: 'pliometrie',   sub: 'bondissements, sauts' },
    { key: 'excentrique',  sub: 'descentes, freinages' },
    { key: 'tronc',        sub: 'gainage, anti-rotation' },
    { key: 'haut_corps',   sub: 'tractions, pompes' },
    { key: 'mobilite',     sub: 'hanches, chevilles' },
  ];

  const weekDoneFocuses = new Set(
    thisWeekLogs.map(l => renfoProgram.week_schedule?.[l.day_key]?.focus || l.day_key).filter(Boolean)
  );

  const cards = FOCUS_CARDS.map(f => {
    const meta = FOCUS_META[f.key];
    const exoCount = SESSION_EXERCISES[f.key]?.length || 4;
    const maxExos = (f.key === 'tronc' || f.key === 'mobilite') ? 5 : 4;
    const dayKey = focusToDayKey[f.key] || f.key;
    const dur = renfoProfile?.sessions_per_week >= 5 ? meta.duration_short : meta.duration_min;
    const count30 = focusCount30[f.key] || 0;
    const chargePct = Math.min(100, count30 / 4 * 100);
    const done = weekDoneFocuses.has(f.key);
    return `
      <div style="display:flex;flex-direction:column;gap:8px;padding:13px;background:var(--vl-bg2);border:1.5px solid ${done ? '#7c3aed60' : '#7c3aed40'};border-radius:12px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:border-color .15s;position:relative;cursor:pointer" onclick="Vorcelab.startRenfoSession('${dayKey}')" onmouseover="this.style.borderColor='#7c3aed'" onmouseout="this.style.borderColor='${done ? '#7c3aed60' : '#7c3aed40'}'">
        ${done ? `<button onclick="event.stopPropagation();_openRenfoDoneMenu('${dayKey}')" style="position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;font-size:1rem;color:var(--vl-text-2);padding:2px 6px;touch-action:manipulation;line-height:1">···</button>` : ''}
        <div>
          <div style="font-family:var(--vl-display);font-size:1rem;font-weight:700;line-height:1.1">${meta.label}</div>
          <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-top:3px">${f.sub}</div>
        </div>
        <div style="display:flex;gap:10px;font-size:.75rem">
          <div><div style="font-family:var(--vl-mono);font-size:.48rem;color:var(--vl-text-2);letter-spacing:.05em">DURÉE</div><div style="font-weight:600">${dur} min</div></div>
          <div><div style="font-family:var(--vl-mono);font-size:.48rem;color:var(--vl-text-2);letter-spacing:.05em">EXOS</div><div style="font-weight:600">${Math.min(exoCount, maxExos)}</div></div>
          <div><div style="font-family:var(--vl-mono);font-size:.48rem;color:var(--vl-text-2);letter-spacing:.05em">DERNIÈRE</div><div style="font-weight:600">${lastFmt(f.key)}</div></div>
        </div>
        <div>
          <div style="height:4px;background:var(--vl-bg);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${chargePct}%;background:#7c3aed;border-radius:2px;transition:width .4s"></div>
          </div>
          <div style="font-family:var(--vl-mono);font-size:.48rem;color:var(--vl-text-2);margin-top:3px">CHARGE 30J · ${count30}/4</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
          <div style="flex:1;padding:8px 0;text-align:center;border:1.5px solid #7c3aed;border-radius:8px;font-family:var(--vl-display);font-size:.82rem;font-weight:700;color:#7c3aed">VOIR LA SÉANCE</div>
          ${done ? `<div style="padding:5px 8px;background:rgba(124,58,237,.15);border-radius:6px;font-family:var(--vl-mono);font-size:.48rem;font-weight:700;color:#7c3aed;letter-spacing:.06em;white-space:nowrap">FAIT</div>` : ''}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `<div style="padding-bottom:8px">
    ${_renfoTabBar('programme')}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
      <div>
        <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);letter-spacing:.1em">SEM. · ${thisWeekLogs.length} SÉANCE${thisWeekLogs.length!==1?'S':''} FAITE${thisWeekLogs.length!==1?'S':''}</div>
        <div style="font-family:var(--vl-display);font-size:1.8rem;font-weight:800;line-height:1;margin-top:2px">QU'EST-CE QU'ON FAIT ?</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-2);letter-spacing:.05em">CHARGE 7J</div>
        <div style="margin-top:4px;width:120px;height:5px;background:var(--vl-bg);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${loadPct}%;background:${loadZone.color};border-radius:3px"></div>
        </div>
        <div style="font-family:var(--vl-mono);font-size:.48rem;color:var(--vl-text-2);margin-top:3px">${loadScore} unités · <span style="color:${loadZone.color}">${loadZone.label}</span></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-bottom:14px">
      ${cards}
    </div>

  </div>`;
}

export async function startRenfoSession(dayKey) {
  const el = document.getElementById('renfoApp');
  if (!el || !renfoProgram) return;
  let session = renfoProgram.week_schedule?.[dayKey];
  if (!session || session.rest) {
    if (FOCUS_META[dayKey]) {
      session = buildSession(dayKey, renfoProfile || {});
      if (!session) return;
    } else {
      return;
    }
  }

  const suggestions = {};
  if (VLState.currentUser) {
    await Promise.all(
      session.exercises
        .filter(e => e.load_type === 'external_kg')
        .map(async e => {
          const kg = await suggestNextLoad(VLState.currentUser.id, e.exercise_id);
          if (kg !== null) suggestions[e.exercise_id] = kg;
        })
    );
  }

  const state = {
    dayKey, session,
    exoIdx: 0, serieIdx: 0,
    startTime: Date.now(),
    completedExos: {},
    suggestions,
  };
  // Prevent same focus twice in same calendar week (except mobilité)
  if (session.focus !== 'mobilite') {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const alreadyDone = renfoSessionLogs.some(l => {
      const logFocus = renfoProgram?.week_schedule?.[l.day_key]?.focus || l.day_key;
      return new Date(l.session_date) >= weekStart && logFocus === session.focus;
    });
    state.alreadyDone = alreadyDone;
  }

  window._renfoSessionState = state;
  window._renfoSessionCompleted = state.completedExos;
  window._renfoSessionDayKey = dayKey;

  // Mobilité : pas d'échauffement
  if (session.focus === 'mobilite') {
    _renderSessionExo();
  } else {
    _renderSessionWarmup();
  }
}

const _WARMUP_TEXT = {
  force_lourde: 'Footing léger 3min → montées de genoux 30s → talons-fesses 30s → squat profond ×10 → rotation de buste ×10/côté',
  pliometrie:   'Footing léger 3min → skip ×20m → sauts à cloche-pied ×10/côté → squat sauté ×5 → cercles chevilles ×10',
  excentrique:  'Vélo ou marche rapide 5min → étirements dynamiques mollets → nordic curl partiel ×5 → hip flexor stretch 30s/côté',
  tronc:        'Marche rapide 3min → rotations de buste ×10 → cat-cow ×10 → planche 20s×2 → bird-dog ×5/côté',
  haut_corps:   'Footing léger 2min → cercles d\'épaules ×10 → pompes légères ×5 → face pull élastique ×10 → bras croisés 30s/côté',
};

function _getPreviewExercisesForLoc(exercises, loc) {
  if (loc !== 'maison') return exercises.map(e => ({ ...e, _previewName: null }));
  const homeProfile = { ...renfoProfile, has_gym_access: false };
  return exercises.map(exo => {
    const def = RENFO_EXERCISES[exo.exercise_id];
    if (!def) return { ...exo, _previewName: null };
    const hv = getBestVariant(def, homeProfile);
    return { ...exo, _previewName: hv?.name || null };
  });
}

function _renderSessionWarmup() {
  const el = document.getElementById('renfoApp');
  const state = window._renfoSessionState;
  if (!el || !state) return;
  const { session } = state;
  const loc = state.location || 'salle';

  const warmupText = _WARMUP_TEXT[session.focus] || _WARMUP_TEXT.force_lourde;
  const previewExos = _getPreviewExercisesForLoc(session.exercises, loc);

  const btnBase = 'flex:1;padding:14px 10px;border-radius:12px;cursor:pointer;font-family:var(--vl-display);font-size:.95rem;font-weight:800;touch-action:manipulation;text-align:center;-webkit-tap-highlight-color:transparent;border:2px solid';
  const maisonSel = loc === 'maison';

  el.innerHTML = `<div style="display:flex;flex-direction:column;min-height:100%;padding-bottom:4px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
      <button onclick="Vorcelab.renderRenfoHome()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:4px;touch-action:manipulation;font-size:1.1rem">←</button>
      <div style="font-family:var(--vl-mono);font-size:.55rem;color:#7c3aed;letter-spacing:.1em">${(session.focus||'').replace(/_/g,' ').toUpperCase()} · ~${session.duration_min} MIN</div>
    </div>
    <div style="font-family:var(--vl-display);font-size:1.8rem;font-weight:800;line-height:1;margin-bottom:6px">${session.label}</div>
    <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-bottom:20px">${session.exercises.length} exercices</div>
    <div class="card" style="padding:14px;background:rgba(124,58,237,.05);border-color:rgba(124,58,237,.2);margin-bottom:16px">
      <div style="font-family:var(--vl-mono);font-size:.6rem;color:#7c3aed;margin-bottom:8px;letter-spacing:.08em">ÉCHAUFFEMENT (5–8 MIN)</div>
      <div style="font-size:.8rem;color:var(--vl-text-2);line-height:1.5">${warmupText}</div>
    </div>
    <div style="font-family:var(--vl-mono);font-size:.52rem;color:var(--vl-text-2);margin-bottom:8px;letter-spacing:.05em;text-align:center">OÙ S'ENTRAÎNER ?</div>
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <button onclick="_chooseLocation('maison')" style="${btnBase} ${maisonSel ? 'var(--color-renfo,#a78bfa);background:var(--color-renfo,#a78bfa);color:var(--vl-ink,#15161a)' : 'var(--vl-line-2);background:transparent;color:var(--vl-text-2)'}">
        <div style="font-size:.52rem;font-family:var(--vl-mono);opacity:.75;margin-bottom:3px;letter-spacing:.05em">DOMICILE</div>MAISON
      </button>
      <button onclick="_chooseLocation('salle')" style="${btnBase} ${!maisonSel ? 'var(--color-renfo,#a78bfa);background:var(--color-renfo,#a78bfa);color:var(--vl-ink,#15161a)' : 'var(--vl-line-2);background:transparent;color:var(--vl-text-2)'}">
        <div style="font-size:.52rem;font-family:var(--vl-mono);opacity:.75;margin-bottom:3px;letter-spacing:.05em">AVEC ÉQUIPEMENT</div>SALLE
      </button>
    </div>
    <div class="card" style="padding:12px;margin-bottom:16px">
      <div style="font-family:var(--vl-mono);font-size:.52rem;color:var(--vl-text-2);margin-bottom:8px;letter-spacing:.08em">EXERCICES ${maisonSel ? '· variantes maison' : ''}</div>
      ${previewExos.map((e, i) => {
        const d = RENFO_EXERCISES[e.exercise_id];
        const variantLabel = e._previewName || (d?.variants?.find(vv => vv.id === e.variant_id) || d?.variants?.[0])?.name || '';
        return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;${i<previewExos.length-1?'border-bottom:1px dashed var(--vl-border)':''}">
          <div style="font-size:.8rem">${d?.name_fr || e.exercise_id}${variantLabel ? `<span style="font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-3);margin-left:5px">${variantLabel}</span>` : ''}</div>
          <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);flex-shrink:0;margin-left:8px">${e.sets}×${e.reps} · RPE ${e.target_rpe}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="flex:1;min-height:8px"></div>
    ${state.alreadyDone
      ? `<button disabled style="width:100%;padding:18px;background:var(--vl-surf-3,#2d2e35);border:none;border-radius:14px;color:var(--vl-text-3);font-family:var(--vl-display);font-size:1.1rem;font-weight:800;letter-spacing:.04em;cursor:not-allowed;display:flex;flex-direction:column;align-items:center;gap:4px">
          <span>LANCER LA SÉANCE</span>
          <span style="font-family:var(--vl-mono);font-size:.52rem;font-weight:400;letter-spacing:.06em">DÉJÀ FAIT CETTE SEMAINE</span>
        </button>`
      : `<button onclick="_launchSession()" style="width:100%;padding:18px;background:var(--color-renfo,#a78bfa);border:none;border-radius:var(--vl-r-sm,10px);cursor:pointer;color:var(--vl-ink,#15161a);font-family:var(--vl-display);font-size:1.1rem;font-weight:800;letter-spacing:.04em;touch-action:manipulation">
          LANCER LA SÉANCE →
        </button>`
    }
  </div>`;
}

const _EQUIP_LABELS = {
  barbell: 'Barre + disques',
  leg_press: 'Presse à cuisses',
  bench: 'Banc de musculation',
  pullup_bar: 'Barre de traction',
  step: 'Step / marche (20-40cm)',
  anchor_point: 'Point d\'ancrage élastique',
  bands: 'Élastiques de résistance',
  dumbbells: 'Haltères',
  kettlebell: 'Kettlebell',
};

function _chooseLocation(loc) {
  const state = window._renfoSessionState;
  if (!state) return;
  state.location = loc;
  _renderSessionWarmup();
}

function _launchSession() {
  const state = window._renfoSessionState;
  if (!state) return;
  const loc = state.location || 'salle';
  if (loc === 'maison') {
    const homeProfile = { ...renfoProfile, has_gym_access: false };
    const equipNeeded = new Set();
    state.session.exercises = state.session.exercises.map(exo => {
      const def = RENFO_EXERCISES[exo.exercise_id];
      if (!def) return exo;
      const homeVariant = getBestVariant(def, homeProfile);
      const req = homeVariant.required_equipment || {};
      const reqAny = homeVariant.required_equipment_any || [];
      if (req.bands) equipNeeded.add('bands');
      if (req.pullup_bar) equipNeeded.add('pullup_bar');
      if (req.step) equipNeeded.add('step');
      if (req.anchor_point) equipNeeded.add('anchor_point');
      if (req.bench) equipNeeded.add('bench');
      if (reqAny.length) {
        const eq = renfoProfile?.equipment || {};
        if (reqAny.some(r => r.dumbbells_max_kg && (eq.dumbbells_max_kg || 0) >= r.dumbbells_max_kg)) equipNeeded.add('dumbbells');
        else if (reqAny.some(r => r.kettlebell_max_kg && (eq.kettlebell_max_kg || 0) >= r.kettlebell_max_kg)) equipNeeded.add('kettlebell');
      }
      return { ...exo, variant_id: homeVariant.id };
    });
    if (equipNeeded.size > 0) {
      _renderEquipmentPrep([...equipNeeded]);
    } else {
      _renderSessionExo();
    }
  } else {
    _renderSessionExo();
  }
}

function _renderEquipmentPrep(equipList) {
  const el = document.getElementById('renfoApp');
  if (!el) return;
  const state = window._renfoSessionState;
  el.innerHTML = `<div style="display:flex;flex-direction:column;min-height:100%;padding-bottom:4px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
      <button onclick="_renderSessionWarmup()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:4px;touch-action:manipulation;font-size:1.1rem">←</button>
      <div style="font-family:var(--vl-mono);font-size:.55rem;color:#7c3aed;letter-spacing:.1em">PRÉPARATION SÉANCE</div>
    </div>
    <div style="font-family:var(--vl-display);font-size:1.5rem;font-weight:800;margin-bottom:4px">Matériel à sortir</div>
    <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-bottom:20px">Pour ta séance à la maison · ${state?.session?.label || ''}</div>
    <div class="card" style="padding:14px;margin-bottom:16px">
      ${equipList.map(e => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px dashed var(--vl-border)">
        <div style="width:20px;height:20px;border:1.5px solid var(--vl-border);border-radius:4px;flex-shrink:0"></div>
        <div style="font-size:.85rem">${_EQUIP_LABELS[e] || e}</div>
      </div>`).join('')}
    </div>
    <div style="flex:1;min-height:16px"></div>
    <button onclick="_renderSessionExo()" style="width:100%;padding:18px;background:#7c3aed;border:none;border-radius:14px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:1.1rem;font-weight:800;letter-spacing:.04em;touch-action:manipulation">
      C'EST PRÊT →
    </button>
  </div>`;
}

function _renderSessionExo() {
  const el = document.getElementById('renfoApp');
  const state = window._renfoSessionState;
  if (!el || !state) return;

  const { session, exoIdx, serieIdx, dayKey } = state;
  const exos = session.exercises;
  const exo = exos[exoIdx];
  if (!exo) { openCompletionPicker(dayKey); return; }

  const def = RENFO_EXERCISES[exo.exercise_id];
  if (!def) { state.exoIdx++; _renderSessionExo(); return; }
  const variant = def.variants.find(v => v.id === exo.variant_id) || def.variants[0];
  const totalSets = exo.sets;
  const isLastSerie = serieIdx >= totalSets - 1;
  const isLastExo = exoIdx >= exos.length - 1;
  const interSetRest = INTER_SET_REST[exo.exercise_id] || 90;
  const interExoRest = variant?.rest_seconds || 90;
  const hasPrev = exoIdx > 0 || serieIdx > 0;

  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const elapsedFmt = `${Math.floor(elapsed/60)}:${(elapsed%60).toString().padStart(2,'0')}`;

  const dotsHtml = exos.map((e, i) => {
    const sets = e.sets;
    const doneSets = i < exoIdx ? sets : (i === exoIdx ? serieIdx : 0);
    const isActive = i === exoIdx;
    return `<div style="flex:${sets};display:flex;gap:2px">${
      Array.from({length: sets}, (_, j) => {
        const done = j < doneSets;
        const active = isActive && j === serieIdx;
        return `<div style="flex:1;height:6px;border-radius:1px;background:${done?'#7c3aed':active?'transparent':'var(--vl-bg)'};${active?'border:1.5px solid #7c3aed':''}"></div>`;
      }).join('')
    }</div>`;
  }).join('');

  const suggested = state.suggestions[exo.exercise_id];
  let loadHtml = '';
  if (exo.load_type === 'external_kg') {
    loadHtml = `<div style="margin-bottom:14px">
      <div style="font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-2);margin-bottom:6px;letter-spacing:.05em">CHARGE</div>
      <input id="sess-load" type="number" inputmode="decimal" step="2.5" min="0"
        placeholder="${suggested ? suggested + ' kg (suggéré)' : 'Charge en kg…'}"
        ${suggested ? `value="${suggested}"` : ''}
        style="width:100%;padding:11px 14px;background:var(--vl-bg);border:1.5px solid #7c3aed40;border-radius:8px;color:var(--vl-text);font-size:1.1rem;box-sizing:border-box;font-weight:600">
    </div>`;
  } else {
    const loadLabel = exo.load_type === 'band' ? 'Élastique' : 'Poids de corps';
    loadHtml = `<div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-bottom:14px">${loadLabel}</div>`;
  }

  el.innerHTML = `<div style="display:flex;flex-direction:column;min-height:100%;padding-bottom:4px">
    <div style="display:flex;gap:4px;margin-bottom:6px">${dotsHtml}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px">
        <button onclick="Vorcelab.renderRenfoHome()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:4px;touch-action:manipulation;font-size:1.1rem">←</button>
        <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2)">EXO ${exoIdx+1}/${exos.length} · SÉRIE ${serieIdx+1}/${totalSets}</div>
      </div>
      <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2)">${elapsedFmt}</div>
    </div>

    <div style="margin-bottom:18px">
      <div style="margin-bottom:10px">
        <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--color-renfo,#a78bfa);letter-spacing:.1em;margin-bottom:4px">EN COURS</div>
        <div style="font-family:var(--vl-display);font-size:clamp(1.8rem,7vw,2.6rem);font-weight:800;line-height:1;text-transform:uppercase">${def.name_fr}</div>
        ${def.primary_muscles?.length ? `<div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);margin-top:6px">${def.primary_muscles.slice(0,3).join(' · ')}</div>` : ''}
        ${def.variants.length > 1
          ? `<button onclick="Vorcelab.showVariantPicker('${exo.exercise_id}')" style="margin-top:6px;padding:3px 8px;background:transparent;border:1px solid var(--vl-line-2);border-radius:5px;cursor:pointer;font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-2);touch-action:manipulation">${variant.name}</button>`
          : `<div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-top:4px">${variant.name}</div>`}
      </div>
      ${(g=>g?`<div style="border-radius:10px;overflow:hidden;border:1px solid var(--vl-line);background:var(--vl-surf-2);line-height:0"><img src="${g}" alt="" style="width:100%;max-height:200px;object-fit:contain;display:block" onerror="this.parentElement.style.display='none'"></div>`:``)(getExerciseGifUrl(exo.exercise_id))}
    </div>

    <div style="display:flex;gap:24px;margin-bottom:18px">
      <div>
        <div style="font-family:var(--vl-mono);font-size:.48rem;color:var(--vl-text-2);letter-spacing:.05em;margin-bottom:2px">CIBLE</div>
        <div style="font-family:var(--vl-display);font-size:2.2rem;font-weight:800;line-height:1">${exo.reps}<span style="font-size:.8rem;font-weight:500;margin-left:4px">REPS</span></div>
      </div>
      <div>
        <div style="font-family:var(--vl-mono);font-size:.48rem;color:var(--vl-text-2);letter-spacing:.05em;margin-bottom:2px">RPE</div>
        <div style="font-family:var(--vl-display);font-size:2.2rem;font-weight:800;line-height:1;color:#7c3aed">${exo.target_rpe}</div>
      </div>
      <div>
        <div style="font-family:var(--vl-mono);font-size:.48rem;color:var(--vl-text-2);letter-spacing:.05em;margin-bottom:2px">REPOS</div>
        <div style="font-family:var(--vl-display);font-size:2.2rem;font-weight:800;line-height:1">${fmtRest(isLastSerie ? interExoRest : interSetRest)}</div>
      </div>
    </div>

    ${loadHtml}

    <button id="sess-cta" onclick="_serieComplete()" style="width:100%;padding:20px;background:rgba(124,58,237,.1);border:2px solid #7c3aed;border-radius:14px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;margin-bottom:4px">
      <div style="font-family:var(--vl-mono);font-size:.5rem;color:#7c3aed;margin-bottom:4px;letter-spacing:.1em">QUAND C'EST FAIT, TAPE ICI</div>
      <div style="font-family:var(--vl-display);font-size:1.6rem;font-weight:800;color:#7c3aed;letter-spacing:.02em">SÉRIE FAITE ✓</div>
    </button>

    <button onclick="_toggleSessDetail()" style="margin-top:10px;background:none;border:none;cursor:pointer;font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);padding:0;touch-action:manipulation;display:flex;align-items:center;gap:5px">${_ICON_CHEVRON} comment faire ?</button>
    <div id="sess-detail" style="display:none;margin-top:8px;padding:10px;background:var(--vl-bg2);border-radius:8px;border:1px solid var(--vl-border)">
      <div style="font-size:.72rem;color:var(--vl-text-2);margin-bottom:6px"><strong style="color:var(--vl-text)">Position</strong><br>${def.position}</div>
      <div style="margin-bottom:6px"><strong style="font-size:.72rem;color:var(--vl-text)">Mouvement</strong>
        ${(def.movement||'').split(/\.\s+/).filter(Boolean).map((s,i)=>`<div style="display:flex;gap:6px;padding:2px 0"><div style="font-family:var(--vl-mono);font-size:.5rem;color:#7c3aed;min-width:14px;padding-top:3px">${i+1}.</div><div style="font-size:.7rem;color:var(--vl-text-2);line-height:1.4">${s.replace(/\.$/,'')}</div></div>`).join('')}
      </div>
      ${def.common_errors ? `<div style="font-size:.72rem;color:#7c3aed"><strong>Erreurs fréquentes</strong><br>${def.common_errors}</div>` : ''}
      <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(def.youtube_search)}" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;background:rgba(255,0,0,.1);border:1px solid rgba(255,0,0,.3);border-radius:6px;padding:5px 10px;font-family:var(--vl-mono);font-size:.55rem;color:#ff4444;text-decoration:none">${_ICON_PLAY} YouTube</a>
    </div>

    <div style="flex:1;min-height:12px"></div>

    <div style="display:flex;gap:6px;margin-top:10px">
      <button onclick="_prevSessionUnit()" ${!hasPrev?'disabled':''} style="flex:1;padding:10px 4px;border:1.5px solid var(--vl-border);border-radius:8px;background:transparent;cursor:pointer;font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);touch-action:manipulation${!hasPrev?';opacity:.3':''}">← précédent</button>
      <button onclick="_nextSessionUnit()" style="flex:1;padding:10px 4px;border:1.5px solid var(--vl-border);border-radius:8px;background:transparent;cursor:pointer;font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);touch-action:manipulation">exercice suivant →</button>
    </div>
  </div>`;

}

function _toggleSessDetail() {
  const d = document.getElementById('sess-detail');
  if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

function _prevSessionUnit() {
  const state = window._renfoSessionState;
  if (!state) return;
  if (state.serieIdx > 0) {
    state.serieIdx--;
  } else if (state.exoIdx > 0) {
    state.exoIdx--;
    state.serieIdx = 0;
  }
  _renderSessionExo();
}

function _nextSessionUnit() {
  const state = window._renfoSessionState;
  if (!state) return;
  const exo = state.session.exercises[state.exoIdx];
  if (!exo) return;
  if (state.serieIdx < exo.sets - 1) {
    state.serieIdx++;
  } else if (state.exoIdx < state.session.exercises.length - 1) {
    state.exoIdx++;
    state.serieIdx = 0;
  } else {
    openCompletionPicker(state.dayKey);
    return;
  }
  _renderSessionExo();
}

function _serieComplete() {
  const state = window._renfoSessionState;
  if (!state) return;
  const exo = state.session.exercises[state.exoIdx];
  if (!exo) return;

  // Pre-warm AudioContext within user gesture (required on iOS)
  if (!window._renfoAudioCtx) {
    try { window._renfoAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  window._renfoAudioCtx?.resume?.();

  const isLastSerie = state.serieIdx >= exo.sets - 1;
  const isLastExo = state.exoIdx >= state.session.exercises.length - 1;
  const def = RENFO_EXERCISES[exo.exercise_id];
  const variant = def?.variants?.find(v => v.id === exo.variant_id) || def?.variants?.[0];
  const interSetRest = INTER_SET_REST[exo.exercise_id] || 90;
  const interExoRest = variant?.rest_seconds || 90;

  // Capture load input value if present
  const loadInput = document.getElementById('sess-load');
  if (loadInput?.value) state.suggestions[exo.exercise_id] = parseFloat(loadInput.value);

  if (isLastSerie) {
    // Last serie → log popup → then advance
    window._renfoAfterLog = () => {
      if (isLastExo) {
        openCompletionPicker(state.dayKey);
      } else {
        state.exoIdx++;
        state.serieIdx = 0;
        const nextExo = state.session.exercises[state.exoIdx];
        const nextDef = nextExo ? RENFO_EXERCISES[nextExo.exercise_id] : null;
        startRestTimer(interExoRest, 'exo', nextDef?.name_fr || null);
        window._renfoRestOnDismiss = () => _renderSessionExo();
      }
    };
    showRenfoLogPopup(exo.exercise_id, exo.variant_id, exo.load_type, state.suggestions[exo.exercise_id] || null);
  } else {
    // Not last serie → inter-set rest → same exercise next serie
    state.serieIdx++;
    startRestTimer(interSetRest, 'set', `Série ${state.serieIdx + 1}/${exo.sets}`);
    window._renfoRestOnDismiss = () => _renderSessionExo();
  }
}

// Expose session helpers to window for inline onclick
window._renderSessionExo = _renderSessionExo;
window._renderSessionWarmup = _renderSessionWarmup;
window._serieComplete = _serieComplete;
window._prevSessionUnit = _prevSessionUnit;
window._nextSessionUnit = _nextSessionUnit;
window._toggleSessDetail = _toggleSessDetail;
window._chooseLocation = _chooseLocation;
window._launchSession = _launchSession;
window._renderEquipmentPrep = _renderEquipmentPrep;
window._openRenfoDoneMenu = _openRenfoDoneMenu;
window._changeDoneSessionDate = _changeDoneSessionDate;
window._confirmDoneSessionDate = _confirmDoneSessionDate;

export function toggleExoDetail(exerciseId) {
  const d = document.getElementById('exo-detail-' + exerciseId);
  if (!d) return;
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

export function toggleExoCheck(exerciseId, variantId, loadType) {
  const btn = document.getElementById('chk-' + exerciseId);
  if (!btn) return;
  const isChecked = btn.dataset.checked === '1';
  if (!isChecked) {
    showRenfoLogPopup(exerciseId, variantId, loadType);
  } else {
    btn.dataset.checked = '0';
    btn.style.borderColor = 'var(--vl-border)';
    btn.style.background = 'transparent';
    btn.style.color = 'transparent';
    if (window._renfoSessionCompleted) delete window._renfoSessionCompleted[exerciseId];
  }
}

export function validateExoWithLoad(exerciseId, variantId, loadType) {
  const inputEl = document.getElementById('load-' + exerciseId);
  const prefillLoad = inputEl ? (parseFloat(inputEl.value) || null) : null;
  showRenfoLogPopup(exerciseId, variantId, loadType, prefillLoad);
}

function fmtCountdown(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${s}s`;
}


export function startRestTimer(secs, type = 'set', nextLabel = null) {
  clearInterval(window._renfoRestTimer);
  const existing = document.getElementById('renfoRestOverlay');
  if (existing) existing.remove();

  // WebAudio bip — shared context (iOS requires user-gesture to unlock)
  function playBip(freq = 880, dur = 0.18) {
    try {
      if (!window._renfoAudioCtx) {
        window._renfoAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = window._renfoAudioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(); osc.stop(ctx.currentTime + dur);
    } catch(e) {}
  }

  const typeLabel = type === 'exo' ? 'REPOS ENTRE EXERCICES' : 'REPOS ENTRE SÉRIES';
  const overlay = document.createElement('div');
  overlay.id = 'renfoRestOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:#0E0D0A;z-index:9500;display:flex;flex-direction:column;touch-action:none';

  const fmtTimer = s => { const m = Math.floor(s/60), r = s%60; return m > 0 ? `${m}:${r.toString().padStart(2,'0')}` : `0:${s.toString().padStart(2,'0')}`; };

  overlay.innerHTML = `
    <div style="padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-family:var(--vl-mono);font-size:.6rem;color:#666;letter-spacing:.1em">${typeLabel}</div>
      <button id="renfoRestClose" style="background:none;border:none;cursor:pointer;color:#666;font-family:var(--vl-mono);font-size:.7rem;padding:4px 8px;touch-action:manipulation">×</button>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px">
      <div id="renfoRestTimer" style="font-family:'Oswald',var(--vl-display),sans-serif;font-size:clamp(100px,28vw,160px);font-weight:600;color:#F3EFE4;line-height:0.9;letter-spacing:-4px">${fmtTimer(secs)}</div>
      <div style="font-family:var(--vl-mono);font-size:.6rem;color:#666">SUR ${fmtTimer(secs)}</div>
      <div style="width:min(280px,70vw);height:4px;background:#1a1a1a;border-radius:2px;overflow:hidden;margin-top:4px">
        <div id="renfoRestBar2" style="height:100%;width:100%;background:#7c3aed;border-radius:2px;transition:width .9s linear"></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
        <span id="renfoRestBipBadge" style="display:none;align-items:center;gap:4px;padding:4px 8px;border:1px solid #7c3aed;border-radius:3px">
          <span style="width:6px;height:6px;background:#7c3aed;border-radius:50%;display:inline-block"></span>
          <span style="font-family:var(--vl-mono);font-size:.55rem;color:#7c3aed">BIP ×3 SUR LES 3 DERNIÈRES SEC.</span>
        </span>
        <span style="padding:4px 8px;background:#7c3aed;border-radius:3px;font-family:var(--vl-mono);font-size:.55rem;color:#fff">⏱ AUTO →</span>
      </div>
      ${nextLabel ? `<div style="margin-top:8px;text-align:center"><div style="font-family:var(--vl-mono);font-size:.55rem;color:#666">${type==='exo'?'EXERCICE SUIVANT':'SÉRIE SUIVANTE'}</div><div style="font-family:var(--vl-display);font-size:1rem;font-weight:700;color:#F3EFE4;margin-top:4px">${nextLabel}</div></div>` : ''}
    </div>
    <div style="padding:16px 20px 32px;display:flex;gap:10px">
      <button id="renfoRestPlus30" style="flex:1;padding:14px;border:1.5px solid #333;border-radius:10px;background:transparent;cursor:pointer;font-family:var(--vl-mono);font-size:.8rem;color:#999;touch-action:manipulation">+30s</button>
      <button id="renfoRestSkip" style="flex:2;padding:14px;border:1.5px solid #7c3aed;border-radius:10px;background:transparent;cursor:pointer;font-family:var(--vl-display);font-size:.9rem;font-weight:700;color:#7c3aed;touch-action:manipulation">PASSER MAINTENANT →</button>
    </div>`;

  document.body.appendChild(overlay);

  const timerEl = overlay.querySelector('#renfoRestTimer');
  const barEl = overlay.querySelector('#renfoRestBar2');
  const bipBadge = overlay.querySelector('#renfoRestBipBadge');
  const totalSecs = secs;
  let remaining = secs;
  let bipped = false;

  const dismiss = () => {
    clearInterval(window._renfoRestTimer);
    overlay.remove();
    if (window._renfoRestOnDismiss) {
      const cb = window._renfoRestOnDismiss;
      window._renfoRestOnDismiss = null;
      cb();
    }
  };

  overlay.querySelector('#renfoRestClose').addEventListener('click', dismiss);
  overlay.querySelector('#renfoRestSkip').addEventListener('click', dismiss);
  overlay.querySelector('#renfoRestPlus30').addEventListener('click', () => {
    remaining += 30;
    timerEl.textContent = fmtTimer(remaining);
  });

  // Defer first bar update
  requestAnimationFrame(() => {
    barEl.style.transition = 'none';
    barEl.style.width = '100%';
    requestAnimationFrame(() => { barEl.style.transition = 'width .9s linear'; });
  });

  window._renfoRestTimer = setInterval(() => {
    remaining--;
    if (timerEl) timerEl.textContent = fmtTimer(remaining);
    if (barEl) barEl.style.width = Math.max(0, remaining / totalSecs * 100).toFixed(1) + '%';

    // BIP in last 3 seconds
    if (remaining <= 3 && remaining > 0) {
      if (bipBadge) bipBadge.style.display = 'flex';
      playBip(remaining === 1 ? 1200 : 880);
    }

    if (remaining <= 0) {
      dismiss();
      navigator.vibrate?.([100, 50, 100, 50, 200]);
    }
  }, 1000);
}

function markExoChecked(exerciseId, variantId, loadType, loadKg, reps, rpe) {
  const btn = document.getElementById('chk-' + exerciseId);
  if (btn) {
    btn.dataset.checked = '1';
    btn.style.borderColor = '#7c3aed';
    btn.style.background = '#7c3aed';
    btn.style.color = '#fff';
    btn.innerHTML = _ICON_CHECK;
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
  }
  if (window._renfoSessionCompleted) {
    window._renfoSessionCompleted[exerciseId] = { variantId, loadType, loadKg, reps, rpe, logged_at: new Date().toISOString() };
  }
  // Show e1RM toast if applicable
  if (loadKg && reps) {
    const e1rm = epley1RM(loadKg, reps);
    if (e1rm) showToast(`e1RM estimé : ${e1rm} kg`, 'success', 3000);
  }
  // Start rest timer
  const def2 = RENFO_EXERCISES[exerciseId];
  const v2 = def2?.variants?.find(v => v.id === variantId) || def2?.variants?.[0];
  if (v2?.rest_seconds) startRestTimer(v2.rest_seconds);
}

function showRenfoLogPopup(exerciseId, variantId, loadType, prefillLoad = null) {
  const def = RENFO_EXERCISES[exerciseId];
  if (!def) { markExoChecked(exerciseId, variantId, loadType, null, null, null); return; }

  const existing = document.getElementById('renfoLogPopup');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'renfoLogPopup';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:8000;display:flex;align-items:flex-end;touch-action:none';

  const isWeighted = loadType === 'external_kg';
  const RPE_LABELS = ['','Repos','Très léger','Léger','Assez léger','Modéré','Difficile','Assez dur','Dur ✓','Très dur','Max'];
  const rpeRows = [1,2,3,4,5,6,7,8,9,10].map(r =>
    `<button type="button" data-rpe="${r}" style="padding:10px 2px;border-radius:8px;border:1.5px solid;cursor:pointer;touch-action:manipulation;text-align:center;outline:none;border-color:${r===8?'#7c3aed':'var(--vl-border)'};background:${r===8?'#7c3aed':'transparent'};color:${r===8?'#fff':'var(--vl-text-2)'}">
      <div style="font-family:var(--vl-display);font-size:1.3rem;font-weight:800;line-height:1">${r}</div>
      <div style="font-family:var(--vl-mono);font-size:.4rem;margin-top:3px;line-height:1.2">${RPE_LABELS[r]}</div>
    </button>`
  ).join('');


  overlay.innerHTML = `<div style="width:100%;background:var(--vl-bg2);border-radius:20px 20px 0 0;padding:20px 20px 32px;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div style="width:36px;height:4px;background:var(--vl-border);border-radius:2px;margin:0 auto 18px"></div>
    <div style="font-family:var(--vl-display);font-size:1.1rem;font-weight:700;margin-bottom:4px">${def.name_fr}</div>
    <div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);margin-bottom:18px">${def.name_tech}</div>
    <div style="display:flex;flex-direction:column;gap:16px">
      ${isWeighted ? `<div>
        <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:6px">Charge (kg)</div>
        <input id="rlLoad" type="number" inputmode="decimal" min="0" step="2.5"
          placeholder="${prefillLoad ? '' : '60'}" ${prefillLoad !== null ? `value="${prefillLoad}"` : ''}
          style="width:100%;padding:10px 12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:8px;color:var(--vl-text);font-size:1rem;box-sizing:border-box">
      </div>
      <div>
        <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:6px">Répétitions effectuées</div>
        <input id="rlReps" type="number" inputmode="numeric" min="1" max="30" placeholder="5" style="width:100%;padding:10px 12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:8px;color:var(--vl-text);font-size:1rem;box-sizing:border-box">
      </div>` : ''}
      <div>
        <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:10px">Difficulté ressentie (RPE)</div>
        <input type="hidden" id="rlRpe" value="8">
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">${rpeRows}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:22px">
      <button onclick="document.getElementById('renfoLogPopup').remove();markExoChecked('${exerciseId}','${variantId}','${loadType}',null,null,null)" style="flex:1;padding:13px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem;touch-action:manipulation">Passer</button>
      <button onclick="Vorcelab.submitRenfoLog('${exerciseId}','${variantId}','${loadType}')" style="flex:2;padding:13px;background:#7c3aed;border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-mono);font-weight:700;touch-action:manipulation">Valider</button>
    </div>
  </div>`;

  overlay.addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('[data-rpe]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.rpe);
      document.getElementById('rlRpe').value = val;
      overlay.querySelectorAll('[data-rpe]').forEach(b => {
        const on = parseInt(b.dataset.rpe) === val;
        b.style.background = on ? '#7c3aed' : 'transparent';
        b.style.borderColor = on ? '#7c3aed' : 'var(--vl-border)';
        b.style.color = on ? '#fff' : 'var(--vl-text-2)';
      });
    });
  });
  document.body.appendChild(overlay);
}

export function submitRenfoLog(exerciseId, variantId, loadType) {
  const loadKg = parseFloat(document.getElementById('rlLoad')?.value) || null;
  const reps = parseInt(document.getElementById('rlReps')?.value) || null;
  const rpe = parseInt(document.getElementById('rlRpe')?.value) || 8;
  document.getElementById('renfoLogPopup')?.remove();

  markExoChecked(exerciseId, variantId, loadType, loadKg, reps, rpe);

  if (window._renfoAfterLog) {
    const cb = window._renfoAfterLog;
    window._renfoAfterLog = null;
    cb();
  }

  // Save to DB async (don't block UI)
  const todayStr = new Date().toISOString().slice(0,10);
  const e1rm = (loadKg && reps) ? epley1RM(loadKg, reps) : null;
  sb.from('renfo_exercise_log').insert({
    user_id: VLState.currentUser.id,
    session_date: todayStr,
    exercise_id: exerciseId,
    variant_id: variantId,
    load_kg: loadKg,
    reps_completed: reps,
    reps_target: RENFO_EXERCISES[exerciseId]?.variants?.find(v=>v.id===variantId)?.default_reps || null,
    rpe,
    e1rm,
    completed_all_reps: reps >= (RENFO_EXERCISES[exerciseId]?.variants?.find(v=>v.id===variantId)?.default_reps || reps),
  }).then(({ error }) => {
    if (error) showToast('Erreur log exercice', 'error');
  });

  if (e1rm) {
    sb.from('renfo_max_lifts').upsert({
      user_id: VLState.currentUser.id,
      exercise_id: exerciseId,
      one_rm: e1rm,
      is_estimated: true,
      recorded_at: new Date().toISOString()
    }, { onConflict: 'user_id,exercise_id', ignoreDuplicates: false }).then(({ error, data }) => {
      if (!error) showToast(`e1RM estimé : ${e1rm} kg`, 'success', 3000);
    });
  }
}

export function showVariantPicker(exerciseId) {
  const def = RENFO_EXERCISES[exerciseId];
  if (!def) return;

  const existing = document.getElementById('renfoVariantPicker');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'renfoVariantPicker';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:8000;display:flex;align-items:flex-end;touch-action:none';

  const variantItems = def.variants.map(v => {
    const eqHint = v.required_equipment
      ? Object.keys(v.required_equipment).filter(k => v.required_equipment[k]).join(', ') || 'poids de corps'
      : (v.required_equipment_any ? 'haltères / kettlebell' : '');
    return `<button onclick="Vorcelab.applyVariant('${exerciseId}','${v.id}')" style="width:100%;text-align:left;padding:12px 14px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:10px;cursor:pointer;color:var(--vl-text);touch-action:manipulation;margin-bottom:8px">
      <div style="font-family:var(--vl-display);font-size:.85rem;font-weight:700">${v.name}</div>
      ${eqHint ? `<div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-top:3px">${eqHint}</div>` : ''}
    </button>`;
  }).join('');

  overlay.innerHTML = `<div style="width:100%;background:var(--vl-bg2);border-radius:20px 20px 0 0;padding:20px 20px 32px;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div style="width:36px;height:4px;background:var(--vl-border);border-radius:2px;margin:0 auto 18px"></div>
    <div style="font-family:var(--vl-display);font-size:1.1rem;font-weight:700;margin-bottom:4px">${def.name_fr}</div>
    <div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);margin-bottom:18px">Choisir une variante</div>
    ${variantItems}
    <button onclick="document.getElementById('renfoVariantPicker').remove()" style="width:100%;padding:12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:10px;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem;touch-action:manipulation">Annuler</button>
  </div>`;

  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

export function applyVariant(exerciseId, newVariantId) {
  const picker = document.getElementById('renfoVariantPicker');
  if (picker) picker.remove();

  const dayKey = window._renfoSessionDayKey;
  if (!dayKey || !renfoProgram) return;
  const session = renfoProgram.week_schedule?.[dayKey];
  if (!session) return;

  const exo = session.exercises.find(e => e.exercise_id === exerciseId);
  if (!exo) return;

  const def = RENFO_EXERCISES[exerciseId];
  const newVariant = def?.variants?.find(v => v.id === newVariantId);
  if (!newVariant) return;

  exo.variant_id = newVariantId;
  exo.sets = newVariant.default_sets;
  exo.reps = newVariant.default_reps;
  exo.target_rpe = newVariant.target_rpe;
  exo.rest_seconds = newVariant.rest_seconds;
  exo.load_type = newVariant.load_type;

  // Update DOM text elements in the card
  const card = document.getElementById('exo-card-' + exerciseId);
  if (card) {
    const techEl = card.querySelector('[data-variant-name]');
    if (techEl) techEl.textContent = def.name_tech + ' · ' + newVariant.name;
    const setsEl = card.querySelector('[data-sets-rpe]');
    if (setsEl) setsEl.textContent = `${exo.sets}×${exo.reps} · RPE cible ${exo.target_rpe}`;
    const restEl = card.querySelector('[data-rest-info]');
    if (restEl) restEl.textContent = `Entre séries : ${fmtRest(INTER_SET_REST[exerciseId]||90)} · Repos suivant : ${fmtRest(newVariant.rest_seconds||90)}`;
  }

  showToast('Variante mise à jour', 'success');
}

export function openCompletionPicker(dayKey) {
  const existing = document.getElementById('renfoCompletionPicker');
  if (existing) existing.remove();
  const todayStr = new Date().toISOString().slice(0, 10);
  const overlay = document.createElement('div');
  overlay.id = 'renfoCompletionPicker';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:8000;display:flex;align-items:flex-end;touch-action:none';
  overlay.innerHTML = `<div style="width:100%;background:var(--vl-bg2);border-radius:20px 20px 0 0;padding:20px 20px calc(32px + env(safe-area-inset-bottom,0px))" onclick="event.stopPropagation()">
    <div style="width:36px;height:4px;background:var(--vl-border);border-radius:2px;margin:0 auto 18px"></div>
    <div style="font-family:var(--vl-display);font-size:1.1rem;font-weight:700;margin-bottom:6px">Terminer la séance</div>
    <div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);margin-bottom:18px">Les exercices non cochés seront automatiquement validés.</div>
    <div style="margin-bottom:20px">
      <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:6px">Date de la séance</div>
      <input id="sessionDatePicker" type="date" value="${todayStr}" max="${todayStr}"
        style="width:100%;padding:10px 12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:8px;color:var(--vl-text);font-size:1rem;box-sizing:border-box">
    </div>
    <div style="display:flex;gap:10px">
      <button onclick="document.getElementById('renfoCompletionPicker').remove()" style="flex:1;padding:13px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem;touch-action:manipulation">Annuler</button>
      <button onclick="Vorcelab.completeRenfoSession('${dayKey}',document.getElementById('sessionDatePicker').value)" style="flex:2;padding:13px;background:#7c3aed;border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:.95rem;font-weight:700;touch-action:manipulation">CONFIRMER</button>
    </div>
  </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

export async function completeRenfoSession(dayKey, sessionDate) {
  const dateStr = sessionDate || new Date().toISOString().slice(0, 10);
  document.getElementById('renfoCompletionPicker')?.remove();

  // Auto-complete all unchecked exercises (Problem 3)
  const completed = { ...(window._renfoSessionCompleted || {}) };
  const session = renfoProgram?.week_schedule?.[dayKey];
  if (session) {
    session.exercises.forEach(exo => {
      if (!completed[exo.exercise_id]) {
        completed[exo.exercise_id] = {
          variantId: exo.variant_id, loadType: exo.load_type,
          loadKg: null, reps: null, rpe: null,
          logged_at: new Date().toISOString(), auto_completed: true
        };
      }
    });
  }

  // Merge with existing session on same date (Problem 2 — no overwrite)
  const { data: prev } = await sb.from('renfo_session_log')
    .select('completed_exercises')
    .eq('user_id', VLState.currentUser.id)
    .eq('session_date', dateStr)
    .maybeSingle();
  const merged = prev ? { ...(prev.completed_exercises || {}), ...completed } : completed;

  const n = Object.keys(merged).length;
  const { error } = await sb.from('renfo_session_log').upsert({
    user_id: VLState.currentUser.id,
    session_date: dateStr,
    day_key: dayKey,
    completed_exercises: merged
  }, { onConflict: 'user_id,session_date' });

  if (error) { showToast('Erreur sauvegarde séance', 'error'); return; }

  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  showToast(`${label} — ${n} exercice${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''}`, 'success');
  renfoSessionLogs = renfoSessionLogs.filter(l => l.session_date !== dateStr);
  renfoSessionLogs.unshift({ session_date: dateStr, day_key: dayKey, completed_exercises: merged });
  VLState.renfoSessionLogs = renfoSessionLogs;
  renderRenfoHome();
}

function showRenfoProgramView() {
  const el = document.getElementById('renfoApp');
  if (!el || !renfoProgram) return;
  const sched = renfoProgram.week_schedule || {};

  // This week done focuses
  const weekStartStr = _currentWeekStartStr();
  const thisWeekDone = new Set(
    renfoSessionLogs
      .filter(l => l.session_date >= weekStartStr)
      .map(l => sched[l.day_key]?.focus)
      .filter(Boolean)
  );

  // Unique non-rest sessions in program order
  const sessions = DAYS
    .map((d, i) => ({ dayKey: d, session: sched[d], letter: String.fromCharCode(65 + i) }))
    .filter(({ session }) => session && !session.rest);

  let letterIdx = 0;
  const cards = sessions.map(({ dayKey, session }) => {
    const col = RENFO_FOCUS_COLORS[session.focus] || 'var(--vl-ember)';
    const done = thisWeekDone.has(session.focus);
    const letter = String.fromCharCode(65 + letterIdx++);
    const notes = session.timing_notes || FOCUS_META[session.focus]?.timing_notes || [];

    const timingBadges = notes.map(note => {
      const bg = note.startsWith('✅') ? 'rgba(34,197,94,.12)' : note.startsWith('⚠') ? 'rgba(234,179,8,.12)' : 'rgba(239,68,68,.12)';
      const tc = note.startsWith('✅') ? '#22c55e' : note.startsWith('⚠') ? '#eab308' : '#ef4444';
      const label = note.replace(/^[✅⚠️❌]️?\s*/, '');
      return `<div style="display:flex;align-items:flex-start;gap:7px;font-size:.62rem;padding:4px 8px;background:${bg};border-radius:6px;color:${tc};font-family:var(--vl-mono);line-height:1.4"><div style="width:6px;height:6px;border-radius:50%;background:${tc};flex-shrink:0;margin-top:3px"></div><div>${label}</div></div>`;
    }).join('');

    const exoList = session.exercises.map(e => {
      const def = RENFO_EXERCISES[e.exercise_id];
      if (!def) return '';
      const v = def.variants.find(vv => vv.id === e.variant_id) || def.variants[0];
      return `<div style="font-size:.72rem;color:var(--vl-text-2);margin-bottom:2px">· ${def.name_fr} — ${v.name} · ${e.sets}×${e.reps}</div>`;
    }).join('');

    return `<div class="card" style="padding:14px 16px;margin-bottom:10px;position:relative">
      ${done ? `<button onclick="_openRenfoDoneMenu('${dayKey}')" style="position:absolute;top:10px;right:12px;background:none;border:none;cursor:pointer;font-size:1rem;color:var(--vl-text-2);padding:2px 6px;touch-action:manipulation;line-height:1;z-index:1">···</button>` : ''}
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px">
        <div style="width:30px;height:30px;border-radius:50%;background:${done ? col : 'transparent'};border:2px solid ${col};display:flex;align-items:center;justify-content:center;font-family:var(--vl-mono);font-size:.65rem;font-weight:700;color:${done ? '#fff' : col};flex-shrink:0">${done ? _ICON_CHECK : letter}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--vl-mono);font-size:.52rem;letter-spacing:.1em;color:${col};margin-bottom:2px">${(session.focus||'').replace(/_/g,' ').toUpperCase()}</div>
          <div style="font-family:var(--vl-display);font-size:1rem;font-weight:700">${session.label}</div>
          <div style="font-size:.68rem;color:var(--vl-text-2)">~${session.duration_min} min · ${session.exercises.length} exercices · ${session.location}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">${timingBadges}</div>
      <div style="margin-bottom:10px">${exoList}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <button onclick="Vorcelab.startRenfoSession('${dayKey}')" style="flex:1;padding:11px;background:${col};border:none;border-radius:10px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:.85rem;font-weight:700;letter-spacing:.04em;touch-action:manipulation;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:8px">${_ICON_PLAY} VOIR LA SÉANCE</button>
        ${done ? `<div style="padding:7px 10px;background:rgba(124,58,237,.15);border-radius:8px;font-family:var(--vl-mono);font-size:.5rem;font-weight:700;color:#7c3aed;letter-spacing:.06em;white-space:nowrap">FAIT</div>` : ''}
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div style="padding-bottom:8px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem">
      <button onclick="Vorcelab.renderRenfoHome()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:6px;touch-action:manipulation;display:flex;align-items:center">${_ICON_ARROW_LEFT}</button>
      <div style="font-family:var(--vl-display);font-size:1.5rem;font-weight:800">Programme</div>
    </div>
    <div style="font-size:.72rem;color:var(--vl-text-2);font-family:var(--vl-mono);margin-bottom:16px">Choisis ta séance selon ton planning — aucun jour n'est fixe.</div>
    ${cards}
  </div>`;
}

export function showRenfoHistoryView() {
  showToast('Historique — disponible dans la prochaine version', 'info');
}

async function loadExoHistory(exoId, chartEl, histEl) {
  try {
    const { data } = await sb.from('renfo_exercise_log')
      .select('session_date, load_kg, reps_completed, rpe, e1rm')
      .eq('exercise_id', exoId)
      .gte('session_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('session_date', { ascending: true });
    if (!data || data.length === 0) {
      chartEl.innerHTML = `<div style="text-align:center;padding:20px;font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2)">Aucune donnée sur 90j</div>`;
      return;
    }
    const pts = data.filter(d => d.e1rm).map(d => ({ x: new Date(d.session_date).getTime(), y: d.e1rm }));
    if (pts.length === 0) {
      chartEl.innerHTML = `<div style="text-align:center;padding:20px;font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2)">Aucune donnée charge</div>`;
    } else {
      const minX = pts[0].x, maxX = pts[pts.length - 1].x;
      const minY = Math.min(...pts.map(p => p.y)) * 0.9;
      const maxY = Math.max(...pts.map(p => p.y)) * 1.05;
      const W = 280, H = 80;
      const px = x => ((x - minX) / Math.max(1, maxX - minX)) * (W - 20) + 10;
      const py = y => H - 8 - ((y - minY) / Math.max(1, maxY - minY)) * (H - 16);
      const polyline = pts.map(p => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
      chartEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:80px">
        <polyline points="${polyline}" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${pts.map(p => `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="3" fill="#7c3aed"/>`).join('')}
        <text x="10" y="${H - 2}" font-family="monospace" font-size="8" fill="#888">${Math.round(minY)} kg</text>
        <text x="${W - 10}" y="${H - 2}" text-anchor="end" font-family="monospace" font-size="8" fill="#888">${Math.round(maxY)} kg</text>
      </svg>`;
    }
    if (histEl && data.length > 0) {
      const last5 = [...data].reverse().slice(0, 5);
      histEl.innerHTML = last5.map(d => {
        const dt = new Date(d.session_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--vl-border);font-size:.7rem">
          <div style="font-family:var(--vl-mono);color:var(--vl-text-2)">${dt}</div>
          <div>${d.load_kg ? d.load_kg + ' kg' : 'PDC'} × ${d.reps_completed || '—'}</div>
          ${d.e1rm ? `<div style="font-family:var(--vl-mono);color:#7c3aed">${d.e1rm} kg 1RM</div>` : `<div style="font-family:var(--vl-mono);color:var(--vl-text-2)">RPE ${d.rpe || '—'}</div>`}
        </div>`;
      }).join('');
    }
  } catch {}
}

export function showRenfoLibraryIndex() {
  const el = document.getElementById('renfoApp');
  if (!el) return;

  // Charge 7j
  const _today = new Date();
  const _todayMs = _today.getTime();
  const _last7 = renfoSessionLogs.filter(l => (_todayMs - new Date(l.session_date).getTime()) / 86400000 <= 7);
  const _last7wf = _last7.map(l => ({
    focus: renfoProgram?.week_schedule?.[l.day_key]?.focus || l.day_key || 'tronc',
    duration_min: renfoProgram?.week_schedule?.[l.day_key]?.duration_min || FOCUS_META[l.day_key]?.duration_min || 30,
  }));
  const _loadScore = weeklyImpactScore(_last7wf);
  const _loadPct = Math.min(100, _loadScore / 240 * 100).toFixed(1);
  const _loadZone = weeklyImpactZone(_loadScore, renfoProfile?.objective_weight || 50);

  // 5 dernières séances
  const _last5 = [...renfoSessionLogs]
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 5);
  const _histRows = _last5.length === 0
    ? `<div style="font-size:.78rem;color:var(--vl-text-2);padding:6px 0">Aucune séance enregistrée</div>`
    : _last5.map((l, i) => {
        const focus = renfoProgram?.week_schedule?.[l.day_key]?.focus || l.day_key || '—';
        const label = FOCUS_META[focus]?.label || focus.replace(/_/g,' ');
        const n = Object.keys(l.completed_exercises || {}).length;
        const d = new Date(l.session_date);
        const dateStr = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
        return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;${i < _last5.length-1 ? 'border-bottom:1px dashed var(--vl-border)' : ''}">
          <div style="font-size:.78rem">${label}</div>
          <div style="display:flex;gap:12px">
            <span style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2)">${n} exos</span>
            <span style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2)">${dateStr}</span>
          </div>
        </div>`;
      }).join('');

  const _chargeSection = `
    <div class="card" style="padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);letter-spacing:.1em">CHARGE 7J</div>
        <div style="font-family:var(--vl-mono);font-size:.55rem;color:${_loadZone.color}">${_loadZone.label} · ${_loadScore} unités</div>
      </div>
      <div style="height:5px;background:var(--vl-bg);border-radius:2px;overflow:hidden;margin-bottom:12px">
        <div style="height:100%;width:${_loadPct}%;background:#7c3aed;border-radius:2px"></div>
      </div>
      <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);letter-spacing:.1em;margin-bottom:6px">5 DERNIÈRES SÉANCES</div>
      ${_histRows}
    </div>`;

  const groups = [
    { key: 'pliometrie',  label: 'Pliométrie',       col: VLState.RENFO_FOCUS_COLORS.pliometrie },
    { key: 'force_lourde', label: 'Force lourde',     col: VLState.RENFO_FOCUS_COLORS.force_lourde },
    { key: 'excentrique', label: 'Excentrique',        col: VLState.RENFO_FOCUS_COLORS.excentrique },
    { key: 'tronc',       label: 'Tronc & stabilité', col: VLState.RENFO_FOCUS_COLORS.tronc },
    { key: 'haut_corps',  label: 'Haut du corps',     col: VLState.RENFO_FOCUS_COLORS.haut_corps },
    { key: 'mobilite',    label: 'Mobilité',           col: VLState.RENFO_FOCUS_COLORS.mobilite },
  ];

  const groupCards = groups.map(g => {
    const exoIds = SESSION_EXERCISES[g.key] || [];
    const rows = exoIds.map(id => {
      const def = RENFO_EXERCISES[id];
      if (!def) return '';
      return `<div onclick="Vorcelab.showRenfoLibraryExo('${id}')" style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed var(--vl-border);cursor:pointer;touch-action:manipulation" onmouseover="this.style.color='#7c3aed'" onmouseout="this.style.color=''">
        <span style="font-size:.8rem">${def.name_fr}</span>
        <span style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2)">${exoIds.indexOf(id)+1}/${exoIds.length}</span>
      </div>`;
    }).join('');
    return `<div style="padding:14px;background:var(--vl-bg2);border:1.5px solid ${g.col}30;border-radius:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-family:var(--vl-display);font-size:1rem;font-weight:700;color:${g.col}">${g.label}</div>
        <div style="font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-2)">${exoIds.length} EXOS</div>
      </div>
      ${rows}
    </div>`;
  }).join('');

  el.innerHTML = `<div style="padding-bottom:8px">
    ${_renfoTabBar('bibliotheque')}
    ${_chargeSection}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
      ${groupCards}
    </div>
  </div>`;
}

export function showRenfoLibraryExo(exoId) {
  const el = document.getElementById('renfoApp');
  const def = RENFO_EXERCISES[exoId];
  if (!el || !def) return;

  const muscleRows = (def.primary_muscles || []).map((m, i) => {
    const pct = Math.max(30, 95 - i * 15);
    return `<div style="display:flex;align-items:center;gap:8px">
      <div style="width:90px;font-size:.72rem;color:var(--vl-text-2)">${m}</div>
      <div style="flex:1;height:5px;background:var(--vl-bg);border-radius:2px">
        <div style="height:100%;width:${pct}%;background:#7c3aed;border-radius:2px"></div>
      </div>
      <div style="font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-2);width:30px;text-align:right">${pct}%</div>
    </div>`;
  }).join('');

  const variantRows = (def.variants || []).map(v =>
    `<div style="padding:5px 0;border-bottom:1px dashed var(--vl-border);font-size:.78rem;color:var(--vl-text-2)">· ${v.name}</div>`
  ).join('');

  const steps = (def.movement || '').split(/\.\s+/).filter(Boolean).map(s => s.replace(/\.$/, '').trim());
  const stepsHtml = steps.map((s, i) =>
    `<div style="display:flex;gap:8px;padding:4px 0">
      <div style="font-family:var(--vl-mono);font-size:.55rem;color:#7c3aed;min-width:16px;padding-top:2px;flex-shrink:0">${i + 1}.</div>
      <div style="font-size:.78rem;color:var(--vl-text-2);line-height:1.5">${s}</div>
    </div>`
  ).join('');

  el.innerHTML = `<div style="padding-bottom:8px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:.75rem">
      <button onclick="Vorcelab.showRenfoLibraryIndex()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:6px;touch-action:manipulation;font-size:1.2rem">←</button>
      <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2)">BIBLIOTHÈQUE / ${(def.category||'').replace(/_/g,' ').toUpperCase()}</div>
    </div>

    ${(g=>g?`<div style="margin-bottom:14px;border-radius:10px;overflow:hidden;border:1px solid var(--vl-border);background:var(--vl-bg2);line-height:0"><img src="${g}" alt="${def.name_fr}" style="width:100%;max-height:300px;object-fit:contain;display:block" onerror="this.parentElement.style.display='none'"></div>`:gifPlaceholder(def.category,'library'))(getExerciseGifUrl(exoId))}

    <div style="margin-bottom:1rem">
      <div style="font-family:var(--vl-display);font-size:2rem;font-weight:800;line-height:1;text-transform:uppercase">${def.name_fr}</div>
      ${def.name_tech ? `<div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);font-style:italic;margin-top:4px">${def.name_tech}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">
        ${(def.primary_muscles||[]).map(m=>`<span style="font-family:var(--vl-mono);font-size:.5rem;padding:3px 8px;border:1px solid var(--vl-border);border-radius:3px;color:var(--vl-text-2)">${m}</span>`).join('')}
      </div>
    </div>

    <div class="card" style="padding:12px;margin-bottom:10px">
      <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-bottom:6px;letter-spacing:.1em">PROGRESSION 90J · 1RM ESTIMÉ</div>
      <div id="exo-chart" style="min-height:80px;display:flex;align-items:center;justify-content:center">
        <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2)">…</div>
      </div>
      <div id="exo-hist" style="margin-top:8px"></div>
    </div>

    <div class="card" style="padding:12px;margin-bottom:10px">
      <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-bottom:8px;letter-spacing:.1em">EXÉCUTION</div>
      ${stepsHtml || `<div style="font-size:.78rem;color:var(--vl-text-2)">${def.movement || '—'}</div>`}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="card" style="padding:12px">
          <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-bottom:6px;letter-spacing:.1em">POSITION</div>
          <div style="font-size:.78rem;color:var(--vl-text-2);line-height:1.5">${def.position || '—'}</div>
        </div>
        ${def.variants?.length > 1 ? `<div class="card" style="padding:12px">
          <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-bottom:6px;letter-spacing:.1em">VARIANTES (${def.variants.length})</div>
          ${variantRows}
        </div>` : ''}
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        ${muscleRows.length ? `<div class="card" style="padding:12px">
          <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-bottom:10px;letter-spacing:.1em">MUSCLES ACTIVÉS</div>
          <div style="display:flex;flex-direction:column;gap:6px">${muscleRows}</div>
        </div>` : ''}
        ${def.common_errors ? `<div class="card" style="padding:12px">
          <div style="font-family:var(--vl-mono);font-size:.55rem;color:#7c3aed;margin-bottom:6px;letter-spacing:.1em">ERREURS FRÉQUENTES</div>
          <div style="font-size:.78rem;color:var(--vl-text-2);line-height:1.5">${def.common_errors}</div>
        </div>` : ''}
      </div>
    </div>
  </div>`;

  const chartEl = document.getElementById('exo-chart');
  const histEl = document.getElementById('exo-hist');
  if (chartEl) loadExoHistory(exoId, chartEl, histEl);
}

export async function showRenfoSettings() {
  if (!renfoProfile) return;
  const el = document.getElementById('renfoApp');

  el.innerHTML = `<div style="padding-bottom:8px">
    ${_renfoTabBar('reglages')}
    <div class="card" style="padding:16px;margin-bottom:12px">
      <div class="clabel" style="margin-bottom:12px">OBJECTIF</div>
      ${[
        [25,'Renforcement préventif'],[50,'Équilibré'],[75,'Performance']
      ].map(([v,t])=>`<button class="vl-ob-btn" data-val="${v}" data-type="obj" onclick="Vorcelab.renfoObSelect(this)" style="display:block;width:100%;text-align:left;padding:12px;background:${renfoProfile.objective_weight===v?'rgba(229,86,42,.1)':'var(--vl-bg2)'};border:1.5px solid ${renfoProfile.objective_weight===v?'var(--vl-ember)':'var(--vl-border)'};border-radius:10px;cursor:pointer;color:var(--vl-text);margin-bottom:8px;touch-action:manipulation">
        <span style="font-size:.85rem">${t}</span>
      </button>`).join('')}
    </div>
    <div class="card" style="padding:16px;margin-bottom:12px">
      <div class="clabel" style="margin-bottom:12px">SÉANCES / SEMAINE</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${[1,3,5,6].map(v=>`<button class="vl-ob-btn" data-val="${v}" data-type="spw" onclick="Vorcelab.renfoObSelect(this)" style="padding:12px;background:${renfoProfile.sessions_per_week===v?'rgba(229,86,42,.1)':'var(--vl-bg2)'};border:1.5px solid ${renfoProfile.sessions_per_week===v?'var(--vl-ember)':'var(--vl-border)'};border-radius:10px;cursor:pointer;color:var(--vl-text);touch-action:manipulation">
          <span style="font-family:var(--vl-display);font-size:1.2rem;font-weight:700">${v}</span>
          <div style="font-size:.65rem;color:var(--vl-text-2)">séance${v>1?'s':''}/sem</div>
        </button>`).join('')}
      </div>
    </div>
    <button onclick="Vorcelab.saveRenfoSettings()" style="width:100%;padding:14px;background:var(--vl-ember);border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:1rem;font-weight:700;touch-action:manipulation">Sauvegarder & Régénérer</button>
    <button onclick="Vorcelab.resetRenfoOnboarding()" style="width:100%;padding:12px;background:none;border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem;margin-top:10px;touch-action:manipulation">Recommencer l'onboarding</button>
  </div>`;

  _renfoOnboarding = { ...renfoProfile };
}

export async function saveRenfoSettings() {
  const updated = {
    ...renfoProfile,
    objective_weight: _renfoOnboarding.objective_weight ?? renfoProfile.objective_weight,
    sessions_per_week: _renfoOnboarding.sessions_per_week ?? renfoProfile.sessions_per_week
  };
  const { error } = await sb.from('renfo_profile').upsert(updated);
  if (error) { showToast('Erreur sauvegarde', 'error'); return; }
  renfoProfile = updated;

  const schedule = generateRenfoProgram(updated);
  await sb.from('renfo_program').upsert({
    user_id: VLState.currentUser.id,
    week_schedule: schedule,
    generated_at: new Date().toISOString(),
    generation_inputs: updated
  });
  renfoProgram = { week_schedule: schedule };
  VLState.renfoProgram = renfoProgram;
  showToast('Programme ajusté à ton nouveau profil', 'success');
  renderRenfoHome();
}

export async function resetRenfoOnboarding() {
  await sb.from('renfo_profile').upsert({ user_id: VLState.currentUser.id, onboarding_completed: false });
  renfoProfile = null;
  _renfoOnboarding = {};
  renderOnboardingStep(1);
}

