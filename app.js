import { VLState, sb, SUPA_URL, CLIENT_ID, FC_MAX_DEFAULT, RUNNING_TYPES } from './app-state.js';
import { renderCalendar, loadRaces } from './race-calendar.js';
import { openAnalyse, autoCalibrate } from './activity-analysis.js';
import { loadRenfoApp, preloadRenfoState } from './renfo.js';
import { isRun, fmtP, fmtD, fmtT, bC, deltaHTML, tE, tL, parseCsvDate } from './formatters.js';
import { escapeHTML, escapeAttr, safeUrl } from './security.js';
import { renderNutritionProducts } from './nutrition.js';
import { icon } from './icons.js';
import { computeTrainingLoad, renderLoadBlock } from './training-load.js';

const REDIRECT_URI = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}/`;
let historyActivities = [];
let annualChartInst = null;
let annualChartMode = 'km';
let isLight = false;
let themeMode = localStorage.getItem('vl-theme') || 'auto';

// Dismiss splash after animation completes
(function(){
  const splash = document.getElementById('splashScreen');
  if(!splash) return;
  setTimeout(()=>{ splash.classList.add('vl-fade'); setTimeout(()=>splash.remove(), 420); }, 1300);
})();


// ════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════
function applyTheme(mode) {
  themeMode = mode;
  if (mode === 'auto') {
    isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  } else {
    isLight = mode === 'light';
  }
  document.body.toggleAttribute('data-light', isLight);
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.themeBtn === mode));
}
export function setTheme(mode) {
  localStorage.setItem('vl-theme', mode);
  applyTheme(mode);
}
// Init theme on load
applyTheme(themeMode);
// Keep auto in sync if system preference changes
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (themeMode === 'auto') applyTheme('auto');
});

// ════════════════════════════════════════════════════
// PANELS
// ════════════════════════════════════════════════════
export function showPanel(name) {
  // Profil sub-pages: 'profil-records', 'profil-nutrition', 'profil-compte'
  const profilTab = name.startsWith('profil-') ? name.slice(7) : null;
  const panelId = profilTab ? 'profil' : name;

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item[data-panel]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bni[data-panel]').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + panelId);
  if(!panel) return;
  panel.classList.add('active');
  document.querySelector(`.sidebar-item[data-panel="${panelId}"]`)?.classList.add('active');
  document.querySelector(`.bni[data-panel="${panelId}"]`)?.classList.add('active');
  if(panelId==='strategie') { renderCalendar(); }
  if(panelId==='renfo') { loadRenfoApp(); }
  if(panelId==='profil') { populateProfilPanel(); switchProfilTab(profilTab||'compte'); }
  if(name==='strategie' && !VLState.currentRaceContext) {
    const drop=document.getElementById('gpxDrop');
    if(drop){
      drop.style.display='block';
      drop.onclick=()=>document.getElementById('gpxFile').click();
      drop.innerHTML=`<div style="font-size:2.5rem;margin-bottom:.75rem">${icon('map',28)}</div><div style="font-family:var(--display);font-size:1.4rem;letter-spacing:.03em;margin-bottom:.4rem">Déposer le fichier GPX</div><div class="mono">Compatible OpenRunner · Strava · Garmin Connect</div>`;
    }
  }
}

export function navigate(panel) {
  const hash = panel === 'dashboard' ? '' : panel;
  if(window.location.hash.slice(1) !== hash) {
    window.location.hash = hash;
  } else {
    showPanel(panel);
  }
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1) || 'dashboard';
  showPanel(hash);
});

// ════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════
export function switchTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('authMsg').textContent = '';
}

export async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const msg = document.getElementById('authMsg');

  if (!email || !pass) {
    msg.textContent = 'Entre ton email et ton mot de passe.';
    msg.style.color = 'var(--red)';
    return;
  }

  msg.textContent = 'Connexion...';
  msg.style.color = 'var(--text2)';

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

  if (error) {
    msg.textContent = 'Email ou mot de passe incorrect.';
    msg.style.color = 'var(--red)';
    return;
  }

  if (data?.user) {
    await initApp(data.user);
  }
}
function updatePasswordRules() {
  const pass = document.getElementById('signupPassword')?.value || '';

  const rules = [
    { id: 'ruleLength', ok: pass.length >= 8, text: '8 caractères minimum' },
    { id: 'ruleUpper', ok: /[A-Z]/.test(pass), text: '1 majuscule minimum' },
    { id: 'ruleDigit', ok: /[0-9]/.test(pass), text: '1 chiffre minimum' },
  ];

  rules.forEach(rule => {
    const el = document.getElementById(rule.id);
    if (!el) return;
    el.textContent = `${rule.ok ? '✓' : '○'} ${rule.text}`;
    el.style.color = rule.ok ? 'var(--green)' : 'var(--vl-text-3)';
  });
}
export async function signup() {
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const pass = document.getElementById('signupPassword').value;
  const msg = document.getElementById('authMsg');

  if (pass.length < 8 || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) {
    msg.textContent = 'Mot de passe : 8 caractères minimum, avec au moins 1 majuscule et 1 chiffre.';
    msg.style.color = 'var(--red)';
    return;
  }

  msg.textContent = 'Création...';
  msg.style.color = 'var(--text2)';

  const { data, error } = await sb.auth.signUp({ email, password: pass });

  if (error) {
    msg.textContent = error.message;
    msg.style.color = 'var(--red)';
    return;
  }

  if (data.user) {
    await sb.from('profiles').upsert({ id: data.user.id, name });
    msg.textContent = '✓ Compte créé ! Vérifie ton email si demandé.';
    msg.style.color = 'var(--green)';
    setTimeout(() => initApp(data.user), 1500);
  }
}
export async function disconnectStrava() {
  const ok = confirm('Déconnecter Strava de ce compte Vorcelab ? Les futures synchronisations seront arrêtées.');
  if (!ok) return;

  const { data: { session } } = await sb.auth.getSession();

  if (!session?.access_token) {
    showToast('Session expirée. Reconnecte-toi.', 'error');
    return;
  }

  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    if (!r.ok) throw new Error('Erreur déconnexion Strava');

    VLState.allActivities = [];
    VLState.stravaConnected = false;

    document.getElementById('statusDot').className = 'dot dot-off';
    document.getElementById('statusText').textContent = 'Strava';
    document.getElementById('btnStrava').style.display = 'flex';

    const syncBtn = document.getElementById('btnSync');
    if (syncBtn) syncBtn.style.display = 'none';

    const dotM = document.getElementById('statusDotMobile');
    if (dotM) dotM.className = 'dot dot-off';

    const syncM = document.getElementById('btnSyncMobile');
    if (syncM) syncM.style.display = 'none';

    const stravaM = document.getElementById('btnStravaMobile');
    if (stravaM) stravaM.style.display = 'inline-flex';

    showToast('Strava déconnecté', 'success');
    renderDashboard();
  } catch (e) {
    showToast('Impossible de déconnecter Strava', 'error');
  }
}
export async function deleteAccount() {
  const firstConfirm = confirm(
    'Supprimer définitivement ton compte Vorcelab ?\n\nToutes tes données seront supprimées : profil, activités, calendrier, renfo, connexion Strava.\n\nCette action est irréversible.'
  );

  if (!firstConfirm) return;

  const secondConfirm = prompt(
    'Pour confirmer, écris exactement : SUPPRIMER'
  );

  if (secondConfirm !== 'SUPPRIMER') {
    showToast('Suppression annulée', 'error');
    return;
  }

  const { data: { session } } = await sb.auth.getSession();

  if (!session?.access_token) {
    showToast('Session expirée. Reconnecte-toi.', 'error');
    return;
  }

  try {
    showToast('Suppression du compte en cours...', 'success');

    const r = await fetch(`${SUPA_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const payload = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(payload.error || 'Erreur suppression compte');
    }

    await sb.auth.signOut();

    VLState.currentUser = null;
    VLState.userProfile = { pain_zones: [] };
    VLState.allActivities = [];
    historyActivities = [];
    VLState.races = [];

    document.querySelectorAll('.modal, .overlay, .drawer, .profile-modal').forEach(el => {
      el.classList.remove('show', 'active', 'open');
      el.style.display = 'none';
    });

    document.getElementById('appShell').classList.remove('show');
    document.getElementById('authScreen').classList.add('show');

    showToast('Compte supprimé', 'success');
  } catch (e) {
    showToast('Impossible de supprimer le compte', 'error');
  }
}
export async function logout() {
  await sb.auth.signOut();

  VLState.currentUser = null;
  VLState.userProfile = { pain_zones: [] };
  VLState.allActivities = [];
  historyActivities = [];
  VLState.races = [];

  document.querySelectorAll('.modal, .overlay, .drawer, .profile-modal').forEach(el => {
    el.classList.remove('show', 'active', 'open');
    el.style.display = 'none';
  });

  document.getElementById('appShell').classList.remove('show');
  document.getElementById('authScreen').classList.add('show');
}

async function initApp(user) {
  VLState.currentUser = user;
  document.getElementById('authScreen').classList.remove('show');
  document.getElementById('appShell').classList.add('show');
  await loadProfile();
  await loadRaces();
  await preloadRenfoState();
  await checkStravaToken();
  await loadHistoryFromDB();
  // Force native date picker to open on tap (needed on some iOS versions)
  document.addEventListener('click', e => {
    if(e.target.type === 'date' || e.target.type === 'time') {
      try { e.target.showPicker(); } catch(_) {}
    }
  }, true);
  // Restore panel from URL hash
  const initHash = window.location.hash.slice(1) || 'dashboard';
  showPanel(initHash);
  // Onboarding pour nouveaux utilisateurs
  if(!localStorage.getItem('onb_done')) initOnboarding();
  // Bootstrap VAM silently if not yet calibrated and Strava is connected (fire and forget)
  if(!VLState.userProfile.vam_avg && VLState.allActivities?.length && VLState.stravaConnected) {
    autoCalibrate(VLState.allActivities);
  }
}

// ════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════
const PAIN_ZONES = [
  {key:'knee',label:'Genou'},{key:'achilles',label:"Tendon d'Achille"},
  {key:'hip',label:'Hanche / ITB'},{key:'plantar',label:'Fascia plantaire'},
  {key:'shin',label:'Périostite tibiale'},{key:'lower_back',label:'Bas du dos'},
  {key:'hamstring',label:'Ischio-jambiers'},{key:'calf',label:'Mollet'},
];

function renderPainGrid() {
  const grid = document.getElementById('painGrid'); 
  if(!grid) return;
  grid.innerHTML = '';
  PAIN_ZONES.forEach(z => {
    const active = (VLState.userProfile.pain_zones||[]).includes(z.key);
    const div = document.createElement('div');
    div.className = 'pain-zone' + (active ? ' active' : '');
    div.onclick = () => { togglePainZone(z.key, div); };
    div.innerHTML = `<input type="checkbox" ${active?'checked':''}><span style="font-size:.8rem;font-weight:500">${z.label}</span>`;
    grid.appendChild(div);
  });
}

function togglePainZone(key, el) {
  if (!VLState.userProfile.pain_zones) VLState.userProfile.pain_zones = [];
  const idx = VLState.userProfile.pain_zones.indexOf(key);
  if (idx >= 0) { VLState.userProfile.pain_zones.splice(idx,1); el.classList.remove('active'); el.querySelector('input').checked=false; }
  else { VLState.userProfile.pain_zones.push(key); el.classList.add('active'); el.querySelector('input').checked=true; }
}

function updateSilhouetteSex() {
  const sex = VLState.userProfile?.sex || 'M';
  const isFemale = sex === 'F';
  const show = (id, visible) => { const el=document.getElementById(id); if(el) el.style.display=visible?'':'none'; };
  show('sg-front-m', !isFemale); show('sg-front-f', isFemale);
  show('sg-back-m', !isFemale); show('sg-back-f', isFemale);
}

async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', VLState.currentUser.id).single();
  if (data) {
    VLState.userProfile = { pain_zones: [], ...data };
    VLState.userProfile.pain_zones = VLState.userProfile.pain_zones || [];
    const set = (id, val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
    set('p-name', data.name); set('p-birthdate', data.birthdate); set('p-sex', data.sex);
    set('p-weight', data.weight); set('p-height', data.height);
    set('p-vo2max', data.vo2max); set('p-fcmax', data.fc_max);
    set('p-lactate', data.lactate_threshold); set('p-lactate-pace', data.lactate_pace);
    set('p-goals', data.goals);
    if (data.name) { document.getElementById('headerName').textContent = data.name; const hm=document.getElementById('headerNameMobile'); if(hm) hm.textContent=data.name; }
    if (data.avatar_url) updateAvatar(data.avatar_url);
    if (data.nutrition_products) VLState.userProfile.nutrition_products = data.nutrition_products;
    if (data.prs) {
      const p = data.prs; VLState.userProfile.prs = p;
      const sp = (id,v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
      if(p['5k']){sp('pr-5k',p['5k'].time);sp('pr-5k-date',p['5k'].date);}
      if(p['10k']){sp('pr-10k',p['10k'].time);sp('pr-10k-date',p['10k'].date);}
      if(p['15k']){sp('pr-15k',p['15k'].time);sp('pr-15k-date',p['15k'].date);}
      if(p['semi']){sp('pr-semi',p['semi'].time);sp('pr-semi-date',p['semi'].date);}
      if(p['marathon']){sp('pr-marathon',p['marathon'].time);sp('pr-marathon-date',p['marathon'].date);}
      if(p['ultra']){sp('pr-ultra',p['ultra'].time);sp('pr-ultra-date',p['ultra'].date);sp('pr-ultra-dist',p['ultra'].dist);sp('pr-ultra-dplus',p['ultra'].dplus);}
    }
    updateSilhouetteSex();
    // Restaure le runner profile depuis Supabase (cache persistant entre sessions)
    if (data.runner_profile) {
      VLState.runnerProfile = data.runner_profile;
    }
  }
}

export async function saveProfile() {
  const profile = {
    id: VLState.currentUser.id,
    name: document.getElementById('p-name').value||null,
    birthdate: document.getElementById('p-birthdate').value||null,
    age: document.getElementById('p-birthdate').value ? Math.floor((new Date()-new Date(document.getElementById('p-birthdate').value))/31557600000) : null,
    sex: document.getElementById('p-sex').value||null,
    weight: parseFloat(document.getElementById('p-weight').value)||null,
    height: parseFloat(document.getElementById('p-height').value)||null,
    vo2max: parseFloat(document.getElementById('p-vo2max').value)||null,
    fc_max: parseInt(document.getElementById('p-fcmax').value)||null,
    lactate_threshold: parseInt(document.getElementById('p-lactate').value)||null,
    lactate_pace: document.getElementById('p-lactate-pace').value||null,
    pain_zones: VLState.userProfile.pain_zones||[],
    goals: document.getElementById('p-goals').value||null,
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('profiles').upsert(profile);
  const msg = document.getElementById('profileSaveMsg');
  if (error) { msg.textContent='❌ '+error.message; msg.style.color='var(--red)'; }
  else { VLState.userProfile={...VLState.userProfile,...profile}; updateSilhouetteSex(); msg.textContent='✓ Sauvegardé'; msg.style.color='var(--green)'; if(profile.name){document.getElementById('headerName').textContent=profile.name;const hm=document.getElementById('headerNameMobile');if(hm)hm.textContent=profile.name;} setTimeout(()=>msg.textContent='',3000); }
}

function parsePRTime(str) {
  if (!str||!str.trim()) return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length===3) return parts[0]*3600+parts[1]*60+parts[2];
  if (parts.length===2) return parts[0]*60+parts[1];
  return null;
}

export async function savePRs() {
  const prs = {};
  const add = (key,tid,did,extra={}) => { const t=document.getElementById(tid)?.value?.trim(),d=document.getElementById(did)?.value,s=parsePRTime(t); if(s!==null){prs[key]={time:t,date:d||null,timeS:s,...extra};} };
  add('5k','pr-5k','pr-5k-date',{dist:5000});
  add('10k','pr-10k','pr-10k-date',{dist:10000});
  add('15k','pr-15k','pr-15k-date',{dist:15000});
  add('semi','pr-semi','pr-semi-date',{dist:21097});
  add('marathon','pr-marathon','pr-marathon-date',{dist:42195});
  const ud=parseFloat(document.getElementById('pr-ultra-dist')?.value)||null;
  const udp=parseFloat(document.getElementById('pr-ultra-dplus')?.value)||null;
  const ut=document.getElementById('pr-ultra')?.value?.trim();
  const uts=parsePRTime(ut);
  if(uts!==null&&ud)prs['ultra']={time:ut,timeS:uts,dist:ud*1000,dplus:udp,date:document.getElementById('pr-ultra-date')?.value||null};
  const {error}=await sb.from('profiles').upsert({id:VLState.currentUser.id,prs,updated_at:new Date().toISOString()});
  const msg=document.getElementById('prSaveMsg');
  if(error){msg.textContent='❌ '+error.message;msg.style.color='var(--red)';}
  else{VLState.userProfile.prs=prs;msg.textContent='✓ PR sauvegardés';msg.style.color='var(--green)';setTimeout(()=>msg.textContent='',3000);}
}

// ════════════════════════════════════════════════════
// STRAVA AUTH
// ════════════════════════════════════════════════════
export function connectStrava() {
  const state = crypto.randomUUID();
  sessionStorage.setItem('strava_oauth_state', state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    approval_prompt: 'force',
    scope: 'read,activity:read,activity:read_all',
    state,
  });
  window.location.href = `https://www.strava.com/oauth/authorize?${params}`;
}

async function exchangeCode(code, scope) {
  // Exchange via edge function — CLIENT_SECRET never touches the browser
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const r = await fetch(`${SUPA_URL}/functions/v1/strava-oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ code, scope }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({error:'Exchange failed'})); throw new Error(e.error||'OAuth exchange failed'); }
  return r.json();
}

async function refreshActivitiesFromServer() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) return;
  await fetch(`${SUPA_URL}/functions/v1/strava-refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: '{}',
  });
}

function setStravaConnected(name) {
  VLState.stravaConnected = true;
  document.getElementById('statusDot').className = 'dot dot-on';
  document.getElementById('statusText').textContent = name || 'Connecté';
  document.getElementById('btnStrava').style.display = 'none';
  const s = document.getElementById('btnSync'); if(s) s.style.display = 'inline-flex';
  const dotM = document.getElementById('statusDotMobile'); if(dotM) dotM.className = 'dot dot-on';
  const sm = document.getElementById('btnSyncMobile'); if(sm) sm.style.display = 'inline-flex';
  const bsm = document.getElementById('btnStravaMobile'); if(bsm) bsm.style.display = 'none';
}

export async function manualSync() {
  const btn = document.getElementById('btnSync');
  if(btn) { btn.textContent = '⟳'; btn.style.animation = 'spin 1s linear infinite'; btn.disabled = true; }
  showToast('Synchronisation Strava en cours…', 'info', 3000);
  const prevIds = new Set((VLState.allActivities||[]).map(a=>a.id));
  try {
    await refreshActivitiesFromServer();
    await new Promise(r => setTimeout(r, 3000)); // laisse le temps à l'edge function
    await loadActivities();
    renderDashboard();
    showToast('Synchronisation terminée ✓', 'success');
    // Recalibrate VAM if new trail runs detected
    const hasNewTrail = (VLState.allActivities||[]).some(a =>
      !prevIds.has(a.id) &&
      (a.type||a.sport_type||'').toLowerCase().includes('trail') &&
      (a.total_elevation_gain||0) > 100
    );
    if(hasNewTrail) autoCalibrate(VLState.allActivities);
    // Invalide le cache profil coureur (nouvelles activités = rp potentiellement obsolète)
    VLState.runnerProfile = null;
  } catch(e) {
    showToast('Erreur de synchronisation', 'error');
  } finally {
    if(btn) { btn.textContent = '⟳'; btn.style.animation = ''; btn.disabled = false; }
  }
}

async function checkStravaConnection() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) return false;
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-status`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!r.ok) return false;
    const data = await r.json();
    if (data.connected) {
      const name = [data.athlete_firstname, data.athlete_lastname].filter(Boolean).join(' ');
      setStravaConnected(name);
      return true;
    }
  } catch {}
  return false;
}

async function checkStravaToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const scope = urlParams.get('scope') || '';
  const returnedState = urlParams.get('state');

  if (code) {
    // Clean URL immediately
    window.history.replaceState({}, '', window.location.pathname);
    // Validate CSRF state
    const expectedState = sessionStorage.getItem('strava_oauth_state');
    sessionStorage.removeItem('strava_oauth_state');
    if (!expectedState || returnedState !== expectedState) {
      showToast('État OAuth invalide — réessaie la connexion', 'error');
      showOnboarding();
      return;
    }
    showToast('Connexion Strava en cours…', 'info', 3000);
    try {
      await exchangeCode(code, scope);
      showToast('Strava connecté ! Synchronisation en cours…', 'success', 4000);
      await refreshActivitiesFromServer();
      await loadActivities();
    } catch(e) {
      showToast('Erreur connexion Strava : ' + e.message, 'error');
      showOnboarding();
    }
    return;
  }

  const connected = await checkStravaConnection();
  if (connected) {
    await loadActivities();
  } else {
    showOnboarding();
  }
}

// ════════════════════════════════════════════════════
// STRAVA API — data loaded from Supabase, not directly from Strava
// ════════════════════════════════════════════════════
function mapDbActivity(row) {
  // Convert Supabase strava_activities row to the format used throughout the app
  const raw = row.raw_data || {};
  const rawType = row.type || 'Run';
  const sportType = row.sport_type || '';
  // Strava sends sport_type='TrailRun' even when type='Run' — check both
  const normalizedType = /trail/i.test(rawType) || /trail/i.test(sportType) ? 'TrailRun' : rawType;
  return {
    id: Number(row.strava_activity_id),
    name: row.name || '',
    type: normalizedType,
    sport_type: sportType,
    start_date: row.start_date || '',
    start_date_local: row.start_date_local || '',
    distance: Number(row.distance || 0),
    moving_time: Number(row.moving_time || 0),
    elapsed_time: Number(row.elapsed_time || 0),
    total_elevation_gain: Number(row.total_elevation_gain || 0),
    average_speed: Number(row.average_speed || 0),
    max_speed: Number(row.max_speed || 0),
    average_heartrate: row.average_heartrate != null ? Number(row.average_heartrate) : undefined,
    max_heartrate: row.max_heartrate != null ? Number(row.max_heartrate) : undefined,
    kilojoules: raw.kilojoules || undefined,
    start_latlng: raw.start_latlng || undefined,
  };
}

async function loadActivities() {
  const { data: rows, error } = await sb
    .from('strava_activities')
    .select('*')
    .eq('user_id', VLState.currentUser.id)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(200);
  if (error) { console.error('loadActivities error:', error.message); return; }
  VLState.allActivities = (rows || []).filter(r => isRun(r.type)).map(mapDbActivity);
  if (VLState.allActivities.length > 0) setStravaConnected();
  renderDashboard();
}


// ════════════════════════════════════════════════════
// MONTHLY CALENDAR
// ════════════════════════════════════════════════════
function showOnboarding() {
  document.getElementById('onboarding').style.display = 'block';
  document.getElementById('dashContent').style.display = 'none';
}

function showDashContent() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('dashContent').style.display = 'block';
}

// ════════════════════════════════════════════════════
// SPARKLINE HELPER
// ════════════════════════════════════════════════════
function renderSparkline(id, data, color) {
  const el = document.getElementById(id);
  if (!el || !data.length) return;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 100, H = 28;
  const pts = data.map((v, i) => `${(i/(data.length-1))*W},${H-2-((v-min)/range)*(H-6)}`).join(' ');
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  el.innerHTML = `<defs><linearGradient id="sg-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="${fillPts}" fill="url(#sg-${id})"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ════════════════════════════════════════════════════
// DASHBOARD RENDER
// ════════════════════════════════════════════════════
function renderDashboard() {
  if (!VLState.allActivities.length) { showOnboarding(); return; }
  showDashContent();

  const now = new Date();

  // Greeting
  const weekNum = (() => { const d=new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const w=new Date(d.getFullYear(),0,4); return 1+Math.round(((d-w)/86400000-3+(w.getDay()+6)%7)/7); })();
  const monthFr = ['jan','fév','mars','avr','mai','juin','juil','août','sep','oct','nov','déc'][now.getMonth()].toUpperCase();
  const weekLbl = document.getElementById('dashWeekLabel');
  if (weekLbl) weekLbl.textContent = `SEM. ${weekNum} · ${monthFr} ${now.getFullYear()}`;
  const thisMonth = VLState.allActivities.filter(a => {
    const d = new Date(a.start_date);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  });
  const lastMonth = VLState.allActivities.filter(a => {
    const d = new Date(a.start_date);
    const lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
    return d.getMonth()===lm.getMonth() && d.getFullYear()===lm.getFullYear();
  });
  // Calendar week: Monday 00:00 → Sunday 23:59
  const dowNow = now.getDay(); // 0=Sun,1=Mon…6=Sat
  const daysToMon = (dowNow + 6) % 7; // days since last Monday
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMon);
  const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7);
  const prevWeekEnd   = new Date(weekStart); // exclusive upper bound (= weekStart)
  const thisWeek = VLState.allActivities.filter(a => new Date(a.start_date) >= weekStart);
  const prevWeek = VLState.allActivities.filter(a => { const d=new Date(a.start_date); return d>=prevWeekStart && d<prevWeekEnd; });

  const km = r => r.reduce((s,a)=>s+a.distance/1000,0);
  const dp = r => r.reduce((s,a)=>s+(a.total_elevation_gain||0),0);
  const dur = r => r.reduce((s,a)=>s+(a.moving_time||0),0);

  const kmM=km(thisMonth), kmW=km(thisWeek), dpM=dp(thisMonth), dpW=dp(thisWeek);
  const kmML=km(lastMonth), dpML=dp(lastMonth);
  const kmPW=km(prevWeek), dpPW=dp(prevWeek);
  const runsM=thisMonth.length, runsML=lastMonth.length, runsW=thisWeek.length, runsPW=prevWeek.length;
  const durM=dur(thisMonth);

  // Hero KPI values
  document.getElementById('s-km-month').textContent = kmM.toFixed(0)+' km';
  document.getElementById('s-km-week').textContent = kmW.toFixed(0)+' km';
  document.getElementById('s-dplus-month').textContent = dpM.toFixed(0)+' m';
  document.getElementById('s-dplus-week').textContent = dpW.toFixed(0)+' m';
  document.getElementById('s-runs-month').textContent = runsM;
  document.getElementById('s-runs-week').textContent = runsW;

  // Sparklines — daily cumulative within current month
  const sparkKmData=[], sparkDpData=[];
  let cumKm=0, cumDp=0;
  const today=now.getDate();
  for(let day=1;day<=today;day++){
    const dayActs=thisMonth.filter(a=>new Date(a.start_date).getDate()===day);
    cumKm+=dayActs.reduce((s,a)=>s+a.distance/1000,0);
    cumDp+=dayActs.reduce((s,a)=>s+(a.total_elevation_gain||0),0);
    sparkKmData.push(cumKm);
    sparkDpData.push(cumDp);
  }
  renderSparkline('spark-km',sparkKmData,'#10B981');
  renderSparkline('spark-dp',sparkDpData,'#E5562A');

  // Deltas — hero KPIs (compact)
  const pctKm = kmML>0?(kmM-kmML)/kmML*100:null;
  const pctDp = dpML>0?(dpM-dpML)/dpML*100:null;
  const pctRuns = runsML>0?(runsM-runsML)/runsML*100:null;
  const setHeroDelta=(id,pct)=>{const el=document.getElementById(id);if(!el||pct===null)return;const sign=pct>0?'+ ':'− ';el.textContent=`${sign}${Math.abs(Math.round(pct))}% · vs M-1`;el.style.color=pct>5?'var(--vl-growth)':pct<-5?'var(--vl-ember)':'var(--vl-text-3)';};
  setHeroDelta('s-km-month-delta',pctKm);
  setHeroDelta('s-dplus-delta',pctDp);
  // Satellite deltas
  const pctKmW = kmPW>0?(kmW-kmPW)/kmPW*100:null;
  const pctDpW = dpPW>0?(dpW-dpPW)/dpPW*100:null;
  const pctRunsW = runsPW>0?(runsW-runsPW)/runsPW*100:null;
  const setSatDelta=(id,pct)=>{const el=document.getElementById(id);if(!el)return;if(pct===null){el.textContent='';return;}const sign=pct>0?'↑':pct<-5?'↓':'=';el.textContent=`${sign} ${Math.abs(Math.round(pct))}%`;el.style.color=pct>5?'var(--vl-growth)':pct<-5?'var(--vl-ember)':'var(--vl-text-3)';};
  setSatDelta('s-km-week-delta',pctKmW);
  setSatDelta('s-dplus-week-delta',pctDpW);
  setSatDelta('s-runs-delta',pctRuns);
  setSatDelta('s-runs-week-delta',pctRunsW);

  // Simple stats cards
  const fcMax = VLState.userProfile.fc_max || FC_MAX_DEFAULT;
  const withHR = thisMonth.filter(a=>a.average_heartrate);
  const avgFC = withHR.length ? Math.round(withHR.reduce((s,a)=>s+a.average_heartrate,0)/withHR.length) : null;
  document.getElementById('statsGrid').innerHTML = `
    <div class="s-stat"><div class="s-sv">${fmtD(durM)}</div><div class="s-sl">Temps mois</div></div>
    ${avgFC?`<div class="s-stat"><div class="s-sv">${avgFC}</div><div class="s-sl">FC moy mois</div></div>`:''}
    <div class="s-stat" id="aerobicStatCard"><div class="s-sv tc" id="aerobicStatVal" style="font-size:1rem;color:var(--vl-text-3)">…</div><div class="s-sl">% EF · 7j glissants</div></div>
  `;

  // Annual chart
  renderAnnualChart();

  // Activities grid
  renderActivities();

  // Charge / Fatigue block
  const loadEl = document.getElementById('loadBlock');
  if (loadEl) {
    const loadData = computeTrainingLoad(VLState.allActivities, fcMax);
    loadEl.innerHTML = renderLoadBlock(loadData);
    loadEl.style.display = '';
  }

  // % EF glissant 7 jours — streams complets
  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const last7Days = VLState.allActivities.filter(a => new Date(a.start_date) >= sevenDaysAgo);
  loadAerobicStat(last7Days, fcMax);
}

function renderLastActivity() {
  const w = document.getElementById('lastActWidget');
  if (!w) return;
  const act = VLState.allActivities[0];
  if (!act) { w.innerHTML = '<div class="mono t3">Aucune activité</div>'; return; }

  const now = new Date();
  const diffDays = Math.floor((now - new Date(act.start_date)) / 86400000);
  const relDate = diffDays === 0 ? "Aujourd'hui" : diffDays === 1 ? 'Hier' : `Il y a ${diffDays} j`;
  const distKm = (act.distance / 1000).toFixed(1);
  const hasEle = act.total_elevation_gain > 0;
  const hasHR = !!act.average_heartrate;
  const cols = 3 + (hasEle ? 1 : 0) + (hasHR ? 1 : 0);

  w.innerHTML = `
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;gap:8px">
    <div style="min-width:0">
      <div style="font-family:var(--vl-display);font-size:1.1rem;font-weight:800;letter-spacing:.01em;text-transform:uppercase;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(act.name)}</div>
      <div class="mlabel" style="margin-top:3px;color:var(--vl-text-3)">${relDate} · ${new Date(act.start_date).toLocaleDateString('fr-FR',{day:'numeric',month:'long'})}</div>
    </div>
    <span class="act-badge" style="flex-shrink:0">${tL(act.sport_type||act.type)}</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;margin-bottom:10px">
    <div class="vl-strat-dstat" style="background:var(--vl-surf-2);border-radius:var(--vl-r-sm)">
      <div style="font-family:var(--vl-display);font-size:1.3rem;color:var(--vl-growth)">${distKm}</div>
      <div class="mlabel" style="font-size:8px">km</div>
    </div>
    <div class="vl-strat-dstat" style="background:var(--vl-surf-2);border-radius:var(--vl-r-sm)">
      <div style="font-family:var(--vl-display);font-size:1.3rem">${fmtD(act.moving_time)}</div>
      <div class="mlabel" style="font-size:8px">temps</div>
    </div>
    <div class="vl-strat-dstat" style="background:var(--vl-surf-2);border-radius:var(--vl-r-sm)">
      <div style="font-family:var(--vl-display);font-size:1.3rem;color:var(--vl-amber)">${fmtP(act.average_speed)}</div>
      <div class="mlabel" style="font-size:8px">/km</div>
    </div>
    ${hasEle ? `<div class="vl-strat-dstat" style="background:var(--vl-surf-2);border-radius:var(--vl-r-sm)">
      <div style="font-family:var(--vl-display);font-size:1.3rem;color:var(--vl-ember)">+${act.total_elevation_gain}</div>
      <div class="mlabel" style="font-size:8px">D+ m</div>
    </div>` : ''}
    ${hasHR ? `<div class="vl-strat-dstat" style="background:var(--vl-surf-2);border-radius:var(--vl-r-sm)">
      <div style="font-family:var(--vl-display);font-size:1.3rem;color:var(--vl-text-2)">${Math.round(act.average_heartrate)}</div>
      <div class="mlabel" style="font-size:8px">FC moy</div>
    </div>` : ''}
  </div>
  <button class="btn-analyse" onclick="openAnalyse(${JSON.stringify(act).replace(/"/g,'&quot;')})">Analyser cette sortie →</button>`;
}

async function loadAerobicStat(weekActs, fcMax) {
  const el = document.getElementById('aerobicStatVal');
  if (!el) return;
  el.textContent = '…';

  const threshold = fcMax * 0.75;
  if (!weekActs.length) { el.textContent = '—'; return; }
  const candidates = weekActs;

  let totalPts = 0, aerobicPts = 0;
  await Promise.all(candidates.map(async a => {
    try {
      const streams = await fetchStreams(a.id);
      const hr = streams.heartrate?.data;
      if (!hr?.length) return;
      totalPts += hr.length;
      aerobicPts += hr.filter(v => v < threshold).length;
    } catch {}
  }));

  // Re-chercher l'élément : le DOM peut avoir été reconstruit pendant le fetch async
  const elNow = document.getElementById('aerobicStatVal');
  if (!elNow) return;

  if (totalPts === 0) { elNow.textContent = '—'; return; }
  const pct = Math.round(aerobicPts / totalPts * 100);
  elNow.style.color = pct >= 75 ? 'var(--vl-growth)' : pct < 50 ? 'var(--vl-ember)' : '';
  elNow.style.fontSize = '';
  elNow.textContent = pct + '%';
}

// ════════════════════════════════════════════════════
// ANNUAL CHART
// ════════════════════════════════════════════════════
export function setAnnualMode(mode) {
  annualChartMode = mode;
  const base = "font-family:var(--vl-mono);font-size:9px;font-weight:700;letter-spacing:.1em;padding:6px 12px;border-radius:4px;border:1px solid var(--vl-line-2);cursor:pointer;touch-action:manipulation";
  const btnKm = document.getElementById('annualBtnKm');
  const btnDp = document.getElementById('annualBtnDp');
  if (btnKm) btnKm.setAttribute('style', base + (mode==='km' ? ';background:var(--vl-ember);color:var(--vl-ink)' : ';background:transparent;color:var(--vl-text-3)'));
  if (btnDp) btnDp.setAttribute('style', base + (mode==='dp' ? ';background:var(--vl-ember);color:var(--vl-ink)' : ';background:transparent;color:var(--vl-text-3)'));
  renderAnnualChart();
}

function renderAnnualChart() {
  if (annualChartInst) { annualChartInst.destroy(); annualChartInst=null; }

  const isDp = annualChartMode === 'dp';

  // API: distance in meters → /1000 = km. CSV: distance in meters → /1000 = km.
  // Dedup: skip CSV entries whose date already exists in the last 100 API activities.
  const apiDayKeys = new Set(VLState.allActivities.map(a => {
    const d = new Date(a.start_date);
    return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }).filter(Boolean));

  // Parse CSV dates once at map time → store as ISO so accumulation uses plain new Date()
  const histRuns = historyActivities.map(h => {
    const d = parseCsvDate(h['Activity Date'] || h['Date']);
    if (!d || isNaN(d.getTime())) return null;
    if (apiDayKeys.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)) return null;
    return {
      type: h['Activity Type']==='Trail Run'?'TrailRun':'Run',
      distance: parseFloat(h['Distance'])||0,
      total_elevation_gain: parseFloat(h['Elevation Gain'])||0,
      start_date: d.toISOString(),
    };
  }).filter(Boolean);

  const allRuns = [...VLState.allActivities, ...histRuns]
    .filter(a => isRun(a.type) && (isDp ? true : a.distance>0));

  const monthly = {};
  const yearly = {};
  allRuns.forEach(a => {
    const d = new Date(a.start_date);
    if (isNaN(d.getTime())) return;
    const y = d.getFullYear().toString();
    const m = d.getMonth();
    if (!monthly[y]) monthly[y] = Array(12).fill(0);
    if (!yearly[y])  yearly[y]  = Array(12).fill(0);
    const val = isDp ? (a.total_elevation_gain||0) : a.distance/1000;
    monthly[y][m] += val;
    yearly[y][m]  += val;
  });

  const sortedYears = Object.keys(yearly).sort().slice(-2);
  if (!sortedYears.length) return;

  const colors = ['#5E5B52','#10B981'];
  const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const yUnit = isDp ? 'm' : 'km';

  const datasets = sortedYears.map((y,i) => {
    let cum = 0;
    const data = yearly[y].map((v,m) => {
      if(parseInt(y)===currentYear && m>currentMonth) return null;
      cum += v;
      return Math.round(cum);
    });
    const isCurrent = parseInt(y)===currentYear;
    return {
      label: y, data,
      borderColor: colors[i%colors.length],
      backgroundColor: isCurrent ? 'rgba(16,185,129,0.08)' : 'transparent',
      fill: isCurrent,
      tension:.4, pointRadius:isCurrent?2:0, borderWidth:isCurrent?2:1.5,
      borderDash: isCurrent ? [] : [4,3],
      spanGaps:false
    };
  });

  annualChartInst = new Chart(document.getElementById('annualChart'), {
    type:'line', data:{labels:months,datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{position:'bottom',labels:{boxWidth:8,font:{size:9,family:'JetBrains Mono, monospace'},color:'#9B978A',padding:10}},
        tooltip:{
          callbacks:{
            label: ctx => {
              const y = ctx.dataset.label;
              const m = ctx.dataIndex;
              const mo = Math.round(monthly[y]?.[m] || 0);
              const cum = ctx.parsed.y || 0;
              return `${y}  ·  ${mo}${yUnit} ce mois  ·  ${cum}${yUnit} cumulé`;
            }
          }
        }
      },
      scales:{
        x:{ticks:{font:{size:9,family:'JetBrains Mono, monospace'},color:'#5E5B52'},grid:{color:'rgba(243,239,228,.04)'}},
        y:{ticks:{font:{size:9,family:'JetBrains Mono, monospace'},color:'#5E5B52',callback:v=>v+yUnit},grid:{color:'rgba(243,239,228,.04)'}}
      }
    }
  });
}

// ════════════════════════════════════════════════════
// ACTIVITIES LIST
// ════════════════════════════════════════════════════
function renderActivities() {
  const grid = document.getElementById('actsGrid');
  const gridFull = document.getElementById('actsGridFull');
  const infoEl = document.getElementById('actsInfo');
  const infoFull = document.getElementById('actsInfoFull');
  if (infoEl) infoEl.textContent = `${VLState.allActivities.length} sorties`;
  if (infoFull) infoFull.textContent = `${VLState.allActivities.length} sorties`;
  if (grid) grid.innerHTML = '';
  if (gridFull) gridFull.innerHTML = '';
  VLState.allActivities.forEach((act, idx) => {
    const d = new Date(act.start_date_local);
    const ds = d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}).toUpperCase();
    const pace = fmtP(act.average_speed);
    const distKm = (act.distance/1000).toFixed(1);
    const meta = [distKm+' km', fmtD(act.moving_time), act.total_elevation_gain>0?`D+ ${act.total_elevation_gain}m`:null, act.average_heartrate?`${Math.round(act.average_heartrate)} bpm`:null].filter(Boolean).join(' · ');
    const makeCard = () => {
      const card = document.createElement('div');
      card.className = 'act-card';
      card.onclick = () => openAnalyse(act);
      card.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="act-name">${escapeHTML(act.name)}</div>
          <div class="act-meta">${meta}</div>
        </div>
        <div style="flex-shrink:0;text-align:right">
          <div class="act-pace">${pace}</div>
          <div class="act-date">/KM · ${ds}</div>
          <div class="act-badge" style="margin-top:4px;display:inline-block">${tL(act.type)}</div>
        </div>`;
      return card;
    };
    if (grid && idx < 4) grid.appendChild(makeCard());
    if (gridFull) gridFull.appendChild(makeCard());
  });
}

// ════════════════════════════════════════════════════
// PAF
// ════════════════════════════════════════════════════

// ════════════════════════════════════════════════════
// RACE CALENDAR
// ════════════════════════════════════════════════════
export function handleZipDrop(e){e.preventDefault();document.getElementById('zipDropZone').classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f&&f.name.endsWith('.zip'))processZip(f);}
export function handleZipFile(e){const f=e.target.files[0];if(f)processZip(f);}

async function processZip(file) {
  const stats=document.getElementById('histStats');
  stats.style.display='block';
  stats.innerHTML='<div class="mono">Lecture du ZIP en cours...</div>';
  try {
    const zip=await JSZip.loadAsync(file);
    let csvFile=zip.file('activities.csv');
    if(!csvFile){const keys=Object.keys(zip.files);const k=keys.find(k=>k.endsWith('activities.csv'));if(k)csvFile=zip.file(k);}
    if(!csvFile){stats.innerHTML='<div class="mono tr">activities.csv introuvable dans le ZIP</div>';return;}
    const text=await csvFile.async('string');
    await parseAndSaveCSV(text, stats);
  } catch(e){stats.innerHTML=`<div class="mono tr">Erreur : ${escapeHTML(e.message)}</div>`;}
}

async function parseAndSaveCSV(text, statsEl) {
  const lines=text.split('\n').filter(l=>l.trim());
  if(!lines.length)return;
  const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
  const rows=lines.slice(1).map(line=>{
    const vals=[];let cur='',inQ=false;
    for(const ch of line){if(ch==='"')inQ=!inQ;else if(ch===','&&!inQ){vals.push(cur.trim());cur='';}else cur+=ch;}
    vals.push(cur.trim());
    const obj={};headers.forEach((h,i)=>obj[h]=vals[i]||'');return obj;
  }).filter(r=>{const t=r['Activity Type']||r['Type']||'';return['Run','Trail Run','Running'].includes(t);});

  historyActivities=rows;
  const totalKm=rows.reduce((s,r)=>s+(parseFloat(r['Distance'])||0),0)/1000;
  const totalDplus=rows.reduce((s,r)=>s+(parseFloat(r['Elevation Gain'])||0),0);
  const dates=rows.map(r=>r['Activity Date']||r['Date']).filter(Boolean).sort();

  const {error}=await sb.from('activities_history').delete().eq('user_id',VLState.currentUser.id).then(()=>
    sb.from('activities_history').insert({user_id:VLState.currentUser.id,data:rows,imported_at:new Date().toISOString()})
  );

  statsEl.innerHTML=`
    <div class="hsr"><span class="t2">Activités running importées</span><span class="mono">${rows.length}</span></div>
    <div class="hsr"><span class="t2">Distance totale</span><span class="mono">${totalKm.toFixed(0)} km</span></div>
    <div class="hsr"><span class="t2">D+ total</span><span class="mono">${totalDplus.toFixed(0)} m</span></div>
    <div class="hsr"><span class="t2">Période</span><span class="mono">${dates[0]?.split(' ')[0]||'?'} → ${dates[dates.length-1]?.split(' ')[0]||'?'}</span></div>
    ${error?`<div style="color:var(--red);font-size:.7rem;margin-top:6px">Erreur sauvegarde : ${escapeHTML(String(error.message||error))}</div>`:`<div style="color:var(--green);font-family:var(--mono);font-size:.6rem;margin-top:6px">✓ Historique sauvegardé</div>`}`;

  // Update annual chart with history
  renderAnnualChart();
  // Update onboarding steps
  updateOnboardingSteps();
}

async function loadHistoryFromDB() {
  const {data}=await sb.from('activities_history').select('data').eq('user_id',VLState.currentUser.id).single();
  if(data?.data){historyActivities=data.data;renderAnnualChart();}
}

function updateOnboardingSteps() {
  if(VLState.allActivities.length>0){document.getElementById('step1').classList.add('done');document.getElementById('step1-num').textContent='✓';}
  if(historyActivities.length>0){document.getElementById('step2').classList.add('done');document.getElementById('step2-num').textContent='✓';}
  if(VLState.userProfile.fc_max||VLState.userProfile.vo2max){document.getElementById('step3').classList.add('done');document.getElementById('step3-num').textContent='✓';}
}

// ════════════════════════════════════════════════════
// GPX STRATEGY
// ════════════════════════════════════════════════════
export function openProfil() { navigate('profil'); }
export function closeProfil() { navigate('dashboard'); }

function populateProfilPanel() {
  if(VLState.currentUser?.email) {
    const el = document.getElementById('p-email');
    if(el) el.value = VLState.currentUser.email;
  }
  const preview = document.getElementById('avatarPreview');
  if(preview && !preview.querySelector('img')) {
    const name = (VLState.userProfile?.name || '').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : parts[0] ? parts[0].slice(0,2).toUpperCase() : 'AB';
    preview.textContent = initials;
  }
  renderNutritionProducts();
}

export function switchProfilTab(tab) {
  document.querySelectorAll('.vl-profil-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.vl-tab').forEach(b => b.classList.remove('active'));
  const content = document.getElementById('tab-' + tab);
  if(content) content.style.display = 'block';
  document.querySelector(`.vl-tab[data-tab="${tab}"]`)?.classList.add('active');
  // Update URL for deep linking without re-triggering hashchange
  const hash = tab === 'compte' ? 'profil' : `profil-${tab}`;
  if(window.location.hash.slice(1) !== hash) history.replaceState(null, '', '#' + hash);
}
export async function changePassword() {
  const msg=document.getElementById('pwMsg');
  msg.textContent='Envoi...';msg.style.color='var(--text2)';
  const {error}=await sb.auth.resetPasswordForEmail(VLState.currentUser.email,{redirectTo:REDIRECT_URI});
  if(error){msg.textContent='❌ '+error.message;msg.style.color='var(--red)';}
  else{msg.textContent='✓ Email envoyé !';msg.style.color='var(--green)';}
}
let _cropState = {x:0,y:0,scale:1,startX:0,startY:0,startDist:0,dragging:false};

export async function uploadAvatar(event) {
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const modal = document.getElementById('cropModal');
    const img = document.getElementById('cropImage');
    modal.style.display = 'flex';
    img.onload = () => {
      // Center image in 280x280 container
      const r = Math.max(280/img.naturalWidth, 280/img.naturalHeight);
      _cropState = {x:0, y:0, scale:r, startX:0, startY:0, startDist:0, dragging:false};
      applyTransform();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function applyTransform() {
  const img = document.getElementById('cropImage');
  img.style.transform = `translate(${_cropState.x}px,${_cropState.y}px) scale(${_cropState.scale})`;
  img.style.transformOrigin = 'top left';
}

export function closeCropModal() {
  document.getElementById('cropModal').style.display = 'none';
}

export async function confirmCrop() {
  const img = document.getElementById('cropImage');
  const size = 400;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const s = _cropState.scale;
  // Draw cropped area
  ctx.drawImage(img,
    -_cropState.x/s, -_cropState.y/s,
    280/s, 280/s,
    0, 0, size, size
  );
  closeCropModal();
  showToast('Upload en cours...', 'info', 2000);
  canvas.toBlob(async (blob) => {
    const path = `${VLState.currentUser.id}/avatar.jpg`;
    const {error} = await sb.storage.from('avatars').upload(path, blob, {upsert:true, contentType:'image/jpeg'});
    if(error){ showToast('Erreur : '+error.message, 'error'); return; }
    const {data} = sb.storage.from('avatars').getPublicUrl(path);
    const url = data.publicUrl + '?t=' + Date.now();
    await sb.from('profiles').upsert({id:VLState.currentUser.id, avatar_url:url});
    VLState.userProfile.avatar_url = url;
    updateAvatar(url);
    showToast('Photo mise à jour ✓', 'success');
  }, 'image/jpeg', 0.88);
}

// Touch & mouse events for crop
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cropContainer');
  if(!container) return;
  let lastTouchDist = 0;

  container.addEventListener('mousedown', e => { _cropState.dragging=true; _cropState.startX=e.clientX-_cropState.x; _cropState.startY=e.clientY-_cropState.y; });
  document.addEventListener('mousemove', e => { if(!_cropState.dragging) return; _cropState.x=e.clientX-_cropState.startX; _cropState.y=e.clientY-_cropState.startY; applyTransform(); });
  document.addEventListener('mouseup', () => _cropState.dragging=false);

  container.addEventListener('touchstart', e => {
    if(e.touches.length===1){ _cropState.dragging=true; _cropState.startX=e.touches[0].clientX-_cropState.x; _cropState.startY=e.touches[0].clientY-_cropState.y; }
    if(e.touches.length===2){ lastTouchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); }
    e.preventDefault();
  },{passive:false});
  container.addEventListener('touchmove', e => {
    if(e.touches.length===1 && _cropState.dragging){ _cropState.x=e.touches[0].clientX-_cropState.startX; _cropState.y=e.touches[0].clientY-_cropState.startY; applyTransform(); }
    if(e.touches.length===2){
      const dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      _cropState.scale*=dist/lastTouchDist; lastTouchDist=dist; applyTransform();
    }
    e.preventDefault();
  },{passive:false});
  container.addEventListener('touchend', () => _cropState.dragging=false);
});
function updateAvatar(url) {
  const mark=document.getElementById('avatarMark');
  const preview=document.getElementById('avatarPreview');
  if(url){
    if(mark) mark.innerHTML=`<img src="${escapeAttr(safeUrl(url))}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
    if(preview)preview.innerHTML=`<img src="${escapeAttr(safeUrl(url))}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  }
}

// ════════════════════════════════════════════════════
// TOASTS
// ════════════════════════════════════════════════════
export function showToast(msg, type='info', duration=4000) {
  const icons = {success:'✓',error:'✕',info:'ℹ'};
  const colors = {success:'var(--green)',error:'var(--red)',info:'var(--cyan)'};
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="color:${colors[type]};font-weight:700;font-size:1rem">${icons[type]}</span><span>${escapeHTML(msg)}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;margin-left:auto;font-size:1rem">×</button>`;
  container.appendChild(toast);
  setTimeout(()=>{
    toast.style.animation='slideOut .25s ease forwards';
    setTimeout(()=>toast.remove(), 250);
  }, duration);
}

// Patch global error handler
window.addEventListener('unhandledrejection', e => {
  const msg = e.reason?.message || e.reason || 'Erreur inconnue';
  if(msg.includes('Failed to fetch')||msg.includes('network')) showToast('Problème réseau — vérifie ta connexion', 'error');
  else if(msg.includes('JWT')||msg.includes('auth')) showToast('Session expirée — reconnecte-toi', 'error');
});

// ════════════════════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════════════════════
let onbStep = 0;
const ONB_TOTAL = 5;

function initOnboarding() {
  // Show only if profile is empty (new user)
  if(!VLState.userProfile.name && !VLState.userProfile.fc_max) {
    openOnboarding();
  }
}

function openOnboarding() {
  onbStep = 0;
  updateOnbStep();
  document.getElementById('onboardingOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeOnboarding() {
  document.getElementById('onboardingOverlay').classList.remove('open');
  document.body.style.overflow = '';
  localStorage.setItem('onb_done', '1');
}

export function onbNav(dir) {
  onbStep = Math.max(0, Math.min(ONB_TOTAL-1, onbStep+dir));
  updateOnbStep();
  if(onbStep === ONB_TOTAL-1) {
    document.getElementById('onbNext').textContent = 'Commencer →';
    document.getElementById('onbNext').onclick = closeOnboarding;
  } else {
    document.getElementById('onbNext').textContent = 'Suivant →';
    document.getElementById('onbNext').onclick = () => onbNav(1);
  }
  document.getElementById('onbPrev').style.opacity = onbStep===0?'0':'1';
  document.getElementById('onbPrev').style.pointerEvents = onbStep===0?'none':'all';
}

function updateOnbStep() {
  document.querySelectorAll('.onb-step').forEach((el,i)=>el.classList.toggle('active',i===onbStep));
  // Dots
  ['onbDots','onbDots2'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML = Array.from({length:ONB_TOTAL},(_,i)=>`<div class="onb-dot${i===onbStep?' active':''}"></div>`).join('');
  });
}

// ════════════════════════════════════════════════════
// CGU
// ════════════════════════════════════════════════════
export function openCGU() {
  document.getElementById('cguOverlay').classList.add('open');
}
export function closeCGU() {
  document.getElementById('cguOverlay').classList.remove('open');
}

// ════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await initApp(session.user);
  } else {
    document.getElementById('authScreen').classList.add('show');
  }
});

window.addEventListener('scroll',()=>{
  const b=document.getElementById('scrollTopBtn');
  if(b) b.style.display=window.scrollY>350?'flex':'none';
},{passive:true});
