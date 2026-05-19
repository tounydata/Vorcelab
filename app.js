// ════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════
const SUPA_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhbnpya2RncW1jY3R3dm5ibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjYyNjksImV4cCI6MjA5MzAwMjI2OX0.sSjZ956YRpSpCFxDrYDntTvIGHnmVEbe3JDsjTJsze4';
const CLIENT_ID = '161609'; // Strava Client ID — public, safe in frontend
const REDIRECT_URI = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}/`;
const FC_MAX_DEFAULT = 205;
const RUNNING_TYPES = ['Run', 'TrailRun', 'Trail Run', 'Running'];

// Dismiss splash after animation completes
(function(){
  const splash = document.getElementById('splashScreen');
  if(!splash) return;
  setTimeout(()=>{ splash.classList.add('vl-fade'); setTimeout(()=>splash.remove(), 420); }, 1300);
})();

const { createClient } = supabase;
const sb = createClient(SUPA_URL, SUPA_KEY);

let currentUser = null;
let userProfile = { pain_zones: [] };
let allActivities = []; // from Strava API — runs only
let historyActivities = []; // from ZIP
let races = [];
let annualChartInst = null;
let annualChartMode = 'km';
let isLight = false;
let themeMode = localStorage.getItem('vl-theme') || 'auto'; // 'dark' | 'light' | 'auto'

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
const isRun = t => ['Run','TrailRun','Trail Run','Running'].includes(t);
const fmtP = s => s > 0 ? `${Math.floor(1000/s/60)}:${String(Math.round(1000/s%60)).padStart(2,'0')}` : '--';
const fmtD = s => { const h=Math.floor(s/3600),m=Math.floor(s%3600/60); return h>0?`${h}h${String(m).padStart(2,'0')}`:`${m}min`; };
const tE = t => ({Run:'🏃',TrailRun:'⛰️'}[t]||'🏃');
const tL = t => ({Run:'Route',TrailRun:'Trail'}[t]||'Run');

// ── XSS helpers ──────────────────────────────────────────────────────────────
function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const t = url.trim();
  return /^javascript:/i.test(t) ? '' : t;
}
// Robust CSV date parser — handles "Jan 5, 2025, 6:00:00 AM", ISO, and UTC variants
function parseCsvDate(str) {
  if (!str) return null;
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  d = new Date(str.replace(' UTC','').replace(/,(\s*\d{4}),/,', $1'));
  if (!isNaN(d.getTime())) return d;
  // "Jan 5 2025 6:00:00" style
  d = new Date(str.replace(/,/g,''));
  return isNaN(d.getTime()) ? null : d;
}
const bC = t => t==='TrailRun'?'linear-gradient(90deg,#ff6b35,#fbbf24)':'linear-gradient(90deg,#00d4ff,#a78bfa)';

function deltaHTML(pct, label='mois dernier') {
  if (!pct && pct !== 0) return '';
  if (pct > 5) return `<span class="delta-up">↑ +${Math.round(pct)}% vs ${label}</span>`;
  if (pct < -5) return `<span class="delta-down">↓ ${Math.round(pct)}% vs ${label}</span>`;
  return `<span class="delta-eq">= stable vs ${label}</span>`;
}

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
function setTheme(mode) {
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
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item[data-panel]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bni[data-panel]').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if(!panel) return;
  panel.classList.add('active');
  document.querySelector(`.sidebar-item[data-panel="${name}"]`)?.classList.add('active');
  document.querySelector(`.bni[data-panel="${name}"]`)?.classList.add('active');
  if(name==='strategie') { renderCalendar(); }
  if(name==='renfo') { loadRenfoApp(); }
  if(name==='strategie' && !currentRaceContext) {
    const drop=document.getElementById('gpxDrop');
    if(drop){
      drop.style.display='block';
      drop.onclick=()=>document.getElementById('gpxFile').click();
      drop.innerHTML=`<div style="font-size:2.5rem;margin-bottom:.75rem">🗺️</div><div style="font-family:var(--display);font-size:1.4rem;letter-spacing:.03em;margin-bottom:.4rem">Déposer le fichier GPX</div><div class="mono">Compatible OpenRunner · Strava · Garmin Connect</div>`;
    }
  }
}

function navigate(panel) {
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
function switchTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('authMsg').textContent = '';
}

async function login() {
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
async function signup() {
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
async function disconnectStrava() {
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

    allActivities = [];

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
async function deleteAccount() {
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

    currentUser = null;
    userProfile = { pain_zones: [] };
    allActivities = [];
    historyActivities = [];
    races = [];

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
async function logout() {
  await sb.auth.signOut();

  currentUser = null;
  userProfile = { pain_zones: [] };
  allActivities = [];
  historyActivities = [];
  races = [];

  document.querySelectorAll('.modal, .overlay, .drawer, .profile-modal').forEach(el => {
    el.classList.remove('show', 'active', 'open');
    el.style.display = 'none';
  });

  document.getElementById('appShell').classList.remove('show');
  document.getElementById('authScreen').classList.add('show');
}

async function initApp(user) {
  currentUser = user;
  document.getElementById('authScreen').classList.remove('show');
  document.getElementById('appShell').classList.add('show');
  await loadProfile();
  await loadRaces();
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
}

// ════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════
const PAIN_ZONES = [
  {key:'knee',label:'Genou',icon:'🦵'},{key:'achilles',label:"Tendon d'Achille",icon:'🦶'},
  {key:'hip',label:'Hanche / ITB',icon:'🏃'},{key:'plantar',label:'Fascia plantaire',icon:'👣'},
  {key:'shin',label:'Périostite tibiale',icon:'🦴'},{key:'lower_back',label:'Bas du dos',icon:'💪'},
  {key:'hamstring',label:'Ischio-jambiers',icon:'🦵'},{key:'calf',label:'Mollet',icon:'⚡'},
];

function renderPainGrid() {
  const grid = document.getElementById('painGrid'); 
  if(!grid) return;
  grid.innerHTML = '';
  PAIN_ZONES.forEach(z => {
    const active = (userProfile.pain_zones||[]).includes(z.key);
    const div = document.createElement('div');
    div.className = 'pain-zone' + (active ? ' active' : '');
    div.onclick = () => { togglePainZone(z.key, div); };
    div.innerHTML = `<input type="checkbox" ${active?'checked':''}><span style="font-size:.8rem;font-weight:500">${z.icon} ${z.label}</span>`;
    grid.appendChild(div);
  });
}

function togglePainZone(key, el) {
  if (!userProfile.pain_zones) userProfile.pain_zones = [];
  const idx = userProfile.pain_zones.indexOf(key);
  if (idx >= 0) { userProfile.pain_zones.splice(idx,1); el.classList.remove('active'); el.querySelector('input').checked=false; }
  else { userProfile.pain_zones.push(key); el.classList.add('active'); el.querySelector('input').checked=true; }
}

function updateSilhouetteSex() {
  const sex = userProfile?.sex || 'M';
  const isFemale = sex === 'F';
  const show = (id, visible) => { const el=document.getElementById(id); if(el) el.style.display=visible?'':'none'; };
  show('sg-front-m', !isFemale); show('sg-front-f', isFemale);
  show('sg-back-m', !isFemale); show('sg-back-f', isFemale);
}

async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) {
    userProfile = { pain_zones: [], ...data };
    userProfile.pain_zones = userProfile.pain_zones || [];
    const set = (id, val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
    set('p-name', data.name); set('p-birthdate', data.birthdate); set('p-sex', data.sex);
    set('p-weight', data.weight); set('p-height', data.height);
    set('p-vo2max', data.vo2max); set('p-fcmax', data.fc_max);
    set('p-lactate', data.lactate_threshold); set('p-lactate-pace', data.lactate_pace);
    set('p-goals', data.goals);
    if (data.name) { document.getElementById('headerName').textContent = data.name; const hm=document.getElementById('headerNameMobile'); if(hm) hm.textContent=data.name; }
    if (data.avatar_url) updateAvatar(data.avatar_url);
    if (data.nutrition_products) userProfile.nutrition_products = data.nutrition_products;
    if (data.prs) {
      const p = data.prs; userProfile.prs = p;
      const sp = (id,v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
      if(p['5k']){sp('pr-5k',p['5k'].time);sp('pr-5k-date',p['5k'].date);}
      if(p['10k']){sp('pr-10k',p['10k'].time);sp('pr-10k-date',p['10k'].date);}
      if(p['15k']){sp('pr-15k',p['15k'].time);sp('pr-15k-date',p['15k'].date);}
      if(p['semi']){sp('pr-semi',p['semi'].time);sp('pr-semi-date',p['semi'].date);}
      if(p['marathon']){sp('pr-marathon',p['marathon'].time);sp('pr-marathon-date',p['marathon'].date);}
      if(p['ultra']){sp('pr-ultra',p['ultra'].time);sp('pr-ultra-date',p['ultra'].date);sp('pr-ultra-dist',p['ultra'].dist);sp('pr-ultra-dplus',p['ultra'].dplus);}
    }
    updateSilhouetteSex();
  }
}

async function saveProfile() {
  const profile = {
    id: currentUser.id,
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
    pain_zones: userProfile.pain_zones||[],
    goals: document.getElementById('p-goals').value||null,
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('profiles').upsert(profile);
  const msg = document.getElementById('profileSaveMsg');
  if (error) { msg.textContent='❌ '+error.message; msg.style.color='var(--red)'; }
  else { userProfile={...userProfile,...profile}; updateSilhouetteSex(); msg.textContent='✓ Sauvegardé'; msg.style.color='var(--green)'; if(profile.name){document.getElementById('headerName').textContent=profile.name;const hm=document.getElementById('headerNameMobile');if(hm)hm.textContent=profile.name;} setTimeout(()=>msg.textContent='',3000); }
}

function parsePRTime(str) {
  if (!str||!str.trim()) return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length===3) return parts[0]*3600+parts[1]*60+parts[2];
  if (parts.length===2) return parts[0]*60+parts[1];
  return null;
}

async function savePRs() {
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
  const {error}=await sb.from('profiles').upsert({id:currentUser.id,prs,updated_at:new Date().toISOString()});
  const msg=document.getElementById('prSaveMsg');
  if(error){msg.textContent='❌ '+error.message;msg.style.color='var(--red)';}
  else{userProfile.prs=prs;msg.textContent='✓ PR sauvegardés';msg.style.color='var(--green)';setTimeout(()=>msg.textContent='',3000);}
}

// ════════════════════════════════════════════════════
// STRAVA AUTH
// ════════════════════════════════════════════════════
function connectStrava() {
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
  document.getElementById('statusDot').className = 'dot dot-on';
  document.getElementById('statusText').textContent = name || 'Connecté';
  document.getElementById('btnStrava').style.display = 'none';
  const s = document.getElementById('btnSync'); if(s) s.style.display = 'inline-flex';
  const dotM = document.getElementById('statusDotMobile'); if(dotM) dotM.className = 'dot dot-on';
  const sm = document.getElementById('btnSyncMobile'); if(sm) sm.style.display = 'inline-flex';
  const bsm = document.getElementById('btnStravaMobile'); if(bsm) bsm.style.display = 'none';
}

async function manualSync() {
  const btn = document.getElementById('btnSync');
  if(btn) { btn.textContent = '⟳'; btn.style.animation = 'spin 1s linear infinite'; btn.disabled = true; }
  showToast('Synchronisation Strava en cours…', 'info', 3000);
  try {
    await refreshActivitiesFromServer();
    await new Promise(r => setTimeout(r, 3000)); // laisse le temps à l'edge function
    await loadActivities();
    renderDashboard();
    showToast('Synchronisation terminée ✓', 'success');
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
    .eq('user_id', currentUser.id)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(200);
  if (error) { console.error('loadActivities error:', error.message); return; }
  allActivities = (rows || []).filter(r => isRun(r.type)).map(mapDbActivity);
  if (allActivities.length > 0) setStravaConnected();
  renderDashboard();
}

async function fetchStreams(activityId) {
  // Proxy via edge function — never exposes Strava token to browser
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) return {};
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ activityId, keys: 'time,distance,altitude,heartrate,velocity_smooth,cadence,latlng' }),
    });
    if (!r.ok) return {};
    return r.json();
  } catch { return {}; }
}

async function fetchWeather(lat, lon, date) {
  const d=date.split('T')[0], h=parseInt(date.split('T')[1]?.split(':')[0]||10);
  try {
    const r=await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${d}&end_date=${d}&hourly=temperature_2m,precipitation,windspeed_10m&timezone=Europe%2FParis`);
    const data=await r.json();
    return {temp:data.hourly?.temperature_2m?.[h]??null,precip:data.hourly?.precipitation?.[h]??null,wind:data.hourly?.windspeed_10m?.[h]??null};
  } catch { return null; }
}

// ════════════════════════════════════════════════════
// MONTHLY CALENDAR
// ════════════════════════════════════════════════════
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

function showAddRaceForm() {
  const card = document.getElementById('addRaceCard');
  if(card) card.style.display = card.style.display==='none'?'block':'none';
}

function renderCalendar() {
  const titleEl = document.getElementById('calMonthTitle');
  const gridEl = document.getElementById('calGrid');
  if(!titleEl || !gridEl) return;

  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  titleEl.textContent = `${months[calMonth]} ${calYear}`;

  const today = new Date();
  // First day of month (0=Sun..6=Sat → convert to Mon-based 0-6)
  const firstDay = new Date(calYear, calMonth, 1);
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // Mon=0

  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();

  // Build lookup: dateStr → race
  const raceByDate = {};
  (races||[]).forEach(r => { if(r.date) raceByDate[r.date.substring(0,10)] = r; });

  // Build activity lookup: dateStr → [activities]
  const actsByDate = {};
  (allActivities||[]).forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) return;
    if (!actsByDate[d]) actsByDate[d] = [];
    actsByDate[d].push(a);
  });

  // Build renfo log lookup: dateStr → log
  const renfoByDate = {};
  (typeof renfoSessionLogs !== 'undefined' ? renfoSessionLogs : []).forEach(l => {
    if (l.session_date) renfoByDate[l.session_date] = l;
  });

  let cells = '';
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  for(let i = 0; i < totalCells; i++){
    let dayNum, month = calMonth, year = calYear, otherMonth = false;
    if(i < startDow){ dayNum = daysInPrev - startDow + i + 1; month = calMonth-1; if(month<0){month=11;year=calYear-1;} otherMonth=true; }
    else if(i >= startDow + daysInMonth){ dayNum = i - startDow - daysInMonth + 1; month = calMonth+1; if(month>11){month=0;year=calYear+1;} otherMonth=true; }
    else { dayNum = i - startDow + 1; }

    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    const isToday = !otherMonth && year===today.getFullYear() && month===today.getMonth() && dayNum===today.getDate();
    const race = raceByDate[dateStr];
    const typeEmoji = race ? (race.type==='Trail'?'⛰️':race.type==='Ultra'?'🦅':'🏃') : '';

    // Activity micro-chips (runs + renfo)
    const dayActs = actsByDate[dateStr] || [];
    const renfoLog = renfoByDate[dateStr];
    let chipsHtml = '';
    dayActs.forEach(a => {
      const km = (a.distance / 1000).toFixed(1);
      const isTrail = (a.sport_type||'').toLowerCase().includes('trail');
      chipsHtml += `<div style="font-family:var(--vl-mono);font-size:9px;color:${isTrail?'var(--cyan)':'var(--green)'};line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${isTrail?'⛰':'🏃'} ${km}k</div>`;
    });
    if (renfoLog) {
      const renfoSched = typeof renfoProgram !== 'undefined' ? renfoProgram?.week_schedule?.[renfoLog.day_key] : null;
      const renfoFocusColors = typeof RENFO_FOCUS_COLORS !== 'undefined' ? RENFO_FOCUS_COLORS : {};
      const dotCol = renfoFocusColors[renfoSched?.focus] || '#e5562a';
      chipsHtml += `<div style="display:flex;align-items:center;gap:3px;margin-top:1px"><div style="width:5px;height:5px;border-radius:50%;background:${dotCol};flex-shrink:0"></div><div style="font-family:var(--vl-mono);font-size:9px;color:${dotCol};line-height:1">💪</div></div>`;
    }

    cells += `<div class="cal-cell${otherMonth?' other-month':''}${isToday?' today':''}${race?' has-event':''}" ${race?`onclick="openEventView('${escapeAttr(race.id)}')"`:''}>
      <div class="cal-day-num">${dayNum}</div>
      ${race ? `<div class="cal-event-dot">${typeEmoji} ${escapeHTML(race.name)}</div><div class="cal-event-type">${race.distance||'?'}km${race.elevation?` · ${race.elevation}m D+`:''}</div>` : ''}
      ${chipsHtml ? `<div style="margin-top:${race?'2px':'1px'}">${chipsHtml}</div>` : ''}
    </div>`;
  }
  gridEl.innerHTML = cells;

  // Upcoming races list
  const upcoming = (races||[]).filter(r=>r.date && new Date(r.date)>=new Date()).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,5);
  const upEl = document.getElementById('upcomingRaces');
  if(upEl){
    upEl.innerHTML = upcoming.length ? `
      <div class="clabel" style="margin-bottom:8px">Prochaines courses</div>
      ${upcoming.map(r=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="openEventView('${escapeAttr(r.id)}')">
        <div style="font-size:1.2rem">${r.type==='Trail'?'⛰️':r.type==='Ultra'?'🦅':'🏃'}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.85rem">${escapeHTML(r.name)}</div>
          <div class="mono t3" style="font-size:.6rem">${new Date(r.date).toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})} · ${r.distance||'?'}km${r.elevation?` · ${r.elevation}m D+`:''}</div>
        </div>
        <div class="mono" style="font-size:.7rem;color:var(--cyan)">${Math.ceil((new Date(r.date)-new Date())/(1000*60*60*24))}j →</div>
      </div>`).join('')}` : '<div class="mono t3">Aucune course à venir — clique sur "+ Ajouter une course"</div>';
  }
}

function calNavMonth(dir) {
  calMonth += dir;
  if(calMonth > 11){ calMonth=0; calYear++; }
  if(calMonth < 0){ calMonth=11; calYear--; }
  renderCalendar();
}

function openEventView(raceId) {
  const race = (races||[]).find(r=>String(r.id)===String(raceId));
  if(!race) return;
  window._openEventRace = race; // stable reference for edit form
  document.getElementById('calView').style.display = 'none';
  document.getElementById('eventView').style.display = 'block';
  const titleEl = document.getElementById('eventViewTitle');
  if(titleEl) titleEl.textContent = race.name.toUpperCase();
  const subEl = document.getElementById('eventViewSubtitle');
  if(subEl) {
    const typeLabel = race.type==='Trail'?'Trail':race.type==='Ultra'?'Ultra Trail':'Route';
    const dateStr = new Date(race.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    subEl.textContent = `${typeLabel} · ${dateStr}`;
  }
  const delBtn = document.getElementById('btnDeleteRace');
  if(delBtn) delBtn.onclick = ()=>deleteRace(raceId);
  const compSec = document.getElementById('eventComparisonSection');
  if(compSec) compSec.innerHTML = '';
  prepareRace(race);
  // Load comparison if race already has linked activity + GPX
  if(race.strava_activity_id && race.gpx_data) {
    const actId = race.strava_activity_id;
    const actObj = allActivities.find(a=>String(a.id)===String(actId)) || {id:actId, moving_time:0};
    fetchStreams(actId).then(streams => {
      renderRaceComparison(actObj, streams, race, 'eventComparisonSection');
    }).catch(()=>{});
  }
}

function showEventSplash(race) {
  if (navigator.vibrate) navigator.vibrate(20);
  let traceSvg = '';
  if (race.gpx_data) {
    try {
      const pts = JSON.parse(race.gpx_data);
      const step = Math.max(1, Math.floor(pts.length/200));
      const sampled = pts.filter((_,i)=>i%step===0);
      const lats=sampled.map(p=>p.lat), lons=sampled.map(p=>p.lon);
      const minLat=Math.min(...lats), maxLat=Math.max(...lats), dLat=maxLat-minLat||0.001;
      const minLon=Math.min(...lons), maxLon=Math.max(...lons), dLon=maxLon-minLon||0.001;
      const VW=300, VH=180;
      const scale=Math.min(VW/dLon, VH/dLat)*0.82;
      const ox=(VW-dLon*scale)/2, oy=(VH-dLat*scale)/2;
      const tracePts=sampled.map(p=>`${(ox+(p.lon-minLon)*scale).toFixed(1)},${(oy+(maxLat-p.lat)*scale).toFixed(1)}`);
      traceSvg = `<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" style="width:min(85%,340px);height:160px;display:block;margin:0 auto"><polyline pathLength="1" points="${tracePts.join(' ')}" fill="none" stroke="var(--vl-ember)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="1" style="animation:drawRoute 700ms ease forwards;opacity:.45"/></svg>`;
    } catch(e){}
  }
  const diff = Math.ceil((new Date(race.date)-new Date())/86400000);
  const dateStr = new Date(race.date).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  const splash = document.createElement('div');
  splash.id = 'eventSplash';
  splash.style.cssText = 'position:fixed;inset:0;background:var(--vl-bg);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;gap:4px;cursor:pointer';
  splash.innerHTML = `
    <div style="font-family:var(--vl-mono);font-size:9px;color:var(--vl-ember);letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px;animation:fadeEl .3s ease forwards;opacity:0">${escapeHTML(race.type||'Trail')}</div>
    <div style="font-family:var(--vl-display);font-size:clamp(2rem,7vw,3.5rem);font-weight:800;text-transform:uppercase;text-align:center;line-height:.88;animation:fadeEl .35s ease .05s forwards;opacity:0">${escapeHTML(race.name)}</div>
    <div style="font-family:var(--vl-serif,'Fraunces'),serif;font-style:italic;font-size:.8rem;color:var(--vl-text-2);margin-top:6px;animation:fadeEl .35s ease .1s forwards;opacity:0">${dateStr}${race.distance?' · '+race.distance+' km':''}${race.elevation?' · D+ '+race.elevation+' m':''}</div>
    <div style="margin-top:16px;animation:fadeEl .35s ease .2s forwards;opacity:0">${traceSvg}</div>
    <div style="font-family:var(--vl-display);font-size:3.5rem;font-weight:800;color:var(--vl-ember);line-height:1;margin-top:8px;animation:fadeEl .4s ease .55s forwards;opacity:0">${diff<0?'PASSÉE':diff}</div>
    ${diff>=0?`<div style="font-family:var(--vl-mono);font-size:9px;color:var(--vl-text-3);letter-spacing:.16em;text-transform:uppercase;animation:fadeEl .4s ease .6s forwards;opacity:0">jours</div>`:''}
  `;
  document.body.appendChild(splash);
  const dismiss = () => {
    if (!splash.parentNode) return;
    splash.style.animation = 'splashOut .25s ease forwards';
    setTimeout(() => splash.remove(), 240);
  };
  splash.addEventListener('click', dismiss);
  setTimeout(dismiss, 750);
}

function goToEvent(raceId) {
  const race = (races||[]).find(r=>String(r.id)===String(raceId));
  navigate('strategie');
  if (race) showEventSplash(race);
  // Refresh race data so GPX saved on another device is always picked up; splash covers the fetch
  loadRaces().then(() => openEventView(raceId));
}

function backToCalendar() {
  document.getElementById('eventView').style.display = 'none';
  document.getElementById('calView').style.display = 'block';
  currentRaceContext = null;
  document.getElementById('stratResult').style.display='none';
  document.getElementById('gpxDrop').style.display='flex';
  const ef=document.getElementById('editRaceForm');if(ef)ef.style.display='none';
  const rm=document.getElementById('raceMenu');if(rm)rm.style.display='none';
  const cs=document.getElementById('eventComparisonSection');if(cs)cs.innerHTML='';
  window._openEventRace=null;
  if(window._actMapInst2){window._actMapInst2.remove();window._actMapInst2=null;}
}

async function deleteRace(raceId) {
  if(!confirm('Supprimer cette course ?')) return;
  await sb.from('race_calendar').delete().eq('id', raceId);
  await loadRaces();
  backToCalendar();
  renderCalendar();
}

function toggleEditRaceForm() {
  const form = document.getElementById('editRaceForm');
  if(!form) return;
  const isHidden = form.style.display === 'none' || !form.style.display;
  if(isHidden) {
    const race = currentRaceContext || window._openEventRace;
    if(race) {
      document.getElementById('editRaceName').value = race.name || '';
      document.getElementById('editRaceDate').value = race.date ? race.date.slice(0,10) : '';
      document.getElementById('editRaceType').value = race.type || 'Trail';
      document.getElementById('editRaceDist').value = race.distance != null ? race.distance : '';
      document.getElementById('editRaceDplus').value = race.elevation != null ? race.elevation : '';
      document.getElementById('editRaceGoal').value = race.goal_time || '';
    }
    form.style.display = 'grid';
  } else {
    form.style.display = 'none';
  }
}

async function saveEditRace() {
  const race = currentRaceContext || window._openEventRace;
  if(!race?.id) return;
  const name = document.getElementById('editRaceName').value.trim();
  const date = document.getElementById('editRaceDate').value;
  const type = document.getElementById('editRaceType').value;
  const distance = parseFloat(document.getElementById('editRaceDist').value) || null;
  const elevation = parseInt(document.getElementById('editRaceDplus').value) || null;
  const goal_time = document.getElementById('editRaceGoal').value.trim() || null;
  if(!name || !date) { alert('Nom et date requis'); return; }
  const {error} = await sb.from('race_calendar').update({name,date,type,distance,elevation,goal_time}).eq('id', race.id);
  if(error){alert('Erreur: '+error.message);return;}
  await loadRaces();
  const updated = (races||[]).find(r=>String(r.id)===String(race.id));
  if(updated) {
    window._openEventRace = updated;
    if(currentRaceContext?.id===updated.id) currentRaceContext = updated;
    const titleEl = document.getElementById('eventViewTitle');
    if(titleEl) titleEl.textContent = `${updated.type==='Trail'?'⛰️':updated.type==='Ultra'?'🦅':'🏃'} ${updated.name} — ${new Date(updated.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}`;
  }
  document.getElementById('editRaceForm').style.display = 'none';
  renderCalendar();
}

function toggleRaceMenu(e) {
  if(e) e.stopPropagation();
  const menu = document.getElementById('raceMenu');
  if(!menu) return;
  const opening = menu.style.display === 'none';
  menu.style.display = opening ? 'block' : 'none';
  if(opening) {
    const saveItem = document.getElementById('raceMenuSaveGpx');
    if(saveItem) saveItem.style.display = (currentRaceContext?.id && window._pendingGpxSave) ? 'block' : 'none';
    const delGpxItem = document.getElementById('raceMenuDeleteGpx');
    if(delGpxItem) {
      const race = window._openEventRace;
      let hasGpx = false;
      try { if(race?.gpx_data){ const p=JSON.parse(race.gpx_data); hasGpx=Array.isArray(p)&&p.length>0; } } catch{}
      delGpxItem.style.display = hasGpx ? 'block' : 'none';
    }
  }
}

function raceMenuChangeGpx() {
  const race = window._openEventRace;
  toggleRaceMenu();
  resetStrategy();
  currentRaceContext = race;
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('raceMenuWrap');
  const menu = document.getElementById('raceMenu');
  if(menu && menu.style.display !== 'none' && wrap && !wrap.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// ════════════════════════════════════════════════════
// ONBOARDING
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
  if (!allActivities.length) { showOnboarding(); return; }
  showDashContent();

  const now = new Date();

  // Greeting
  const weekNum = (() => { const d=new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const w=new Date(d.getFullYear(),0,4); return 1+Math.round(((d-w)/86400000-3+(w.getDay()+6)%7)/7); })();
  const monthFr = ['jan','fév','mars','avr','mai','juin','juil','août','sep','oct','nov','déc'][now.getMonth()].toUpperCase();
  const weekLbl = document.getElementById('dashWeekLabel');
  if (weekLbl) weekLbl.textContent = `SEM. ${weekNum} · ${monthFr} ${now.getFullYear()}`;
  const thisMonth = allActivities.filter(a => {
    const d = new Date(a.start_date);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  });
  const lastMonth = allActivities.filter(a => {
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
  const thisWeek = allActivities.filter(a => new Date(a.start_date) >= weekStart);
  const prevWeek = allActivities.filter(a => { const d=new Date(a.start_date); return d>=prevWeekStart && d<prevWeekEnd; });

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
  const fcMax = userProfile.fc_max || FC_MAX_DEFAULT;
  const withHR = thisMonth.filter(a=>a.average_heartrate);
  const avgFC = withHR.length ? Math.round(withHR.reduce((s,a)=>s+a.average_heartrate,0)/withHR.length) : null;
  document.getElementById('statsGrid').innerHTML = `
    <div class="s-stat"><div class="s-sv">${fmtD(durM)}</div><div class="s-sl">Temps mois</div></div>
    ${avgFC?`<div class="s-stat"><div class="s-sv">${avgFC}</div><div class="s-sl">FC moy mois</div></div>`:''}
    <div class="s-stat" id="aerobicStatCard"><div class="s-sv tc" id="aerobicStatVal" style="font-size:1rem;color:var(--text3)">…</div><div class="s-sl">% aérobie sem.</div></div>
  `;

  // Annual chart
  renderAnnualChart();

  // Activities grid
  renderActivities();

  // Async: fetch HR streams for this week and compute real aerobic %
  loadAerobicStat(thisWeek, fcMax);
}

function renderLastActivity() {
  const w = document.getElementById('lastActWidget');
  if (!w) return;
  const act = allActivities[0];
  if (!act) { w.innerHTML = '<div class="mono t3">Aucune activité</div>'; return; }

  const now = new Date();
  const diffDays = Math.floor((now - new Date(act.start_date)) / 86400000);
  const relDate = diffDays === 0 ? "Aujourd'hui" : diffDays === 1 ? 'Hier' : `Il y a ${diffDays} j`;
  const typeEmoji = (act.sport_type||act.type||'').toLowerCase().includes('trail') ? '🏔️' : '🏃';
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
  const threshold = fcMax * 0.75;
  const actsWithHR = weekActs.filter(a => isRun(a.type));
  if (!actsWithHR.length) { document.getElementById('aerobicStatVal').textContent = '—'; return; }

  let totalPts = 0, aerobicPts = 0;
  await Promise.all(actsWithHR.map(async a => {
    try {
      const streams = await fetchStreams(a.id);
      const hr = streams.heartrate?.data;
      if (!hr?.length) return;
      totalPts += hr.length;
      aerobicPts += hr.filter(v => v < threshold).length;
    } catch {}
  }));

  const el = document.getElementById('aerobicStatVal');
  if (!el) return;
  if (totalPts === 0) { el.textContent = '—'; return; }
  const pct = Math.round(aerobicPts / totalPts * 100);
  el.style.color = '';
  el.style.fontSize = '';
  el.textContent = pct + '%';
}

// ════════════════════════════════════════════════════
// ANNUAL CHART
// ════════════════════════════════════════════════════
function setAnnualMode(mode) {
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
  const apiDayKeys = new Set(allActivities.map(a => {
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

  const allRuns = [...allActivities, ...histRuns]
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
  if (infoEl) infoEl.textContent = `${allActivities.length} sorties`;
  if (infoFull) infoFull.textContent = `${allActivities.length} sorties`;
  if (grid) grid.innerHTML = '';
  if (gridFull) gridFull.innerHTML = '';
  allActivities.forEach((act, idx) => {
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
function computePAF(act, weather) {
  const fcMax=userProfile.fc_max||FC_MAX_DEFAULT;
  let factors=[],totalAdj=0;
  if(weather?.temp!=null){const a=Math.max(0,(weather.temp-10)*0.008);totalAdj+=a;factors.push({icon:weather.temp>25?'🌡️':weather.temp<5?'❄️':'🌤️',label:'Température',value:`${weather.temp.toFixed(1)}°C`,adj:a>0.005?`+${(a*100).toFixed(1)}%`:'~0%',color:a>0.02?'var(--red)':a>0.01?'var(--orange)':'var(--green)'});}
  if(weather?.precip!=null){const a=weather.precip>5?0.03:weather.precip>1?0.02:weather.precip>0.1?0.01:0;totalAdj+=a;factors.push({icon:weather.precip>1?'🌧️':'☀️',label:'Pluie',value:`${weather.precip.toFixed(1)}mm`,adj:a>0?`+${(a*100).toFixed(1)}%`:'~0%',color:a>0.01?'var(--orange)':'var(--green)'});}
  if(weather?.wind!=null){const a=weather.wind>30?0.04:weather.wind>20?0.03:weather.wind>10?0.015:0.003;totalAdj+=a;factors.push({icon:weather.wind>20?'💨':'🌬️',label:'Vent',value:`${weather.wind.toFixed(0)}km/h`,adj:`+${(a*100).toFixed(1)}%`,color:a>0.02?'var(--orange)':'var(--green)'});}
  const dp=act.total_elevation_gain||0,dk=(act.distance||1)/1000,ga=Math.min(0.45,dp/(dk*1000)*5.5);totalAdj+=ga;factors.push({icon:'⛰️',label:'Dénivelé',value:`+${dp}m`,adj:`+${(ga*100).toFixed(1)}%`,color:ga>0.15?'var(--orange)':'var(--yellow)'});
  const h=parseInt(act.start_date_local?.split('T')[1]?.split(':')[0]||12);if(h<6||h>20){totalAdj+=0.02;factors.push({icon:'🌙',label:'Nuit',value:`${h}h`,adj:'+2%',color:'var(--purple)'});}
  if(act.type==='TrailRun'){totalAdj+=0.08;factors.push({icon:'🥾',label:'Trail',value:'Terrain',adj:'+8%',color:'var(--orange)'});}
  const raw=act.average_speed>0?1000/act.average_speed:0,norm=raw/(1+totalAdj),nm=Math.floor(norm/60),ns=Math.round(norm%60);
  return {factors,totalAdj,paceNorm:`${nm}:${String(ns).padStart(2,'0')}`};
}

// ════════════════════════════════════════════════════
// LOCAL ACTIVITY ANALYSIS — NO EXTERNAL AI
// ════════════════════════════════════════════════════
async function generateAIAnalysis(act, streams, paf) {
  const fcMax = userProfile.fc_max || FC_MAX_DEFAULT;

  const zones = [0, 0, 0, 0, 0];
  const hrS = streams.heartrate?.data || [];

  if (hrS.length) {
    hrS.forEach(h => {
      const p = h / fcMax;
      if (p < .6) zones[0]++;
      else if (p < .7) zones[1]++;
      else if (p < .8) zones[2]++;
      else if (p < .9) zones[3]++;
      else zones[4]++;
    });

    const tot = hrS.length;
    zones.forEach((_, i) => zones[i] = Math.round(zones[i] / tot * 100));
  }

  const distKm = act.distance / 1000;
  const fcPct = act.average_heartrate ? Math.round(act.average_heartrate / fcMax * 100) : null;

  let intensityVerdict = 'intensité non évaluable sans fréquence cardiaque moyenne';

  if (fcPct !== null) {
    if (fcPct < 70) intensityVerdict = `intensité faible (${fcPct}% FCmax)`;
    else if (fcPct < 80) intensityVerdict = `intensité modérée (${fcPct}% FCmax)`;
    else if (fcPct < 88) intensityVerdict = `intensité élevée (${fcPct}% FCmax)`;
    else intensityVerdict = `intensité très élevée (${fcPct}% FCmax)`;
  }

  const actDate = new Date(act.start_date);

  const d28ago = new Date(actDate);
  d28ago.setDate(actDate.getDate() - 28);

  const d7ago = new Date(actDate);
  d7ago.setDate(actDate.getDate() - 7);

  const recentRuns = allActivities.filter(a => {
    const d = new Date(a.start_date);
    return isRun(a.type) && d >= d28ago && d < actDate;
  });

  const last7Runs = recentRuns.filter(a => new Date(a.start_date) >= d7ago);

  const km28 = recentRuns.reduce((s, a) => s + a.distance / 1000, 0).toFixed(0);
  const km7 = last7Runs.reduce((s, a) => s + a.distance / 1000, 0).toFixed(0);
  const dp28 = recentRuns.reduce((s, a) => s + (a.total_elevation_gain || 0), 0).toFixed(0);

  const z45 = zones[3] + zones[4];

  let effortComment = '';

  if (fcPct === null) {
    effortComment = 'La fréquence cardiaque moyenne est absente, donc le dosage cardio ne peut pas être jugé correctement.';
  } else if (fcPct < 70) {
    effortComment = 'Le dosage correspond plutôt à une sortie facile ou récupératrice.';
  } else if (fcPct < 80) {
    effortComment = 'Le dosage correspond à une endurance active ou à un effort modéré.';
  } else if (fcPct < 88) {
    effortComment = 'Le dosage est soutenu et demande une récupération correcte.';
  } else {
    effortComment = 'Le dosage est très intense et ne doit pas être répété trop souvent sans récupération.';
  }

  return [
    `${distKm.toFixed(2)} km en ${fmtD(act.moving_time)}, D+ ${act.total_elevation_gain || 0} m, allure moyenne ${fmtP(act.average_speed)}/km.`,
    `Fréquence cardiaque : moyenne ${act.average_heartrate || '?'} bpm, max ${act.max_heartrate || '?'} bpm, verdict ${intensityVerdict}.`,
    `Répartition cardio : Z1 ${zones[0]}%, Z2 ${zones[1]}%, Z3 ${zones[2]}%, Z4 ${zones[3]}%, Z5 ${zones[4]}%, soit ${z45}% en zones hautes Z4-Z5.`,
    `Contexte récent : ${recentRuns.length} sorties sur 28 jours, ${km28} km, D+ ${dp28} m ; sur 7 jours : ${last7Runs.length} sortie(s), ${km7} km.`,
    `${effortComment}`,
  ].join(' ');
}

// ════════════════════════════════════════════════════
// ANALYSE OVERLAY
// ════════════════════════════════════════════════════
async function openAnalyse(act) {
  const overlay = document.getElementById('analyseOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('analyseInner').innerHTML = `<div class="loading" style="min-height:300px"><div class="spinner"></div><div class="mono">Chargement des données...</div></div>`;

  const streams = await fetchStreams(act.id);
  // Fallback: use first latlng point from streams if start_latlng missing
  let lat0 = act.start_latlng?.[0], lon0 = act.start_latlng?.[1];
  const llStream = streams.latlng?.data;
  if((lat0==null||lon0==null) && Array.isArray(llStream) && llStream.length){
    lat0 = llStream[0][0]; lon0 = llStream[0][1];
  }
  const weather = (lat0!=null && lon0!=null)
    ? await fetchWeather(lat0, lon0, act.start_date_local)
    : null;

  const paf = computePAF(act, weather);
  const fcMax = userProfile.fc_max || FC_MAX_DEFAULT;
  const d = new Date(act.start_date_local);
  const dateStr = d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});

  // Zones FC
  let zd={Z1:0,Z2:0,Z3:0,Z4:0,Z5:0};
  const hrS=streams.heartrate?.data||[];
  if(hrS.length){hrS.forEach(h=>{const p=h/fcMax;if(p<.6)zd.Z1++;else if(p<.7)zd.Z2++;else if(p<.8)zd.Z3++;else if(p<.9)zd.Z4++;else zd.Z5++;});const tot=hrS.length;Object.keys(zd).forEach(k=>zd[k]=Math.round(zd[k]/tot*100));}

  // Chart data
  const altD=streams.altitude?.data||[],hrD=streams.heartrate?.data||[],distD=streams.distance?.data||[];
  const step=Math.max(1,Math.floor(altD.length/80));
  const cA=altD.filter((_,i)=>i%step===0),cH=hrD.filter((_,i)=>i%step===0),cDist=distD.filter((_,i)=>i%step===0).map(d=>(d/1000).toFixed(2));

  document.getElementById('analyseInner').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem;flex-wrap:wrap">
      <button class="hbtn" onclick="closeAnalyse()">← Fermer</button>
      <div style="flex:1">
        <div style="font-family:var(--display);font-size:1.4rem;letter-spacing:.03em">${escapeHTML(act.name)}</div>
        <div class="mono t2">${dateStr} · ${act.type==='TrailRun'?'⛰️ Trail':'🏃 Route'}</div>
      </div>
      <button class="hbtn" id="btnLinkActivity" onclick="showLinkActivityPanel(${act.id})" style="background:var(--purple);color:#fff;border-color:var(--purple)">🏁 Lier à un événement</button>
    </div>
    <div id="linkActivityPanel" style="display:none;background:var(--bg3);border:1px solid var(--border2);border-radius:9px;padding:12px;margin-bottom:1rem">
      <div class="clabel" style="margin-bottom:8px">Associer à une course du calendrier</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap" id="linkActivityRaceList"></div>
    </div>

    <div class="a-stats">
      <div class="a-stat"><div class="a-sv tc">${(act.distance/1000).toFixed(2)} km</div><div class="a-sl">Distance</div></div>
      <div class="a-stat"><div class="a-sv">${fmtD(act.moving_time)}</div><div class="a-sl">Temps mvt</div></div>
      <div class="a-stat"><div class="a-sv">${fmtP(act.average_speed)}/km</div><div class="a-sl">Allure</div><div class="a-ss t3" style="font-size:.58rem">normalisée PAF : ${paf.paceNorm}/km</div></div>
      ${act.total_elevation_gain?`<div class="a-stat"><div class="a-sv to">+${act.total_elevation_gain}m</div><div class="a-sl">D+</div></div>`:''}
      ${act.average_heartrate?`<div class="a-stat"><div class="a-sv">${Math.round(act.average_heartrate)}</div><div class="a-sl">FC moy</div><div class="a-ss">max ${act.max_heartrate||'—'} bpm</div></div>`:''}
      ${act.kilojoules?`<div class="a-stat"><div class="a-sv">${Math.round(act.kilojoules*.239)}</div><div class="a-sl">kcal</div></div>`:''}
    </div>

    <!-- AI ANALYSIS -->
    <div class="ai-analysis" id="aiBox">
      <div class="ai-header"><div class="ai-icon">📊</div><div class="ai-title"> Résumé des stat</div></div>
      <div class="ai-loading"><div class="spinner"></div><div>Analyse en cours...</div></div>
    </div>

    <!-- PAF -->
    <div class="paf-widget">
      <div style="font-family:var(--display);font-size:1.05rem;letter-spacing:.03em;margin-bottom:10px">Performance Adjustment Factor</div>
      <div class="paf-factors">${paf.factors.map(f=>`<div class="paf-factor"><span style="font-size:.95rem">${f.icon}</span><div><div style="font-size:.7rem;font-weight:600">${f.label}</div><div style="font-size:.62rem;color:var(--text2)">${f.value}</div></div><div style="font-family:var(--mono);font-size:.7rem;font-weight:500;color:${f.color}">${f.adj}</div></div>`).join('')}</div>
      <div class="paf-result">
        <div><div class="mono" style="font-size:.56rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Allure normalisée (indicatif)</div><div style="font-family:var(--display);font-size:1.4rem;color:var(--text2)">${paf.paceNorm}/km</div></div>
        <div style="font-size:.76rem;color:var(--text2);line-height:1.5">Pénalité conditions : <strong>+${(paf.totalAdj*100).toFixed(0)}%</strong></div>
      </div>
      <div class="mono t3" style="margin-top:8px;font-size:.56rem;font-style:italic">📖 Minetti et al., 2002 · Ely et al., 2007 · Lejeune et al., 1998</div>
    </div>

    <div class="grid-2 mt2">
      <div class="card"><div class="clabel">Profil altimétrique & FC</div><div class="chart-wrap" style="height:190px"><canvas id="apChart"></canvas></div></div>
      <div class="card"><div class="clabel">Répartition zones FC</div><div class="chart-wrap" style="height:190px"><canvas id="azChart"></canvas></div></div>
    </div>

    ${(Array.isArray(llStream) && llStream.length>1) ? `<div class="card mt2"><div class="clabel">Carte du parcours</div><div id="actMap" style="height:300px;border-radius:8px;overflow:hidden;margin-top:8px"></div></div>` : ''}

    <!-- PROFIL ATHLÈTE PAR SECTION (si streams dispo) -->
    <div id="athleteProfileSection" class="mt2"></div>

    <!-- COMPARAISON PRÉVU/RÉEL (si course liée avec GPX) -->
    <div id="raceComparisonSection" class="mt2"></div>`;

  // Charts
  if(cA.length){new Chart(document.getElementById('apChart'),{type:'line',data:{labels:cDist,datasets:[{label:'Alt',data:cA,borderColor:'#00d4ff',backgroundColor:'rgba(0,212,255,.08)',fill:true,tension:.4,pointRadius:0,borderWidth:1.5,yAxisID:'yA'},...(cH.length?[{label:'FC',data:cH,borderColor:'#f43f5e',backgroundColor:'transparent',fill:false,tension:.4,pointRadius:0,borderWidth:1.5,borderDash:[3,2],yAxisID:'yH'}]:[])]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:8,font:{size:9},callback:v=>v+'km'},grid:{color:'rgba(255,255,255,.05)'}},yA:{position:'left',ticks:{font:{size:9},callback:v=>v+'m'},grid:{color:'rgba(255,255,255,.05)'}},yH:{position:'right',min:50,max:220,ticks:{font:{size:9}},grid:{display:false}}}}})}
  const zv=Object.values(zd);if(zv.some(v=>v>0)){new Chart(document.getElementById('azChart'),{type:'doughnut',data:{labels:['Z1 <60%','Z2 60-70%','Z3 70-80%','Z4 80-90%','Z5 >90%'],datasets:[{data:zv,backgroundColor:['#3b82f6','#2ecc71','#fbbf24','#ff6b35','#f43f5e'],borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10},color:'#6b7d94',padding:8}}}}})}

  // Activity map
  if(Array.isArray(llStream) && llStream.length>1 && document.getElementById('actMap')){
    try {
      if(window._actMapInst){window._actMapInst.remove();window._actMapInst=null;}
      const mapEl = document.getElementById('actMap');
      window._actMapInst = L.map(mapEl,{zoomControl:true,scrollWheelZoom:false});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(window._actMapInst);
      const step = Math.max(1, Math.floor(llStream.length/500));
      const pts = llStream.filter((_,i)=>i%step===0);
      const poly = L.polyline(pts,{color:'#00d4ff',weight:4,opacity:.9}).addTo(window._actMapInst);
      L.circleMarker(llStream[0],{radius:7,fillColor:'#2ecc71',color:'#fff',weight:2,fillOpacity:1}).addTo(window._actMapInst);
      L.circleMarker(llStream[llStream.length-1],{radius:7,fillColor:'#f43f5e',color:'#fff',weight:2,fillOpacity:1}).addTo(window._actMapInst);
      window._actMapInst.fitBounds(poly.getBounds(),{padding:[18,18]});
      setTimeout(()=>window._actMapInst&&window._actMapInst.invalidateSize(), 80);
    } catch(e){ console.warn('Map render failed', e); }
  }

  // Athlete profile by section (VAM, recovery, etc.)
  renderAthleteProfile(streams, act);

  // Check if this activity is linked to a race — reload fresh from DB first
  await loadRaces();
  const linkedRace = races.find(r => String(r.strava_activity_id) === String(act.id));
  if(linkedRace?.gpx_data) {
    renderRaceComparison(act, streams, linkedRace);
  }
  // Always populate link panel with all races (so user can re-link or attach to any course)
  const linkList = document.getElementById('linkActivityRaceList');
  if(linkList) {
    const sorted = [...races].sort((a,b)=>new Date(b.date)-new Date(a.date));
    linkList.innerHTML = sorted.length
      ? sorted.map(r=>`<button class="race-sel-btn" data-raceid="${r.id}" data-racename="${escapeAttr(r.name)}" data-actid="${act.id}" onclick="linkActivityToRace(this.dataset.raceid, this.dataset.racename, parseInt(this.dataset.actid))">📅 ${escapeHTML(r.name)} · ${new Date(r.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}</button>`).join('')
      : '<span class="mono t3">Aucune course dans le calendrier — ajoutes-en une depuis l\'onglet Calendrier</span>';
  }

  // AI analysis async
  const aiText = await generateAIAnalysis(act, streams, paf);
  const aiBox = document.getElementById('aiBox');
  if (aiBox) {
    aiBox.innerHTML = `<div class="ai-header"><div class="ai-icon">📊</div><div class="ai-title">résumé Statistiques</div></div><div class="ai-text">${aiText}</div>`;
  }
}

function showLinkActivityPanel(actId) {
  const panel = document.getElementById('linkActivityPanel');
  if(panel) panel.style.display = panel.style.display==='none'?'block':'none';
}

async function linkActivityToRace(raceId, raceName, actId) {
  const btn = document.getElementById('btnLinkActivity');
  if(btn){btn.textContent='Liaison...';btn.disabled=true;}
  const {error} = await sb.from('race_calendar')
    .update({strava_activity_id: actId})
    .eq('id', raceId);
  const panel = document.getElementById('linkActivityPanel');
  if(panel) panel.style.display='none';
  if(!error){
    // Reload races from DB to ensure persistence
    await loadRaces();
    if(btn){
      btn.textContent=`✓ Lié à ${raceName}`;
      btn.style.background='var(--green)';btn.style.color='#000';btn.style.borderColor='var(--green)';
    }
    // Now check if linked race has GPX and show comparison
    const linkedRace = races.find(r=>r.id===raceId);
    if(linkedRace?.gpx_data){
      const streams=await fetchStreams(actId);
      renderRaceComparison({id:actId,moving_time:0}, streams, linkedRace);
    }
  } else if(btn){
    btn.textContent='❌ Erreur';btn.disabled=false;
  }
}

function renderAthleteProfile(streams, act) {
  const section = document.getElementById('athleteProfileSection');
  if(!section) return;

  const altD = streams.altitude?.data||[];
  const hrD = streams.heartrate?.data||[];
  const velD = streams.velocity_smooth?.data||[];
  const distD = streams.distance?.data||[];
  if(!altD.length || !velD.length) return;

  // Compute VAM on uphills, downhill speed, post-climb recovery
  let uphillSections=[], downhillSections=[], recoveries=[];
  let inUphill=false, uphillStart=null;
  let prevState='flat';

  const WIN = Math.min(30, Math.floor(altD.length/10)); // adaptive lookahead
  for(let i=WIN; i<altD.length-WIN; i++){
    const elevN = altD[i+WIN]-altD[i];
    const distN = distD[i+WIN]-distD[i];
    const grade = distN>0 ? elevN/distN*100 : 0;

    if(grade > 4 && !inUphill){
      inUphill=true;
      uphillStart={idx:i, alt:altD[i], dist:distD[i], time:i};
    } else if(grade <= 1.5 && inUphill){
      inUphill=false;
      const dAlt=altD[i]-uphillStart.alt;
      const dTime=(i-uphillStart.time);
      const dDist=distD[i]-uphillStart.dist;
      if(dAlt>10 && dTime>0){
        const vam=dAlt/(dTime/3600);
        const avgHR=hrD.length?hrD.slice(uphillStart.idx,i).reduce((a,b)=>a+b,0)/(i-uphillStart.idx):null;
        uphillSections.push({vam:Math.round(vam),dAlt:Math.round(dAlt),dist:Math.round(dDist),avgHR:avgHR?Math.round(avgHR):null});
        // Recovery after climb: HR drop in next 60s
        if(hrD.length){
          const hrAtTop=hrD[i]||0;
          const hrAfter60=hrD[Math.min(i+60,hrD.length-1)]||0;
          const drop=hrAtTop-hrAfter60;
          if(hrAtTop>0) recoveries.push({drop,hrAtTop,hrAfter60});
        }
      }
    }
    if(grade < -5){
      const avgVel=velD.slice(i,i+30).reduce((a,b)=>a+b,0)/30;
      downhillSections.push({speed:+(avgVel*3.6).toFixed(1),grade:+grade.toFixed(1)});
    }
  }

  if(!uphillSections.length && !recoveries.length) {
    section.innerHTML = `<div class="card"><div class="clabel">Profil athlète</div><div class="mono t3" style="font-size:.75rem;padding:8px 0">Pas de montées significatives détectées sur cette sortie.</div></div>`;
    return;
  }

  const avgVAM = uphillSections.length ? Math.round(uphillSections.reduce((a,b)=>a+b.vam,0)/uphillSections.length) : null;
  const maxVAM = uphillSections.length ? Math.max(...uphillSections.map(s=>s.vam)) : null;
  const avgRecovery = recoveries.length ? Math.round(recoveries.reduce((a,b)=>a+b.drop,0)/recoveries.length) : null;
  const avgDownhill = downhillSections.length ? +(downhillSections.reduce((a,b)=>a+b.speed,0)/downhillSections.length).toFixed(1) : null;

  // Level assessment
  const vamLevel = maxVAM > 1000 ? {l:'Excellent', c:'var(--green)'} : maxVAM > 700 ? {l:'Bon', c:'var(--cyan)'} : maxVAM > 400 ? {l:'Moyen', c:'var(--yellow)'} : {l:'À développer', c:'var(--orange)'};
  const recovLevel = avgRecovery > 30 ? {l:'Rapide', c:'var(--green)'} : avgRecovery > 20 ? {l:'Correct', c:'var(--cyan)'} : avgRecovery > 10 ? {l:'Lent', c:'var(--yellow)'} : {l:'Très lent', c:'var(--orange)'};

  section.innerHTML = `
    <div class="card">
      <div class="clabel">Profil athlète — extrait de cette sortie</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:1rem">
        ${avgVAM ? `<div class="s-stat"><div class="s-sv" style="color:${vamLevel.c}">${avgVAM} m/h</div><div class="s-sl">VAM moyenne montée</div><div class="mono t3" style="font-size:.58rem">${vamLevel.l} · max ${maxVAM} m/h</div></div>` : ''}
        ${avgRecovery ? `<div class="s-stat"><div class="s-sv" style="color:${recovLevel.c}">${avgRecovery} bpm</div><div class="s-sl">Récup FC / min post-montée</div><div class="mono t3" style="font-size:.58rem">${recovLevel.l}</div></div>` : ''}
        ${avgDownhill ? `<div class="s-stat"><div class="s-sv tc">${avgDownhill} km/h</div><div class="s-sl">Vitesse moy descente</div></div>` : ''}
        ${uphillSections.length ? `<div class="s-stat"><div class="s-sv">${uphillSections.length}</div><div class="s-sl">Montées analysées</div></div>` : ''}
      </div>
      ${avgVAM ? `<div style="font-size:.74rem;color:var(--text2);line-height:1.6">
        <strong>Grimpeur :</strong> VAM moyenne ${avgVAM} m/h
        ${avgVAM > 700 ? ' — niveau trail compétitif.' : avgVAM > 400 ? ' — bon niveau trail loisir.' : ' — marge de progression en montée.'}
        ${avgRecovery ? `<br><strong>Récupération cardiaque :</strong> −${avgRecovery} bpm/min après montée — ${avgRecovery > 25 ? 'excellente capacité de récup intra-effort.' : avgRecovery > 15 ? 'capacité correcte.' : 'à travailler — voir programme Récup dans Renfo.'}` : ''}
      </div>` : ''}
    </div>`;
}

async function renderRaceComparison(act, streams, race, targetId) {
  const section = document.getElementById(targetId||'raceComparisonSection')||document.getElementById('eventComparisonSection');
  if(!section || !race.gpx_data) return;

  let gpxPts;
  try { gpxPts = JSON.parse(race.gpx_data); } catch { return; }
  if (!gpxPts || gpxPts.length < 10) return;

  const cumDist=[0];
  for(let i=1;i<gpxPts.length;i++) cumDist.push(cumDist[i-1]+hav(gpxPts[i-1],gpxPts[i]));
  const totalDist=cumDist[cumDist.length-1];
  if (totalDist < 100) return;

  const kmSecs=[];let segTarget=500,prevIdx=0;
  for(let i=0;i<cumDist.length;i++){
    if(cumDist[i]>=segTarget||i===cumDist.length-1){
      let sdp=0,sdm=0;
      for(let j=prevIdx+1;j<=i;j++){if(gpxPts[j]?.ele&&gpxPts[j-1]?.ele){const diff=gpxPts[j].ele-gpxPts[j-1].ele;if(diff>0)sdp+=diff;else sdm+=Math.abs(diff);}}
      const segDist=cumDist[i]-cumDist[prevIdx];
      const elevChange=gpxPts[i]?.ele&&gpxPts[prevIdx]?.ele?gpxPts[i].ele-gpxPts[prevIdx].ele:0;
      const grade=segDist>0?(elevChange/segDist)*100:0;
      kmSecs.push({startKm:+(cumDist[prevIdx]/1000).toFixed(2),endKm:+(cumDist[i]/1000).toFixed(2),dist:segDist,dplus:Math.round(sdp),dminus:Math.round(sdm),grade:+grade.toFixed(1)});
      prevIdx=i;segTarget=cumDist[i]+500;
    }
  }

  const sections=buildDetailedSections(kmSecs);
  const totalDplus=sections.reduce((a,s)=>a+(s.dplus||0),0);
  const totalDminus=sections.reduce((a,s)=>a+(s.dminus||0),0);

  let basePaceS=320;
  if(race.goal_time){
    const parts=race.goal_time.split(/[h:]/);
    let gs=0;
    if(parts.length===2)gs=parseInt(parts[0])*60+parseInt(parts[1]);
    else if(parts.length===3)gs=parseInt(parts[0])*3600+parseInt(parts[1])*60+(parseInt(parts[2])||0);
    if(gs>0){
      const tf=sections.reduce((a,s)=>a+(1+minettiGradePenalty(s.grade/100))*s.dist/1000,0);
      basePaceS=tf>0?gs/tf:gs/(totalDist/1000);
    }
  } else if(userProfile.prs?.semi?.timeS){
    const isTrail=/trail|ultra/i.test(race.type||'');
    basePaceS=userProfile.prs.semi.timeS/21097*1000*(isTrail?1.18:1.0);
  }

  const predicted=sections.map(s=>{
    return Math.round(basePaceS*(1+minettiGradePenalty(s.grade/100))*s.dist/1000);
  });

  const distD=streams.distance?.data||[];
  const actual=sections.map(s=>{
    if(!distD.length) return null;
    const startIdx=distD.findIndex(d=>d>=s.startKm*1000);
    const endIdx=distD.findIndex(d=>d>=s.endKm*1000);
    if(startIdx<0||endIdx<0||endIdx<=startIdx) return null;
    return endIdx-startIdx;
  });

  const hrD=streams.heartrate?.data||[];
  const sectionHR=sections.map(s=>{
    if(!hrD.length||!distD.length) return null;
    const si=distD.findIndex(d=>d>=s.startKm*1000);
    const ei=distD.findIndex(d=>d>=s.endKm*1000);
    if(si<0||ei<0||ei<=si) return null;
    const slice=hrD.slice(si,ei);
    return slice.length ? Math.round(slice.reduce((a,b)=>a+b,0)/slice.length) : null;
  });

  // Calorie estimation: weight × (dist_km + D+/100 + D-/200) — Minetti km-equivalent model
  const weight = userProfile.weight || 70;
  const predCal = Math.round(weight * (totalDist/1000 + totalDplus/100 + totalDminus/200));
  const actCal = act.calories && act.calories > 0 ? act.calories : null;
  const calDiff = actCal ? Math.round((actCal - predCal) / predCal * 100) : null;

  // Fetch historical weather for race start location + date (fire-and-forget, don't block render)
  let weather = null;
  const startPt = gpxPts.find(p=>p.lat&&p.lon);
  const raceDate = race.date || act.start_date;
  if (startPt && raceDate) {
    weather = await fetchWeather(startPt.lat, startPt.lon, raceDate).catch(()=>null);
  }

  const cols={up:'var(--orange)',down:'var(--purple)',flat:'var(--cyan)'};
  const icons={up:'⛰️',down:'🎿',flat:'➡️'};

  const rows = sections.map((s,i) => {
    const pred=predicted[i], real=actual[i];
    const diff=real&&pred ? Math.round((real-pred)/pred*100) : null;
    const diffColor=diff===null?'var(--text3)':Math.abs(diff)<=10?'var(--green)':Math.abs(diff)<=25?'var(--yellow)':'var(--red)';
    const diffIcon=diff===null?'—':diff>25?'⚠️':diff>10?'~':'✓';
    return `<tr>
      <td style="color:${cols[s.type]}">${icons[s.type]} ${s.startKm.toFixed(1)}→${s.endKm.toFixed(1)} km</td>
      <td class="mono">${s.type==='up'?`+${s.dplus}m`:s.type==='down'?`-${s.dminus}m`:'—'}</td>
      <td class="mono">${fmtT(pred)}</td>
      <td class="mono">${real?fmtT(real):'—'}</td>
      <td class="mono" style="color:${diffColor};font-weight:600">${diff!==null?(diff>0?'+':'')+diff+'% '+diffIcon:'—'}</td>
      <td class="mono t2">${sectionHR[i]?sectionHR[i]+' bpm':'—'}</td>
    </tr>`;
  }).join('');

  const validDiffs=sections.map((_,i)=>{const p=predicted[i],r=actual[i];return r&&p?(r-p)/p*100:null;}).filter(d=>d!==null);
  const uphillDiffs=sections.map((s,i)=>s.type==='up'&&actual[i]&&predicted[i]?(actual[i]-predicted[i])/predicted[i]*100:null).filter(d=>d!==null);
  const downDiffs=sections.map((s,i)=>s.type==='down'&&actual[i]&&predicted[i]?(actual[i]-predicted[i])/predicted[i]*100:null).filter(d=>d!==null);
  const flatDiffs=sections.map((s,i)=>s.type==='flat'&&actual[i]&&predicted[i]?(actual[i]-predicted[i])/predicted[i]*100:null).filter(d=>d!==null);
  const avgUpDiff=uphillDiffs.length?Math.round(uphillDiffs.reduce((a,b)=>a+b,0)/uphillDiffs.length):null;
  const avgDownDiff=downDiffs.length?Math.round(downDiffs.reduce((a,b)=>a+b,0)/downDiffs.length):null;
  const avgFlatDiff=flatDiffs.length?Math.round(flatDiffs.reduce((a,b)=>a+b,0)/flatDiffs.length):null;

  const sportType=(currentRaceContext||window._openEventRace)?.type||race.type||'Trail';
  const calibChips=[
    avgUpDiff!==null?`⛰️ Montées ${avgUpDiff>0?'+':''}${avgUpDiff}% (×${(1+avgUpDiff/100).toFixed(2)})`:'',
    avgDownDiff!==null?`🎿 Descentes ${avgDownDiff>0?'+':''}${avgDownDiff}% (×${(1+avgDownDiff/100).toFixed(2)})`:'',
    avgFlatDiff!==null?`➡️ Plat ${avgFlatDiff>0?'+':''}${avgFlatDiff}% (×${(1+avgFlatDiff/100).toFixed(2)})`:'',
  ].filter(Boolean);

  const weatherAlerts=weather?[
    weather.temp>=28?'⚠️ Chaleur importante — impact direct sur la FC et le chrono':'',
    weather.temp<=3?'❄️ Froid extrême — rigidité musculaire, économie de course dégradée':'',
    weather.wind>=30?'💨 Vent fort — pénalise les sections exposées':'',
    weather.precip>=3?'🌧️ Pluie significative — sol glissant, freinage en descente':'',
  ].filter(Boolean):[];

  const weatherHTML=weather?`
    <div class="card" style="background:var(--bg3);margin-top:12px">
      <div class="clabel" style="margin-bottom:.5rem">🌤️ Conditions le jour de course</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:${weatherAlerts.length?'8px':'0'}">
        ${weather.temp!==null?`<span class="mono" style="font-size:.78rem">🌡️ ${weather.temp}°C</span>`:''}
        ${weather.wind!==null?`<span class="mono" style="font-size:.78rem">💨 ${weather.wind} km/h</span>`:''}
        ${weather.precip!==null?`<span class="mono" style="font-size:.78rem">🌧️ ${weather.precip} mm</span>`:''}
      </div>
      ${weatherAlerts.map(a=>`<div class="mono t3" style="font-size:.6rem;margin-top:4px;color:var(--yellow)">${a}</div>`).join('')}
    </div>`:'';

  const calHTML=`
    <div class="card" style="background:var(--bg3);margin-top:12px">
      <div class="clabel" style="margin-bottom:.5rem">🔥 Dépense énergétique</div>
      <div style="display:grid;grid-template-columns:${actCal?'1fr 1fr 1fr':'1fr'};gap:8px">
        <div class="s-stat"><div class="s-sv">${predCal}</div><div class="s-sl">Prévu (kcal)</div><div style="font-size:.55rem;color:var(--text3)">Modèle Minetti · ${weight}kg</div></div>
        ${actCal?`<div class="s-stat"><div class="s-sv">${actCal}</div><div class="s-sl">Réel Strava (kcal)</div></div>`:''}
        ${calDiff!==null?`<div class="s-stat"><div class="s-sv" style="color:${Math.abs(calDiff)<=15?'var(--green)':'var(--yellow)'}">${calDiff>0?'+':''}${calDiff}%</div><div class="s-sl">Écart</div><div style="font-size:.55rem;color:var(--text3)">${Math.abs(calDiff)>15?'Calibration en cours':'Estimation cohérente'}</div></div>`:''}
      </div>
    </div>`;

  section.innerHTML=`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:8px">
        <div class="clabel" style="margin:0">Comparaison prévu / réel — ${race.name}</div>
        ${avgUpDiff!==null?`<div class="mono" style="font-size:.6rem;color:${Math.abs(avgUpDiff)<=10?'var(--green)':Math.abs(avgUpDiff)<=25?'var(--yellow)':'var(--red)'}">Montées : ${avgUpDiff>0?'+':''}${avgUpDiff}% vs prédictions</div>`:''}
      </div>
      <div style="overflow-x:auto">
        <table class="splits-table">
          <thead><tr><th>Section</th><th>D+/D-</th><th>Prévu</th><th>Réel</th><th>Écart</th><th>FC moy</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="mono t3" style="font-size:.56rem;margin-top:8px">✓ = ±10% · ~ = ±25% · ⚠️ = &gt;25% d'écart</div>
    </div>
    ${weatherHTML}`;

  // Save calibration coefficients (per sport type)
  const coeffKey=sportType.toLowerCase().includes('trail')||sportType.toLowerCase().includes('ultra')?'trail':'road';
  if(avgUpDiff!==null){userProfile.coeff_uphill=1+avgUpDiff/100;userProfile[`coeff_up_${coeffKey}`]=userProfile.coeff_uphill;}
  if(avgDownDiff!==null){userProfile.coeff_downhill=1+avgDownDiff/100;userProfile[`coeff_down_${coeffKey}`]=userProfile.coeff_downhill;}
  if(avgFlatDiff!==null){userProfile.coeff_flat=1+avgFlatDiff/100;userProfile[`coeff_flat_${coeffKey}`]=userProfile.coeff_flat;}
  if(avgUpDiff!==null){
    sb.from('profiles').upsert({id:currentUser.id,coeff_uphill:userProfile.coeff_uphill}).then(()=>{});
  }

 // Local race summary — no external AI
if(validDiffs.length >= 2) {
  const aiBox = document.createElement('div');
  aiBox.className = 'ai-analysis mt2';

  const avgDiff = validDiffs.length
    ? Math.round(validDiffs.reduce((a, b) => a + b, 0) / validDiffs.length)
    : 0;

  const worstSection = sections
    .map((s, i) => {
      const p = predicted[i];
      const r = actual[i];
      if (!p || !r) return null;
      const diff = Math.round((r - p) / p * 100);
      return { section: s, index: i, diff };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];

  const upText = avgUpDiff !== null ? `Montées : ${avgUpDiff > 0 ? '+' : ''}${avgUpDiff}% vs prévision.` : '';
  const downText = avgDownDiff !== null ? `Descentes : ${avgDownDiff > 0 ? '+' : ''}${avgDownDiff}% vs prévision.` : '';
  const flatText = avgFlatDiff !== null ? `Plat : ${avgFlatDiff > 0 ? '+' : ''}${avgFlatDiff}% vs prévision.` : '';

  const worstText = worstSection
    ? `Plus gros écart : section ${worstSection.index + 1}, ${worstSection.diff > 0 ? '+' : ''}${worstSection.diff}% vs prévision.`
    : `Aucune section dominante détectée.`;

  aiBox.innerHTML = `
    <div class="ai-header">
      <div class="ai-icon">📊</div>
      <div class="ai-title">Analyse locale — Bilan de course</div>
    </div>
    <div class="ai-text">
      Écart global : ${avgDiff > 0 ? '+' : ''}${avgDiff}% vs algorithme.<br>
      ${upText ? upText + '<br>' : ''}
      ${downText ? downText + '<br>' : ''}
      ${flatText ? flatText + '<br>' : ''}
      ${worstText}<br>
      Analyse générée localement dans Vorcelab, sans transmission à Groq ni à aucun service d'intelligence artificielle externe.
    </div>
  `;

  section.appendChild(aiBox);
}
  }

function raceMenuLinkActivity() {
  const race = currentRaceContext || window._openEventRace;
  if (!race) return;
  linkActivityFromRace(race);
}

function closeAnalyse() {
  document.getElementById('analyseOverlay').classList.remove('open');
  document.body.style.overflow = '';
  if(window._actMapInst){window._actMapInst.remove();window._actMapInst=null;}
}

// ════════════════════════════════════════════════════
// RACE CALENDAR
// ════════════════════════════════════════════════════
function toggleRaceForm() { const f=document.getElementById('raceForm'); if(f) f.classList.toggle('open'); else showAddRaceForm(); }

async function loadRaces() {
  const {data} = await sb.from('race_calendar').select('*').eq('user_id',currentUser.id).order('date');
  if (data) { races=data; renderRaces(); populateRaceSelector(); renderCalendar(); }
}

async function saveRace() {
  const race = {
    user_id:currentUser.id,
    name:document.getElementById('rName').value,
    date:document.getElementById('rDate').value,
    distance:parseFloat(document.getElementById('rDist').value)||null,
    elevation:parseInt(document.getElementById('rElev').value)||null,
    type:document.getElementById('rType').value,
    goal_time:document.getElementById('rGoal').value
  };
  if(!race.name||!race.date)return;
  const {error}=await sb.from('race_calendar').insert(race);
  if(!error){const rf=document.getElementById('raceForm');if(rf)rf.classList.remove('open');const arc=document.getElementById('addRaceCard');if(arc)arc.style.display='none';await loadRaces();}
}

// deleteRace defined in MONTHLY CALENDAR section above

function renderRaces() {
  const list=document.getElementById('raceList');
  const nextWidget=document.getElementById('nextRaceWidget');
  if(!races.length){
    if(list) list.innerHTML='<div class="mono t3">Aucune course planifiée</div>';
    if(nextWidget) nextWidget.innerHTML='<div class="mono t3">Aucune course planifiée</div>';
    renderCalendar(); return;
  }
  const now=new Date();
  const upcoming=races.filter(r=>new Date(r.date)>=now).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const next=upcoming[0];
  if(next && nextWidget){
    const diff=Math.ceil((new Date(next.date)-now)/86400000);
    // gpx_data is stored as JSON array of {lat,lon,ele} — check it has actual points
    let gpxPts=null;
    try{ if(next.gpx_data){ const p=JSON.parse(next.gpx_data); if(Array.isArray(p)&&p.length>0) gpxPts=p; } }catch{}
    const hasGpx=!!gpxPts;
    const phase=diff<=7?{label:'SEMAINE DE COURSE',c:'var(--vl-ember)'}:diff<=21?{label:'AFFÛTAGE',c:'var(--vl-amber)'}:diff<=42?{label:'PRÉPARATION SPÉCIFIQUE',c:'var(--vl-growth)'}:{label:'CONSTRUCTION DE BASE',c:'var(--vl-text-2)'};
    const totalWeeks=Math.ceil(diff/7);
    const progressPct=Math.max(2,Math.min(98,100-(diff/84)*100));
    const raceDate=new Date(next.date).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
    // Mini altimetry SVG — parse from JSON points (gpx_data is [{lat,lon,ele}])
    let miniAlti='';
    let gpxTrace='';
    if(gpxPts&&gpxPts.length>4){
      try{
        // Altimetry profile
        const step=Math.max(1,Math.floor(gpxPts.length/80));
        const eles=gpxPts.filter((_,i)=>i%step===0).map(p=>p.ele||0);
        const mn=Math.min(...eles),mx=Math.max(...eles),range=mx-mn||1;
        const W=100,H=36;
        const coords=eles.map((v,i)=>`${((i/(eles.length-1))*W).toFixed(1)},${(H-2-((v-mn)/range)*(H-6)).toFixed(1)}`);
        const pathD=`M${coords.join(' L')}`;
        miniAlti=`<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" width="100%" height="44" style="display:block;pointer-events:none"><defs><linearGradient id="maG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--vl-ember)" stop-opacity="0.35"/><stop offset="1" stop-color="var(--vl-ember)" stop-opacity="0"/></linearGradient></defs><path d="${pathD} L${W},${H} L0,${H} Z" fill="url(#maG)"/><path d="${pathD}" fill="none" stroke="var(--vl-ember)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/></svg>`;

        // 2D route trace — fills the empty zone between stats and altimetry
        const trStep=Math.max(1,Math.floor(gpxPts.length/300));
        const pts=gpxPts.filter((_,i)=>i%trStep===0);
        const lats=pts.map(p=>p.lat),lons=pts.map(p=>p.lon);
        const minLat=Math.min(...lats),maxLat=Math.max(...lats),dLat=maxLat-minLat||0.001;
        const minLon=Math.min(...lons),maxLon=Math.max(...lons),dLon=maxLon-minLon||0.001;
        const VW=240,VH=130;
        const scale=Math.min(VW/dLon,VH/dLat)*0.82;
        const ox=(VW-dLon*scale)/2,oy=(VH-dLat*scale)/2;
        const tracePts=pts.map(p=>`${(ox+(p.lon-minLon)*scale).toFixed(1)},${(oy+(maxLat-p.lat)*scale).toFixed(1)}`);
        gpxTrace=`<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;opacity:.22;pointer-events:none"><polyline points="${tracePts.join(' ')}" fill="none" stroke="var(--vl-ember)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      }catch(e){}
    }
    nextWidget.innerHTML=`
    <div onclick='goToEvent("${next.id}")' style="position:relative;overflow:hidden;flex:1;display:flex;flex-direction:column;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent">
      <div style="position:absolute;right:0;top:0;bottom:0;width:55%;background:linear-gradient(to left,rgba(229,86,42,.13) 0%,transparent 100%);pointer-events:none"></div>
      <div style="position:relative;padding:16px 16px 0;display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--vl-mono);font-size:9px;color:var(--vl-ember);letter-spacing:.18em;text-transform:uppercase;margin-bottom:5px">${escapeHTML(next.type)}</div>
          <div style="font-family:var(--vl-display);font-size:clamp(2.4rem,4vw,3.2rem);font-weight:800;letter-spacing:.02em;text-transform:uppercase;line-height:.88;margin-bottom:8px">${escapeHTML(next.name)}</div>
          <div style="font-family:var(--vl-serif,'Fraunces'),serif;font-style:italic;font-size:.78rem;color:var(--vl-text-2);line-height:1.4">${raceDate}${next.distance?' · '+next.distance+' km':''}${next.elevation?' · D+ '+next.elevation+' m':''}</div>
        </div>
        <span style="flex-shrink:0;color:var(--vl-ember);font-family:var(--vl-mono);font-size:8.5px;font-weight:700;letter-spacing:.1em;padding:2px 0;white-space:nowrap;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(229,86,42,.4)">STRATÉGIE →</span>
      </div>
      <div style="position:relative;display:flex;align-items:flex-end;gap:14px;padding:10px 16px 12px">
        <div style="flex-shrink:0">
          <div style="font-family:var(--vl-display);font-size:4.8rem;font-weight:800;color:var(--vl-ember);line-height:.82;letter-spacing:-.03em">${diff}</div>
          <div style="font-family:var(--vl-mono);font-size:9px;color:var(--vl-text-3);text-transform:uppercase;letter-spacing:.16em;margin-top:6px">jours</div>
        </div>
        <div style="flex:1;min-width:0;padding-bottom:4px">
          <div style="font-family:var(--vl-mono);font-size:9px;color:${phase.c};letter-spacing:.1em;text-transform:uppercase;font-weight:600;margin-bottom:6px">${phase.label}</div>
          <div style="background:var(--vl-surf-2);border-radius:3px;height:3px;overflow:hidden">
            <div style="height:100%;border-radius:3px;background:var(--vl-ember);width:${progressPct}%;opacity:.9"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;margin-bottom:8px">
            <span style="font-family:var(--vl-mono);font-size:8px;color:var(--vl-text-3)">Début prépa</span>
            <span style="font-family:var(--vl-mono);font-size:8px;color:var(--vl-text-3)">${totalWeeks} sem.</span>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${next.goal_time?`<span class="race-tag" style="border-color:rgba(232,162,58,.35);color:var(--vl-amber);font-size:8px">${escapeHTML(next.goal_time)}</span>`:''}
            ${hasGpx?`<span class="race-tag" style="border-color:rgba(16,185,129,.35);color:var(--vl-growth);font-size:8px">GPX ✓</span>`:''}
          </div>
        </div>
      </div>
      ${gpxTrace?`<div style="height:110px;overflow:hidden;flex-shrink:0">${gpxTrace}</div>`:''}
      ${miniAlti?`<div style="position:relative;overflow:hidden;flex-shrink:0"><div style="position:absolute;bottom:0;left:0;right:0;height:50%;background:linear-gradient(to top,var(--vl-surf),transparent);z-index:1;pointer-events:none"></div>${miniAlti}</div>`:''}
    </div>`;
  } else { if(nextWidget) nextWidget.innerHTML='<div class="mono t3">Toutes les courses sont passées</div>'; }
  if(!list) { renderCalendar(); return; }
  list.innerHTML=races.map(r=>{
    const d=new Date(r.date),diff=Math.ceil((d-now)/86400000),past=diff<0;
    const color=past?'var(--text3)':diff<7?'var(--orange)':diff<30?'var(--yellow)':'var(--cyan)';
    let hasGpx=false;try{if(r.gpx_data){const _p=JSON.parse(r.gpx_data);hasGpx=Array.isArray(_p)&&_p.length>0;}}catch{}
    const hasActivity=!!r.strava_activity_id;
    const rJson=JSON.stringify(r).replace(/'/g,"\\'");

    // Smart buttons based on state
    let buttons='';
    if(!past){
      buttons+=`<button onclick="prepareRace(${JSON.stringify(r).replace(/"/g,'&quot;')})" class="btn-prepare">${hasGpx?'🗺️ Voir stratégie':'🗺️ Préparer'}</button>`;
    } else {
      if(hasGpx){
        buttons+=`<button onclick="prepareRace(${JSON.stringify(r).replace(/"/g,'&quot;')})" class="btn-prepare" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2)">📊 Voir stratégie</button>`;
      } else {
        buttons+=`<button onclick="importOrgGpx(${JSON.stringify(r).replace(/"/g,'&quot;')})" class="btn-prepare" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2)">📥 GPX organisateur</button>`;
      }
      if(hasActivity){
        buttons+=`<button onclick="linkActivityFromRace(${JSON.stringify(r).replace(/"/g,'&quot;')})" class="btn-prepare" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2);font-size:.52rem">↺ Changer</button>`;
      } else {
        buttons+=`<button onclick="linkActivityFromRace(${JSON.stringify(r).replace(/"/g,'&quot;')})" class="btn-prepare" style="background:var(--purple);color:#fff;border-color:var(--purple)">🔗 Lier activité</button>`;
      }
    }

    const linkedAct=hasActivity?allActivities.find(a=>String(a.id)===String(r.strava_activity_id)):null;
    const onCardClick=linkedAct?`openAnalyse(${JSON.stringify(linkedAct).replace(/"/g,'&quot;')})`:hasGpx?`prepareRace(${JSON.stringify(r).replace(/"/g,'&quot;')})`:'';


    return `<div class="race-item" style="cursor:${onCardClick?'pointer':'default'};transition:background .15s"
      onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''"
      onclick="if(event.target.tagName!=='BUTTON'){${onCardClick}}">
      <div><div class="race-cd" style="color:${color}">${past?'✓':diff}</div><div class="race-cd-lbl">${past?'passée':'jours'}</div></div>
      <div class="race-info">
        <div class="race-name">${escapeHTML(r.name)}</div>
        <div class="race-meta">${d.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})} · ${r.distance||'?'}km · D+${r.elevation||'?'}m</div>
        <div class="race-tags">
          <span class="race-tag" style="border-color:${color}40;color:${color}">${escapeHTML(r.type)}</span>
          ${r.goal_time?`<span class="race-tag" style="border-color:var(--text3)40;color:var(--text2)">🎯 ${escapeHTML(r.goal_time)}</span>`:''}
          ${hasGpx?`<span class="race-tag" style="border-color:var(--green)40;color:var(--green)">✓ GPX</span>`:''}
          ${hasActivity?`<span class="race-tag" style="border-color:var(--purple)40;color:var(--purple)">✓ Activité</span>`:''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
        ${buttons}
        <button onclick="deleteRace('${r.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:.75rem">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════
// PREPARE RACE — lien calendrier → stratégie
// ════════════════════════════════════════════════════
function showLinkRacePanel() {
  const panel = document.getElementById('linkRacePanel');
  if(panel) panel.style.display = panel.style.display==='none'?'block':'none';
}

async function linkGpxToRace(raceId, raceName) {
  if(!window._pendingGpxSave) {
    alert('Charge d\'abord un GPX avant de lier à un événement.');
    return;
  }
  const btn = document.getElementById('btnLinkRace');
  if(btn){btn.textContent='Sauvegarde...';btn.disabled=true;}
  const {error} = await sb.from('race_calendar')
    .update({gpx_data: JSON.stringify(window._pendingGpxSave)})
    .eq('id', raceId);
  const panel = document.getElementById('linkRacePanel');
  if(panel) panel.style.display='none';
  if(btn){
    if(error){btn.textContent='❌ Erreur';btn.disabled=false;}
    else{
      btn.textContent=`✓ Lié à ${raceName}`;
      btn.style.background='var(--green)';btn.style.color='#000';btn.style.border='none';
      const idx=races.findIndex(r=>r.id===raceId);
      if(idx>=0)races[idx].gpx_data=JSON.stringify(window._pendingGpxSave);
      currentRaceContext={id:raceId,name:raceName,gpx_data:JSON.stringify(window._pendingGpxSave)};
      renderRaces();
    }
  }
}

async function saveGpxToRace() {
  if(!currentRaceContext?.id||!window._pendingGpxSave) return;
  const btn=document.getElementById('btnSaveGpx');
  if(btn){btn.textContent='Sauvegarde...';btn.disabled=true;}
  const {error}=await sb.from('race_calendar')
    .update({gpx_data: JSON.stringify(window._pendingGpxSave)})
    .eq('id', currentRaceContext.id);
  if(btn){
    if(error){btn.textContent='❌ Erreur';btn.style.background='var(--red)';}
    else{
      btn.textContent='✓ GPX associé !';
      btn.style.background='var(--cyan)';
      // Update local cache
      const idx=races.findIndex(r=>r.id===currentRaceContext.id);
      if(idx>=0)races[idx].gpx_data=JSON.stringify(window._pendingGpxSave);
      currentRaceContext.gpx_data=JSON.stringify(window._pendingGpxSave);
      renderRaces();
      setTimeout(()=>{if(btn){btn.textContent=`💾 Associé à ${currentRaceContext.name}`;btn.disabled=true;}},2000);
    }
  }
}

async function deleteGpxFromRace() {
  const race = window._openEventRace;
  if(!race?.id) return;
  const {error} = await sb.from('race_calendar').update({gpx_data: null}).eq('id', race.id);
  if(error){ showToast('Erreur suppression GPX', 'error'); return; }
  const idx = races.findIndex(r=>r.id===race.id);
  if(idx>=0) races[idx].gpx_data = null;
  race.gpx_data = null;
  if(currentRaceContext?.id===race.id) currentRaceContext.gpx_data = null;
  renderRaces();
  showToast('GPX supprimé ✓', 'success');
}

function importOrgGpx(race) {
  // Create hidden file input and trigger click
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gpx';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    showToast('Analyse du GPX...', 'info');
    const text = await file.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const trkpts = [...xml.querySelectorAll('trkpt')];
    if(!trkpts.length){ showToast('GPX invalide — aucun point trouvé', 'error'); return; }
    const points = trkpts.map(p=>({
      lat: parseFloat(p.getAttribute('lat')),
      lon: parseFloat(p.getAttribute('lon')),
      ele: parseFloat(p.querySelector('ele')?.textContent||0)
    }));
    // Sample every 5 points to reduce size
    const sampled = points.filter((_,i)=>i%5===0);
    const {error} = await sb.from('race_calendar')
      .update({gpx_data: JSON.stringify(sampled)})
      .eq('id', race.id);
    if(error){ showToast('Erreur sauvegarde GPX', 'error'); return; }
    await loadRaces();
    showToast(`GPX associé à ${race.name} ✓`, 'success');
  };
  input.click();
}

async function linkActivityFromRace(race) {
  // Find activities close to race date (±3 days)
  const raceDate = new Date(race.date);
  const nearby = allActivities.filter(a => {
    const d = new Date(a.start_date);
    const diff = Math.abs(d - raceDate) / 86400000;
    return diff <= 3;
  });

  // Show modal with nearby activities
  const modal = document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:2rem';
  modal.onclick = e => { if(e.target===modal) document.body.removeChild(modal); };

  const inner = document.createElement('div');
  inner.style.cssText='background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r);padding:1.5rem;max-width:500px;width:100%;max-height:80vh;overflow-y:auto';
  inner.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <div style="font-family:var(--display);font-size:1.2rem">Lier à ${race.name}</div>
      <button onclick="this.closest('[style*=fixed]').remove()" class="hbtn">✕</button>
    </div>
    <div class="mono t2" style="margin-bottom:1rem;font-size:.62rem">Activités Strava dans les 3 jours autour du ${new Date(race.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long'})}</div>
    ${nearby.length ? nearby.map(a=>`
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px;cursor:pointer;transition:border-color .2s"
        onmouseover="this.style.borderColor='var(--purple)'"
        onmouseout="this.style.borderColor='var(--border)'"
        onclick="confirmLinkActivity('${race.id}','${race.name}',${a.id},this.closest('[style*=fixed]'))">
        <div style="font-weight:600;font-size:.85rem">${a.name}</div>
        <div class="mono t2" style="font-size:.62rem;margin-top:3px">${new Date(a.start_date_local).toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'})} · ${(a.distance/1000).toFixed(1)}km · ${fmtD(a.moving_time)} · +${a.total_elevation_gain||0}m</div>
      </div>`).join('')
    : `<div class="mono t3">Aucune activité trouvée dans les 3 jours autour de la course.<br><br>Vérifie que Strava est connecté et que l'activité est bien synchronisée.</div>`}`;

  modal.appendChild(inner);
  document.body.appendChild(modal);
}

async function confirmLinkActivity(raceId, raceName, actId, modal) {
  const {error} = await sb.from('race_calendar')
    .update({strava_activity_id: actId})
    .eq('id', raceId);
  if(!error){
    await loadRaces();
    if(modal) modal.remove();
    // Trigger comparison in event view if it's open for this race
    const updatedRace = races.find(r=>String(r.id)===String(raceId));
    const compSection = document.getElementById('eventComparisonSection');
    if(updatedRace?.gpx_data && compSection) {
      showToast('Liaison effectuée, chargement de la comparaison…', 'info');
      try {
        const streams = await fetchStreams(actId);
        const actObj = allActivities.find(a=>String(a.id)===String(actId)) || {id:actId, moving_time:0};
        renderRaceComparison(actObj, streams, updatedRace, 'eventComparisonSection');
      } catch(e) { console.warn('comparison fetch failed', e); }
    } else {
      showToast('Activité liée ✓', 'success');
    }
  }
}

function prepareRace(race) {
  // Reset UI state, then restore context AFTER reset (resetStrategy clears it)
  resetStrategy();
  currentRaceContext = race;
  // If GPX already saved, load it directly
  if (race.gpx_data) {
    try {
      const points = JSON.parse(race.gpx_data);
      // Guard: need at least 10 points and real coordinates
      const validPts = points.filter(p => p.lat && p.lon && Math.abs(p.lat) > 0.001);
      if (validPts.length < 10) { showGpxUploadPrompt(race); return; }
      // Guard: distance > 100m
      let d = 0;
      for(let i=1;i<validPts.length;i++) d += hav(validPts[i-1], validPts[i]);
      if (d < 100) { showGpxUploadPrompt(race); return; }
      document.getElementById('gpxDrop').style.display = 'none';
      analyzeGPX(points, race.name);
    } catch(e) {
      showGpxUploadPrompt(race);
    }
  } else {
    showGpxUploadPrompt(race);
  }
}

function showGpxUploadPrompt(race) {
  const drop = document.getElementById('gpxDrop');
  drop.style.display = 'block';
  drop.innerHTML = `
    <div style="font-size:2rem;margin-bottom:.5rem">🗺️</div>
    <div style="font-family:var(--display);font-size:1.3rem;letter-spacing:.03em;margin-bottom:.25rem">${escapeHTML(race.name)}</div>
    <div class="mono t2" style="margin-bottom:.75rem">Upload le GPX pour générer la stratégie</div>
    <div class="mono t3">Compatible OpenRunner · Strava · Garmin Connect</div>`;
  drop.onclick = ()=>document.getElementById('gpxFile').click();
}

// ════════════════════════════════════════════════════
// ZIP HANDLER
// ════════════════════════════════════════════════════
function handleZipDrop(e){e.preventDefault();document.getElementById('zipDropZone').classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f&&f.name.endsWith('.zip'))processZip(f);}
function handleZipFile(e){const f=e.target.files[0];if(f)processZip(f);}

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

  const {error}=await sb.from('activities_history').delete().eq('user_id',currentUser.id).then(()=>
    sb.from('activities_history').insert({user_id:currentUser.id,data:rows,imported_at:new Date().toISOString()})
  );

  statsEl.innerHTML=`
    <div class="hsr"><span class="t2">Activités running importées</span><span class="mono">${rows.length}</span></div>
    <div class="hsr"><span class="t2">Distance totale</span><span class="mono">${totalKm.toFixed(0)} km</span></div>
    <div class="hsr"><span class="t2">D+ total</span><span class="mono">${totalDplus.toFixed(0)} m</span></div>
    <div class="hsr"><span class="t2">Période</span><span class="mono">${dates[0]?.split(' ')[0]||'?'} → ${dates[dates.length-1]?.split(' ')[0]||'?'}</span></div>
    ${error?`<div style="color:var(--red);font-size:.7rem;margin-top:6px">Erreur sauvegarde : ${error.message}</div>`:`<div style="color:var(--green);font-family:var(--mono);font-size:.6rem;margin-top:6px">✓ Historique sauvegardé</div>`}`;

  // Update annual chart with history
  renderAnnualChart();
  // Update onboarding steps
  updateOnboardingSteps();
}

async function loadHistoryFromDB() {
  const {data}=await sb.from('activities_history').select('data').eq('user_id',currentUser.id).single();
  if(data?.data){historyActivities=data.data;renderAnnualChart();}
}

function updateOnboardingSteps() {
  if(allActivities.length>0){document.getElementById('step1').classList.add('done');document.getElementById('step1-num').textContent='✓';}
  if(historyActivities.length>0){document.getElementById('step2').classList.add('done');document.getElementById('step2-num').textContent='✓';}
  if(userProfile.fc_max||userProfile.vo2max){document.getElementById('step3').classList.add('done');document.getElementById('step3-num').textContent='✓';}
}

// ════════════════════════════════════════════════════
// GPX STRATEGY
// ════════════════════════════════════════════════════
let leafletMap = null;
let currentRaceContext = null;

function handleGpxDrop(e){e.preventDefault();document.getElementById('gpxDrop').classList.remove('drag');const f=e.dataTransfer.files[0];if(f&&f.name.endsWith('.gpx'))parseGPX(f);}
function handleGpxFile(e){const f=e.target.files[0];if(f)parseGPX(f);}

function parseGPX(file, raceCtx=null){
  if(raceCtx) currentRaceContext=raceCtx;
  const reader=new FileReader();
  reader.onload=async e=>{
    const xml=new DOMParser().parseFromString(e.target.result,'text/xml');
    const pts=xml.querySelectorAll('trkpt');
    if(!pts.length){alert('GPX invalide ou vide');return;}
    const points=[];
    pts.forEach(pt=>{const lat=parseFloat(pt.getAttribute('lat')),lon=parseFloat(pt.getAttribute('lon')),ele=pt.querySelector('ele');points.push({lat,lon,ele:ele?parseFloat(ele.textContent):null});});
    await analyzeGPX(points, file.name||'');
  };
  reader.readAsText(file);
}

function hav(p1,p2){const R=6371000,r=Math.PI/180,dLat=(p2.lat-p1.lat)*r,dLon=(p2.lon-p1.lon)*r,a=Math.sin(dLat/2)**2+Math.cos(p1.lat*r)*Math.cos(p2.lat*r)*Math.sin(dLon/2)**2;return R*2*Math.asin(Math.sqrt(a));}
function fmtT(s){const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h>0?`${h}h${String(m).padStart(2,'0')}`:`${m}min`;}

// Minetti (2002) gradient penalty — uphill validated, downhill empirical trail model
function minettiGradePenalty(grade) {
  if(grade >= 0) {
    const i=Math.min(grade, 0.50);
    const c=280.5*i**5 - 58.7*i**4 - 76.8*i**3 + 51.9*i**2 + 19.6*i + 2.5;
    return c/2.5 - 1;
  } else {
    const g=Math.abs(grade);
    if(g<=0.12) return -g*0.5;
    if(g<=0.25) return -0.06+(g-0.12)*1.5;
    return 0.135+(g-0.25)*3.0;
  }
}

async function analyzeGPX(points, fname) {
  let cumDist=[0],dplus=0,dminus=0;
  for(let i=1;i<points.length;i++){
    cumDist.push(cumDist[i-1]+hav(points[i-1],points[i]));
    if(points[i].ele&&points[i-1].ele){const diff=points[i].ele-points[i-1].ele;if(diff>0)dplus+=diff;else dminus+=Math.abs(diff);}
  }
  const totalDist=cumDist[cumDist.length-1];
  const eles=points.map(p=>p.ele).filter(e=>e!=null);
  const altMin=Math.min(...eles),altMax=Math.max(...eles);

  // Samples every 100m
  const samples=[];let target=0;
  for(let i=0;i<points.length;i++){if(cumDist[i]>=target){samples.push({d:+(cumDist[i]/1000).toFixed(2),alt:points[i].ele?Math.round(points[i].ele):null});target+=100;}}
  samples.push({d:+(totalDist/1000).toFixed(2),alt:eles[eles.length-1]?Math.round(eles[eles.length-1]):null});

  // Weather — forecast : récupère aussi precipitation (mm) et fenêtre 6h
  let weather=null;
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${points[0].lat}&longitude=${points[0].lon}&hourly=temperature_2m,precipitation_probability,precipitation,windspeed_10m&timezone=Europe%2FParis&forecast_days=2`);
    const d=await r.json();
    const h=9;
    const precip6h=(d.hourly?.precipitation||[]).slice(Math.max(0,h-6),h+1).reduce((a,v)=>a+(v||0),0);
    weather={temp:d.hourly?.temperature_2m?.[h],precip_prob:d.hourly?.precipitation_probability?.[h]??0,precip:d.hourly?.precipitation?.[h]??0,precip_recent:precip6h,wind:d.hourly?.windspeed_10m?.[h]};
  }catch{}

  // 500m sections with detailed grade
  const kmSecs=[];let segTarget=500,prevIdx=0,segNum=0;
  for(let i=0;i<cumDist.length;i++){
    if(cumDist[i]>=segTarget||i===cumDist.length-1){
      let sdp=0,sdm=0;
      for(let j=prevIdx+1;j<=i;j++){if(points[j].ele&&points[j-1].ele){const diff=points[j].ele-points[j-1].ele;if(diff>0)sdp+=diff;else sdm+=Math.abs(diff);}}
      const segDist=cumDist[i]-cumDist[prevIdx];
      const elevChange=points[i].ele&&points[prevIdx].ele?points[i].ele-points[prevIdx].ele:0;
      const grade=segDist>0?(elevChange/segDist)*100:0;
      const startKm=+(cumDist[prevIdx]/1000).toFixed(2);
      const endKm=+(cumDist[i]/1000).toFixed(2);
      kmSecs.push({km:endKm,startKm,dist:segDist,dplus:Math.round(sdp),dminus:Math.round(sdm),grade:+grade.toFixed(1),altEnd:points[i].ele?Math.round(points[i].ele):null});
      prevIdx=i;segTarget=cumDist[i]+500;segNum++;
    }
  }

  // ── ALGO PROGRESSION ──
  // Compute performance index from recent quality sessions (>20% time in Z3+)
  function computeProgressionFactor(trailOnly=false) {
    if(!allActivities.length) return 1;
    const fcMax=userProfile.fc_max||205;
    const z3min=Math.round(fcMax*.80);
    let sessions=allActivities.filter(a=>{
      if(!isRun(a.type)) return false;
      if(trailOnly && a.type!=='TrailRun') return false;
      if(!a.average_heartrate) return false;
      return a.average_heartrate > z3min && a.distance > 3000;
    }).sort((a,b)=>new Date(a.start_date)-new Date(b.start_date));
    // Fall back to all runs if not enough trail sessions
    if(sessions.length<4 && trailOnly) return computeProgressionFactor(false);
    if(sessions.length<4) return 1;
    const half=Math.floor(sessions.length/2);
    const early=sessions.slice(0,half);
    const recent=sessions.slice(-half);
    const avgPaceEarly=early.reduce((s,a)=>s+a.average_speed,0)/early.length;
    const avgPaceRecent=recent.reduce((s,a)=>s+a.average_speed,0)/recent.length;
    if(avgPaceEarly<=0) return 1;
    return Math.min(1.10, Math.max(0.90, avgPaceRecent/avgPaceEarly));
  }

  const isTrail=isTrailRace();
  const progressionFactor = computeProgressionFactor(isTrail);
  const qualityCount = allActivities.filter(a=>isRun(a.type)&&a.average_heartrate>(userProfile.fc_max||205)*.80&&a.distance>3000).length;

  // Base pace: goal time → trail activities → road PRs (with coeff) → default
  let basePaceS=isTrail?420:320;
  let projSource='';
  if(currentRaceContext?.goal_time) {
    const gt=currentRaceContext.goal_time;
    const parts=gt.split(/[h:]/);
    let goalS=0;
    if(parts.length===2)goalS=parseInt(parts[0])*60+parseInt(parts[1]);
    else if(parts.length===3)goalS=parseInt(parts[0])*3600+parseInt(parts[1])*60+(parseInt(parts[2])||0);
    if(goalS>0){
      const tf=sections.reduce((a,s)=>a+(1+minettiGradePenalty(s.grade/100))*s.dist/1000,0);
      basePaceS=tf>0?goalS/tf:goalS/(totalDist/1000);
      projSource=`🎯 Objectif ${currentRaceContext.goal_time}`;
    }
  } else if(isTrail) {
    // Trail races: use real trail activities, not road PRs
    const trailRuns=allActivities
      .filter(a=>(a.type==='TrailRun'||/trail/i.test(a.sport_type||''))&&a.distance>5000&&a.average_speed>0)
      .sort((a,b)=>b.start_date_local-a.start_date_local||b.average_speed-a.average_speed)
      .slice(0,10);
    if(trailRuns.length>=1){
      // Use median pace of top trail runs, weight by D+ density (VAM proxy)
      const top=trailRuns.slice(0,Math.min(10,trailRuns.length));
      // D+-weighted pace: prefer activities with similar D+/km profile to current race
      const raceDpKm=dplus/(totalDist/1000);
      const scored=top.map(a=>{
        const aDpKm=(a.total_elevation_gain||0)/(a.distance/1000);
        const similarity=1-Math.min(1,Math.abs(aDpKm-raceDpKm)/(raceDpKm+1));
        return {paceS:1000/a.average_speed, weight:0.4+0.6*similarity};
      });
      const totalW=scored.reduce((s,x)=>s+x.weight,0);
      const weightedPace=scored.reduce((s,x)=>s+x.paceS*x.weight,0)/totalW;
      basePaceS=weightedPace/progressionFactor;
      const prog=progressionFactor>1?`+${((progressionFactor-1)*100).toFixed(1)}%`:progressionFactor<0.98?`${((progressionFactor-1)*100).toFixed(1)}%`:'stable';
      projSource=`⛰️ ${trailRuns.length} sortie${trailRuns.length>1?'s':''} trail (10 dernières) · D+ pondéré · progression ${prog}`;
    } else {
      // No trail data — refuse to use road PRs for trail estimation
      projSource='⚠️ Aucune sortie trail disponible — sync tes activités trail Strava pour une projection fiable';
    }
  } else if(userProfile.prs){
    // Road race: use road PRs directly (no trail coefficient)
    const prs=userProfile.prs;
    const candidates=['semi','10k','15k','marathon','5k'].filter(k=>prs[k]?.timeS&&prs[k]?.dist);
    if(candidates.length){
      const pr=prs[candidates[0]];
      basePaceS=(pr.timeS/pr.dist*1000)/progressionFactor;
      const prog=progressionFactor>1?`+${((progressionFactor-1)*100).toFixed(1)}%`:progressionFactor<0.98?`${((progressionFactor-1)*100).toFixed(1)}%`:'stable';
      projSource=`📊 PR ${candidates[0].toUpperCase()} · progression ${prog}`;
    }
  }
  if(!projSource) projSource=isTrail?'⚠️ Aucune sortie trail — sync Strava pour une projection trail fiable':'⚙️ Estimation par défaut — renseigne tes PR';

  // Build sections
  const sections=buildDetailedSections(kmSecs);
  // Fetch terrain surfaces in parallel (OSM Overpass) while we compute times
  const surfacePromise=fetchTerrainSurfaces(points, sections);
  const sectionTimes=[];
  let estTimeS=0;
  sections.forEach(s=>{
    const t=basePaceS*(1+minettiGradePenalty(s.grade/100))*s.dist/1000;
    sectionTimes.push(Math.round(t));estTimeS+=t;
  });
  const dh=estTimeS/3600;
  const distKm=totalDist/1000;
  const raceName=currentRaceContext?.name||fname.replace('.gpx','')||'Course';
  const raceDate=currentRaceContext?.date?new Date(currentRaceContext.date).toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}):'';
  const splits=buildSplitsTable(kmSecs,basePaceS);

  // Await terrain surfaces (fetched in parallel above)
  window._gpxSectionSurfaces = await surfacePromise;
  window._gpxWeather = weather;

  const res=document.getElementById('stratResult');
  res.style.display='block';
  document.getElementById('gpxDrop').style.display='none';

  // isTrail already declared above
  const saveGpxItem = document.getElementById('raceMenuSaveGpx');
  if(saveGpxItem) saveGpxItem.style.display = currentRaceContext?.id ? 'block' : 'none';

  // ── Calcul marge vs objectif ──
  let marginStr = '', marginColor = 'var(--vl-text-3)';
  if(currentRaceContext?.goal_time) {
    const gParts = currentRaceContext.goal_time.match(/(\d+)[hH](\d*)/);
    if(gParts) {
      const goalSec = parseInt(gParts[1])*3600 + (parseInt(gParts[2])||0)*60;
      const diff = goalSec - Math.round(estTimeS);
      const absDiff = Math.abs(diff);
      const mh = Math.floor(absDiff/3600), mm = Math.floor(absDiff%3600/60), ms = absDiff%60;
      const sign = diff >= 0 ? '+' : '−';
      marginStr = `${sign} ${mh>0?mh+'h':''}${mm>0?String(mm).padStart(mh>0?2:1,'0')+'min':''}${ms>0&&mh===0?String(ms).padStart(mm>0?2:1,'0')+'s':''} sur objectif`;
      marginColor = diff >= 0 ? 'var(--vl-growth)' : 'var(--vl-ember)';
    }
  }

  res.innerHTML=`
    ${!currentRaceContext?`<div style="font-family:var(--vl-display);font-size:2rem;letter-spacing:0.02em;line-height:0.9;text-transform:uppercase;margin-bottom:.25rem">${raceName}</div><div class="mlabel" style="color:var(--vl-text-3);margin-bottom:1.25rem">${raceDate}</div>`:''}

    <!-- Stats strip -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:1px;background:var(--vl-line);border:1px solid var(--vl-line);border-radius:var(--vl-r-sm);overflow:hidden;margin-bottom:1rem">
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:var(--vl-ember)">${distKm.toFixed(1)} km</div><div class="lbl">Distance</div></div>
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:var(--vl-amber)">+${Math.round(dplus)} m</div><div class="lbl">D+</div></div>
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:var(--vl-text-2)">−${Math.round(dminus)} m</div><div class="lbl">D−</div></div>
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val">${altMin} m</div><div class="lbl">Alt. min</div></div>
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val">${altMax} m</div><div class="lbl">Alt. max</div></div>
      ${weather?.temp!=null?`<div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:${weather.temp>25?'var(--vl-ember)':weather.temp<5?'var(--vl-amber)':'var(--vl-growth)'}">${Math.round(weather.temp)}°C</div><div class="lbl">Météo</div></div>`:''}
      ${weather?.precip_prob!=null?`<div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:${weather.precip_prob>50?'var(--vl-ember)':'var(--vl-growth)'}">${weather.precip_prob}%</div><div class="lbl">Pluie</div></div>`:''}
    </div>

    <!-- Map + altimetry (fused card) -->
    <div class="card no-print" style="padding:0;overflow:hidden">
      <div style="padding:12px 14px 8px;display:flex;align-items:center;justify-content:space-between">
        <span class="clabel" style="margin:0">Tracé GPX + profil</span>
        <span class="mlabel" style="color:var(--vl-text-3)">${distKm.toFixed(2)} km</span>
      </div>
      <div id="raceMap"></div>
      <div class="gpx-chart-row" style="padding:0 14px 0;border-top:1px solid var(--vl-line)">
        <div class="chart-wrap" style="height:100px"><canvas id="gpxChart"></canvas></div>
      </div>
    </div>

    <!-- Projection -->
    <div class="vl-proj-card">
      <div>
        <div class="mlabel" style="margin-bottom:6px">Projection</div>
        <div class="vl-proj-time">${fmtT(estTimeS)}</div>
        ${marginStr?`<div class="vl-proj-margin" style="color:${marginColor};margin-top:4px">${marginStr}</div>`:''}
        <div class="mlabel" style="color:var(--vl-text-3);margin-top:6px">${projSource||'Minetti 2002 · allure estimée'}</div>
      </div>
      ${currentRaceContext?.goal_time?`
      <div class="vl-proj-obj">
        <div class="mlabel" style="margin-bottom:6px">Objectif</div>
        <div class="vl-proj-obj-time">${currentRaceContext.goal_time}</div>
      </div>`:`
      <div style="text-align:right">
        <div class="mlabel" style="margin-bottom:8px">Scénarios</div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          <div><span class="mlabel" style="color:var(--vl-text-3)">Conservateur</span> <span style="font-family:var(--vl-mono);font-size:11px;color:var(--vl-text-2)">${fmtT(estTimeS*1.1)}</span></div>
          <div><span class="mlabel" style="color:var(--vl-growth)">Agressif</span> <span style="font-family:var(--vl-mono);font-size:11px;color:var(--vl-text)">${fmtT(estTimeS*.92)}</span></div>
        </div>
      </div>`}
    </div>

    <!-- Sections -->
    <details open>
      <summary class="vl-details-summary">
        <span class="vl-details-title">Plan de course</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="mlabel">${sections.length} section${sections.length>1?'s':''}</span>
          <span style="font-family:var(--vl-mono);font-size:14px;color:var(--vl-text-3)">▾</span>
        </span>
      </summary>
      <div id="sectionsScroll" class="vl-sections-scroll">
        ${sections.map((s,i)=>renderDetailedSection(s,sectionTimes[i],i)).join('')}
      </div>
    </details>

    <!-- Nutrition -->
    <details style="margin-top:8px">
      <summary class="vl-details-summary">
        <span class="vl-details-title">Plan nutrition</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="mlabel">${dh<1.25?'< 75 min':dh<2.5?'75–150 min':'> 150 min'}</span>
          <span style="font-family:var(--vl-mono);font-size:14px;color:var(--vl-text-3)">▾</span>
        </span>
      </summary>
      <div style="border:1px solid var(--vl-line);border-top:none;border-radius:0 0 var(--vl-r-sm) var(--vl-r-sm);padding:14px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:9px;margin-bottom:1rem">
          <div class="s-stat"><div class="s-sv tc">${dh<1.25?'Eau only':dh<2.5?Math.round(30*(dh-0.5))+'g':Math.round(60*(dh-0.5))+'g'}</div><div class="s-sl">Glucides cibles</div></div>
          <div class="s-stat"><div class="s-sv tg">${Math.round(dh*400)} ml</div><div class="s-sl">Eau estimée</div></div>
          <div class="s-stat"><div class="s-sv ${dh<1.25?'tg':dh<2.5?'ty':'to'}">${dh<1.25?'< 75min':dh<2.5?'75–150min':'> 150min'}</div><div class="s-sl">Protocole</div></div>
        </div>
        ${dh<1.25?`<div style="background:color-mix(in oklab, var(--vl-growth) 8%, transparent);border:1px solid color-mix(in oklab, var(--vl-growth) 25%, transparent);border-radius:var(--vl-r-sm);padding:10px 14px;font-size:.8rem;margin-bottom:.75rem"><strong style="color:var(--vl-growth)">Effort &lt; 75 min — eau uniquement pendant la course.</strong><br><span class="mlabel" style="color:var(--vl-text-3)">Réserves glycogéniques endogènes suffisantes. Burke et al., 2011</span></div>`:''}
        <table class="nutr-table"><thead><tr><th>Moment</th><th>Action</th><th>Glucides</th><th>Justification</th></tr></thead><tbody>${genNutrition(totalDist,estTimeS)}</tbody></table>
        <div class="mlabel" style="margin-top:10px;color:var(--vl-text-3)">Burke 2011 · Jeukendrup 2004 · Currell &amp; Jeukendrup 2008 · Ivy 1998</div>
      </div>
    </details>

    <!-- Splits -->
    <details style="margin-top:8px">
      <summary class="vl-details-summary">
        <span class="vl-details-title">Splits km par km</span>
        <span style="font-family:var(--vl-mono);font-size:14px;color:var(--vl-text-3)">▾</span>
      </summary>
      <div style="overflow-x:auto;border:1px solid var(--vl-line);border-top:none;border-radius:0 0 var(--vl-r-sm) var(--vl-r-sm);padding:10px">
        <table class="splits-table"><thead><tr><th>Km</th><th>Type</th><th>Pente</th><th>D+</th><th>D-</th><th>Alt</th><th>Durée sect.</th><th>Temps cumulé</th><th>Conseil FC</th></tr></thead><tbody>${splits}</tbody></table>
      </div>
    </details>`;

  // ── Globals interactivité ──
  window._gpxPoints = points;
  window._gpxSamples = samples;
  window._gpxSections = sections;
  window._gpxDistKm = distKm;
  window._gpxCumDist = cumDist;
  window._gpxChart = null;
  window._activeSection = -1;
  window._sectionPolylines = [];
  window._hoverMarker = null;

  // Dark map
  setTimeout(()=>{
    if(leafletMap){leafletMap.remove();leafletMap=null;}
    leafletMap=L.map('raceMap',{zoomControl:true,scrollWheelZoom:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(leafletMap);

    // Tracé de fond sombre
    const allLL=points.filter((_,i)=>i%3===0).map(p=>[p.lat,p.lon]);
    L.polyline(allLL,{color:'rgba(243,239,228,.08)',weight:5,opacity:1}).addTo(leafletMap);

    // Polylines colorées par section + interactivité
    window._sectionPolylines = sections.map((s,idx)=>{
      // Use cumDist for accurate section boundaries (GPS points not uniformly spaced)
      const si=Math.max(0, cumDist.findIndex(d=>d>=s.startKm*1000));
      const eiRaw=cumDist.findIndex(d=>d>=s.endKm*1000);
      const ei=eiRaw<0?points.length-1:Math.min(eiRaw,points.length-1);
      // Adaptive decimation: max ~80 pts per section, always keep last point to avoid gaps
      const raw=points.slice(si,ei+1);
      const step=Math.max(1,Math.floor(raw.length/80));
      const ll=raw.filter((_,i)=>i%step===0||i===raw.length-1).map(p=>[p.lat,p.lon]);
      const col={up:'#E5562A',down:'#E8A23A',flat:'#10B981'}[s.type];
      const poly=L.polyline(ll,{color:col,weight:4,opacity:.85}).addTo(leafletMap);
      poly.on('click',()=>highlightSection(idx));
      poly.on('mouseover',()=>{if(window._activeSection!==idx)poly.setStyle({weight:6,opacity:1});});
      poly.on('mouseout',()=>{if(window._activeSection!==idx)poly.setStyle({weight:4,opacity:.85});});
      return {poly,col,s};
    });

    // Marqueur survol carte → profil alti
    window._hoverMarker = L.circleMarker([points[0].lat,points[0].lon],{radius:6,fillColor:'#E5562A',color:'#F3EFE4',weight:2,fillOpacity:1}).addTo(leafletMap);
    window._hoverMarker.setStyle({opacity:0,fillOpacity:0});

    leafletMap.on('mousemove',e=>{
      // Trouver le point GPX le plus proche du curseur
      let minDist=Infinity,closest=0;
      points.forEach((p,i)=>{
        const d=Math.pow(p.lat-e.latlng.lat,2)+Math.pow(p.lon-e.latlng.lng,2);
        if(d<minDist){minDist=d;closest=i;}
      });
      const km=(cumDist[closest]/1000);
      // Mettre à jour le marqueur
      window._hoverMarker.setLatLng([points[closest].lat,points[closest].lon]);
      window._hoverMarker.setStyle({opacity:1,fillOpacity:1});
      // Mettre à jour le profil alti via plugin annotation
      if(window._gpxChart){
        const si=samples.findIndex(s=>s.d>=km-0.05&&s.d<=km+0.15);
        if(si>=0){
          window._gpxChart.data.datasets[1]={label:'Pos',data:samples.map((_,i)=>i===si?samples[i].alt:null),borderColor:'#E5562A',backgroundColor:'#E5562A',pointRadius:samples.map((_,i)=>i===si?6:0),pointBackgroundColor:'#E5562A',fill:false,tension:0,showLine:false};
          window._gpxChart.update('none');
        }
      }
    });
    leafletMap.on('mouseout',()=>{
      window._hoverMarker.setStyle({opacity:0,fillOpacity:0});
      if(window._gpxChart){window._gpxChart.data.datasets[1]={label:'Pos',data:samples.map(()=>null),pointRadius:0};window._gpxChart.update('none');}
    });

    // Marqueurs départ / arrivée
    L.circleMarker([points[0].lat,points[0].lon],{radius:9,fillColor:'#10B981',color:'#0E0D0A',weight:2.5,fillOpacity:1}).bindPopup('<b>Départ</b>').addTo(leafletMap);
    L.circleMarker([points[points.length-1].lat,points[points.length-1].lon],{radius:9,fillColor:'#F3EFE4',color:'#0E0D0A',weight:2.5,fillOpacity:1}).bindPopup('<b>Arrivée</b>').addTo(leafletMap);

    // Fit bounds
    const polyAll=L.polyline(allLL);
    leafletMap.fitBounds(polyAll.getBounds(),{padding:[20,20]});
    leafletMap.invalidateSize();
    setTimeout(()=>leafletMap&&leafletMap.invalidateSize(),150);
  },300);

  // Alti chart avec interactivité
  if(window._gpxChart){window._gpxChart.destroy();window._gpxChart=null;}
  const chartCtx=document.getElementById('gpxChart');

  // Couleur par section sur le profil
  const sectionColors=samples.map(s=>{
    const km=s.d;
    const sec=sections.find(sec=>km>=sec.startKm&&km<=sec.endKm);
    if(!sec)return 'rgba(229,86,42,.08)';
    return {up:'rgba(229,86,42,.18)',down:'rgba(232,162,58,.18)',flat:'rgba(16,185,129,.14)'}[sec.type];
  });

  function syncMapFromChartIdx(idx){
    if(!leafletMap) return;
    const s=samples[idx];
    if(!s) return;
    const targetDist=s.d*1000;
    const cd=window._gpxCumDist||[];
    let closest=0,minD=Infinity;
    cd.forEach((d,i)=>{const diff=Math.abs(d-targetDist);if(diff<minD){minD=diff;closest=i;}});
    const pts=window._gpxPoints||[];
    if(window._hoverMarker&&pts[closest])window._hoverMarker.setLatLng([pts[closest].lat,pts[closest].lon]).setStyle({opacity:1,fillOpacity:1});
  }

  window._gpxChart=new Chart(chartCtx,{
    type:'line',
    data:{
      labels:samples.map(s=>s.d.toFixed(1)),
      datasets:[
        {label:'Alt',data:samples.map(s=>s.alt),borderColor:'#E5562A',backgroundColor:ctx=>{const g=ctx.chart.ctx.createLinearGradient(0,0,0,240);g.addColorStop(0,'rgba(229,86,42,.3)');g.addColorStop(1,'rgba(229,86,42,0)');return g;},fill:true,tension:.4,pointRadius:0,borderWidth:2,pointHoverRadius:0},
        {label:'Pos',data:samples.map(()=>null),borderColor:'#E5562A',backgroundColor:'#E5562A',pointRadius:0,pointBackgroundColor:'#E5562A',fill:false,tension:0,showLine:false}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            title:i=>`km ${i[0].label}`,
            label:c=>{
              const idx=c.dataIndex;
              const alt=Math.round(c.parsed.y);
              let slope='';
              if(idx>0&&samples[idx-1]?.alt&&samples[idx]?.alt){
                const dAlt=samples[idx].alt-samples[idx-1].alt;
                const dDist=(samples[idx].d-samples[idx-1].d)*1000;
                if(dDist>0){const pct=(dAlt/dDist*100).toFixed(1);slope=` · Pente: ${pct>0?'+':''}${pct}%`;}
              }
              return `Alt: ${alt}m${slope}`;
            }
          },
          mode:'index',intersect:false
        }
      },
      onHover:(e,els,chart)=>{
        if(els.length&&leafletMap){
          syncMapFromChartIdx(els[0].index);
        } else {
          if(window._hoverMarker)window._hoverMarker.setStyle({opacity:0,fillOpacity:0});
        }
      },
      scales:{
        x:{ticks:{maxTicksLimit:15,font:{size:9},callback:(v,i)=>Number.isInteger(parseFloat(samples[i]?.d))?samples[i].d+'km':''},grid:{color:'rgba(243,239,228,.04)'}},
        y:{min:Math.max(0,altMin-30),max:altMax+30,ticks:{callback:v=>v+'m',font:{size:9}},grid:{color:'rgba(243,239,228,.04)'}}
      }
    }
  });

  // Touch support: sync map marker on mobile swipe over chart
  chartCtx.addEventListener('touchmove',e=>{
    e.preventDefault();
    const touch=e.touches[0];
    const rect=chartCtx.getBoundingClientRect();
    const xRel=touch.clientX-rect.left;
    const chart=window._gpxChart;
    if(!chart)return;
    const area=chart.chartArea;
    if(!area)return;
    const ratio=Math.max(0,Math.min(1,(xRel-area.left)/(area.right-area.left)));
    const idx=Math.round(ratio*(samples.length-1));
    syncMapFromChartIdx(idx);
    if(window._gpxChart){
      window._gpxChart.data.datasets[1]={label:'Pos',data:samples.map((_,i)=>i===idx?samples[i].alt:null),borderColor:'#E5562A',backgroundColor:'#E5562A',pointRadius:samples.map((_,i)=>i===idx?6:0),pointBackgroundColor:'#E5562A',fill:false,tension:0,showLine:false};
      window._gpxChart.update('none');
    }
  },{passive:false});
  chartCtx.addEventListener('touchend',()=>{
    if(window._hoverMarker)window._hoverMarker.setStyle({opacity:0,fillOpacity:0});
    if(window._gpxChart){window._gpxChart.data.datasets[1]={label:'Pos',data:samples.map(()=>null),pointRadius:0};window._gpxChart.update('none');}
  });

  // Toujours stocker le GPX pour permettre la liaison ultérieure
  window._pendingGpxSave = points.filter((_,i)=>i%5===0).map(p=>({lat:p.lat,lon:p.lon,ele:p.ele}));

  // Auto-save to DB when in race event context — capture id/json before async to survive navigation
  if (currentRaceContext?.id) {
    const savedRaceId = currentRaceContext.id;
    const savedGpxJson = JSON.stringify(window._pendingGpxSave);
    sb.from('race_calendar')
      .update({gpx_data: savedGpxJson})
      .eq('id', savedRaceId)
      .then(({error}) => {
        if (!error) {
          const idx = races.findIndex(r=>r.id===savedRaceId);
          if(idx>=0) races[idx].gpx_data = savedGpxJson;
          if(currentRaceContext?.id===savedRaceId) currentRaceContext.gpx_data = savedGpxJson;
          const si = document.getElementById('raceMenuSaveGpx');
          if(si) si.style.display = 'none';
          showToast('GPX enregistré ✓', 'success');
        }
      });
  }
}

// ════════════ TERRAIN SURFACES via OSM Overpass ════════════
const SURFACE_MAP={
  rock:{fr:'Rochers',emoji:'🪨',risk:'high',col:'var(--red)'},
  rocks:{fr:'Rochers',emoji:'🪨',risk:'high',col:'var(--red)'},
  scree:{fr:'Éboulis',emoji:'⛰️',risk:'high',col:'var(--red)'},
  mud:{fr:'Boue',emoji:'💧',risk:'high',col:'var(--red)'},
  sand:{fr:'Sable',emoji:'🏖️',risk:'high',col:'var(--orange)'},
  gravel:{fr:'Gravier',emoji:'🪨',risk:'medium',col:'var(--orange)'},
  fine_gravel:{fr:'Gravier fin',emoji:'🪨',risk:'medium',col:'var(--yellow)'},
  pebblestone:{fr:'Cailloux',emoji:'🪨',risk:'medium',col:'var(--orange)'},
  dirt:{fr:'Terre',emoji:'🌿',risk:'medium',col:'var(--yellow)'},
  ground:{fr:'Sol naturel',emoji:'🌿',risk:'medium',col:'var(--yellow)'},
  grass:{fr:'Herbe',emoji:'🌿',risk:'medium',col:'var(--yellow)'},
  cobblestone:{fr:'Pavés',emoji:'🧱',risk:'medium',col:'var(--orange)'},
  compacted:{fr:'Compacté',emoji:'🔵',risk:'low',col:'var(--cyan)'},
  paved:{fr:'Bitume',emoji:'🛣️',risk:'none',col:'var(--text3)'},
  asphalt:{fr:'Bitume',emoji:'🛣️',risk:'none',col:'var(--text3)'},
  concrete:{fr:'Béton',emoji:'🛣️',risk:'none',col:'var(--text3)'},
  path:{fr:'Sentier',emoji:'🥾',risk:'medium',col:'var(--yellow)'},
  track:{fr:'Chemin',emoji:'🥾',risk:'low',col:'var(--cyan)'},
  footway:{fr:'Sentier',emoji:'🥾',risk:'medium',col:'var(--yellow)'},
  bridleway:{fr:'Piste',emoji:'🥾',risk:'medium',col:'var(--yellow)'},
};
function surfaceInfo(k){return SURFACE_MAP[k]||{fr:k,emoji:'🌍',risk:'medium',col:'var(--text2)'};}

function _ptSegDist(px,py,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
  if(!len) return Math.hypot(px-ax,py-ay);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len));
  return Math.hypot(px-ax-t*dx,py-ay-t*dy);
}

async function fetchTerrainSurfaces(points, sections) {
  try {
    const lats=points.map(p=>p.lat),lons=points.map(p=>p.lon);
    const S=Math.min(...lats).toFixed(5),N=Math.max(...lats).toFixed(5);
    const W=Math.min(...lons).toFixed(5),E=Math.max(...lons).toFixed(5);
    const q=`[out:json][timeout:25];(way(${S},${W},${N},${E})["surface"];way(${S},${W},${N},${E})["highway"~"^(path|track|footway|bridleway)$"];);out body geom;`;
    const ctrl=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(18000):undefined;
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q),signal:ctrl});
    if(!res.ok) return sections.map(()=>null);
    const {elements=[]}=await res.json();
    const ways=elements.filter(e=>e.geometry?.length>=2);

    const cumDist=[0];
    for(let i=1;i<points.length;i++) cumDist.push(cumDist[i-1]+hav(points[i-1],points[i]));

    return sections.map(s=>{
      const mid=((s.startKm+(s.endKm??s.km??s.startKm))/2)*1000;
      let ci=0,minD=Infinity;
      cumDist.forEach((d,i)=>{const dd=Math.abs(d-mid);if(dd<minD){minD=dd;ci=i;}});
      const pt=points[ci]; if(!pt) return null;
      let bestD=Infinity,bestSurf=null;
      for(const way of ways){
        const g=way.geometry;
        for(let i=0;i<g.length-1;i++){
          const d=_ptSegDist(pt.lat,pt.lon,g[i].lat,g[i].lon,g[i+1].lat,g[i+1].lon);
          if(d<bestD){bestD=d;bestSurf=way.tags?.surface||way.tags?.highway||null;}
        }
      }
      return bestD<0.0007?bestSurf:null;
    });
  } catch { return sections.map(()=>null); }
}

function slipRisk(surfKey, weather, grade=0) {
  if(!surfKey) return null;
  const info=SURFACE_MAP[surfKey]; if(!info||info.risk==='none') return null;
  // Normalise : weather peut venir du forecast (precip_prob+precip_recent) ou de l'archive (precip en mm)
  const prob  = weather?.precip_prob ?? (weather?.precip > 0 ? 70 : 0);
  const mm6h  = weather?.precip_recent ?? weather?.precip ?? 0;
  const wet   = prob > 20 || mm6h > 0.3;
  const vwet  = prob > 50 || mm6h > 2;
  const steep = Math.abs(grade) > 10;

  if(surfKey==='mud') return 'boue — très glissant';
  if(surfKey==='sand') return 'sable instable';

  // Herbe : glissante avec très peu de pluie (rosée suffit)
  if(surfKey==='grass') return wet?'glissant (herbe mouillée)':null;

  // Rochers / éboulis : technique sec, très glissant humide
  if(surfKey==='rock'||surfKey==='rocks'||surfKey==='scree')
    return wet?'très glissant (rochers humides)':'terrain rocheux technique';

  // Gravier/cailloux : instable en descente raide même sec (poussière + matériaux mobiles)
  if(surfKey==='gravel'||surfKey==='fine_gravel'||surfKey==='pebblestone'){
    if(vwet) return 'très glissant (graviers détrempés)';
    if(wet)  return 'glissant (graviers humides)';
    if(steep) return 'instable (graviers/poussière — descente raide)';
    return null;
  }

  // Terre / sol naturel : glissant dès les premières gouttes
  if(surfKey==='dirt'||surfKey==='ground')
    return wet?'glissant (terre détrempée)':null;

  // Pavés / cobblestone
  if(surfKey==='cobblestone') return wet?'glissant (pavés mouillés)':null;

  // Sentier générique
  if(info.risk==='high') return wet?'très glissant':'terrain technique';
  if(info.risk==='medium'&&vwet) return 'glissant (humide)';
  return null;
}

function buildDetailedSections(kmSecs){
  if(!kmSecs.length) return [];

  // Helper: get endKm from either field name (analyzeGPX uses 'km', comparison uses 'endKm')
  const endOf = s => s.km ?? s.endKm ?? s.startKm;

  // Build cumulative net altitude profile: cumAlt[i] = net gain from start to end of segment i
  const cumAlt = [0];
  for(const s of kmSecs) cumAlt.push(cumAlt[cumAlt.length-1] + s.dplus - (s.dminus||0));

  // No smoothing — use raw profile so short climbs are preserved
  const MIN_CHANGE = 12; // metres — minimum amplitude to create a section

  // Pass 1: collect all local extrema on raw cumAlt
  const extrema = [{idx:0, alt:cumAlt[0]}];
  for(let i=1;i<cumAlt.length-1;i++){
    const prev=cumAlt[i-1], cur=cumAlt[i], next=cumAlt[i+1];
    const isPeak = cur>=prev && cur>=next;
    const isVall = cur<=prev && cur<=next;
    if(isPeak||isVall){
      const last=extrema[extrema.length-1];
      if(Math.abs(cur-last.alt)>=MIN_CHANGE){
        extrema.push({idx:i, alt:cur});
      } else {
        // Extend in same direction (keep the more extreme value)
        const isGoingUp = cur > last.alt;
        if(isGoingUp && cur > last.alt) extrema[extrema.length-1] = {idx:i, alt:cur};
        else if(!isGoingUp && cur < last.alt) extrema[extrema.length-1] = {idx:i, alt:cur};
      }
    }
  }
  extrema.push({idx:cumAlt.length-1, alt:cumAlt[cumAlt.length-1]});

  // Pass 2: merge extrema that are too close in altitude (< MIN_CHANGE)
  const filtered=[extrema[0]];
  for(let i=1;i<extrema.length;i++){
    const last=filtered[filtered.length-1];
    const diff=extrema[i].alt-last.alt;
    if(Math.abs(diff)>=MIN_CHANGE){
      filtered.push(extrema[i]);
    } else {
      // Replace with whichever is more extreme relative to the point before last
      const prev2=filtered.length>=2?filtered[filtered.length-2]:null;
      if(!prev2){filtered[filtered.length-1]=extrema[i];}
      else if(extrema[i].alt>last.alt) filtered[filtered.length-1]={idx:extrema[i].idx,alt:Math.max(last.alt,extrema[i].alt)};
      else filtered[filtered.length-1]={idx:extrema[i].idx,alt:Math.min(last.alt,extrema[i].alt)};
    }
  }

  const out=[];
  for(let i=0;i<filtered.length-1;i++){
    const from=filtered[i], to=filtered[i+1];
    const fromIdx=Math.max(0,Math.min(from.idx,kmSecs.length-1));
    const toIdx=Math.max(0,Math.min(to.idx,kmSecs.length));
    const segs=kmSecs.slice(fromIdx,toIdx);
    if(!segs.length) continue;
    const dp=segs.reduce((a,s)=>a+s.dplus,0);
    const dm=segs.reduce((a,s)=>a+(s.dminus||0),0);
    const dist=segs.reduce((a,s)=>a+s.dist,0);
    const netAlt=to.alt-from.alt;
    const avgGrade=dist>0?netAlt/dist*100:0;
    const type=netAlt>=MIN_CHANGE?'up':netAlt<=-MIN_CHANGE?'down':'flat';
    const startKm=segs[0].startKm;
    const endKm=endOf(segs[segs.length-1]);
    out.push({type,startKm,endKm,dplus:Math.round(dp),dminus:Math.round(dm),dist,grade:+avgGrade.toFixed(1)});
  }

  // Merge consecutive flat sections
  const merged=[];
  for(const s of out){
    const last=merged[merged.length-1];
    if(last&&last.type==='flat'&&s.type==='flat'){
      last.endKm=s.endKm; last.dplus+=s.dplus; last.dminus+=s.dminus;
      last.dist+=s.dist; last.grade=last.dist>0?(last.dplus-last.dminus)/last.dist*100:0;
    } else merged.push({...s});
  }

  if(!merged.length){
    const dp=kmSecs.reduce((a,s)=>a+s.dplus,0);
    const dm=kmSecs.reduce((a,s)=>a+(s.dminus||0),0);
    const dist=kmSecs.reduce((a,s)=>a+s.dist,0);
    return [{type:'flat',startKm:kmSecs[0].startKm,endKm:endOf(kmSecs[kmSecs.length-1]),dplus:Math.round(dp),dminus:Math.round(dm),dist,grade:0}];
  }
  return merged;
}

function isTrailRace() {
  // Check currentRaceContext type or default to trail if GPX has significant D+
  if(currentRaceContext?.type) return ['Trail','TrailRun','trail'].includes(currentRaceContext.type);
  const pts = window._gpxPoints||[];
  if(!pts.length) return true;
  let dplus=0;
  for(let i=1;i<pts.length;i++){const d=pts[i].ele-pts[i-1].ele;if(d>0)dplus+=d;}
  const dist=(window._gpxDistKm||1);
  return dplus/dist > 20; // >20m D+/km = trail
}

// RPE Scale
const RPE_SCALE = [
  {rpe:1,label:'Très facile',desc:'Marche, échauffement — tu pourrais chanter'},
  {rpe:2,label:'Très facile',desc:'Footing très lent, conversation fluide sans effort'},
  {rpe:3,label:'Facile',desc:'Footing Z2, tu parles en phrases complètes, pourrait durer des heures'},
  {rpe:4,label:'Facile',desc:'Rythme confortable, phrases courtes aisées, respiration légèrement audible'},
  {rpe:5,label:'Modéré',desc:'Allure marathon, phrases courtes, respiration audible mais contrôlée'},
  {rpe:6,label:'Modéré-difficile',desc:'Allure semi, 2-3 mots entre respirations, rythme soutenu'},
  {rpe:7,label:'Difficile',desc:'Allure 10k/montée trail soutenue, 1-2 mots max, souffle court'},
  {rpe:8,label:'Très difficile',desc:'Limite à tenir, quasi impossible de parler, fort essoufflement'},
  {rpe:9,label:'Extrême',desc:'Sprint long, impossible de parler, insoutenable >2min'},
  {rpe:10,label:'Maximum',desc:'Effort total, insoutenable >30 secondes'},
];

function renderDetailedSection(s, secTimeS, idx=0){
  const trail = isTrailRace();
  const fcMax = userProfile.fc_max||205;
  const lthr = userProfile.lactate_threshold||Math.round(fcMax*.88);
  const z2top = userProfile.fc_z2_top || Math.round(fcMax*.70);
  const z3top = userProfile.fc_z3_top || Math.round(fcMax*.80);
  const z4top = lthr;

  const cols={up:'var(--vl-ember)',down:'var(--vl-amber)',flat:'var(--vl-growth)'};
  const icons={up:'↑',down:'↓',flat:'→'};
  const names={up:'Montée',down:'Descente',flat:'Plat / Liaison'};
  const distKm=(s.dist/1000).toFixed(2);
  const surfKey=window._gpxSectionSurfaces?.[idx]||null;
  const surf=surfKey?surfaceInfo(surfKey):null;
  const slip=surf?slipRisk(surfKey, window._gpxWeather, s.grade||0):null;
  let tags=[],advice='',rpeBadge='';

  if(s.type==='up'){
    const steep=Math.abs(s.grade)>10;
    const vam=s.dplus>0?Math.round(s.dplus/(secTimeS/3600)):0;

    if(trail){
      const rpe=steep?7:6;
      rpeBadge=`<span class="strat-tag" style="border-color:var(--vl-ember)40;color:var(--vl-ember);font-weight:700">RPE ${rpe}/10</span>`;
      tags=[
        {l:`${distKm} km`,c:'var(--vl-ember)'},
        {l:`+${s.dplus}m D+`,c:'var(--vl-ember)'},
        {l:`${Math.abs(s.grade).toFixed(1)}% pente`,c:'var(--vl-amber)'},
        {l:steep?'RPE 7 max — marche si > 8':'RPE 6-7 max',c:'var(--vl-text-2)'},
        {l:steep?'Marche active recommandée':'Courir régulier',c:'var(--vl-growth)'}
      ];
      if(surf) tags.push({l:`${surf.emoji} ${surf.fr}${slip?' · '+slip:''}`,c:surf.col});
      advice=steep
        ? `<strong>Montée raide (${Math.abs(s.grade).toFixed(1)}%)</strong> — passe en <strong>marche active</strong> dès que tu ne peux plus tenir une conversation (RPE 8+). La marche rapide est souvent plus efficace que courir en souffrant ici.<br><span class="mono t3" style="font-size:.6rem">FC indicative : si tu dépasses Z4 (≥${z4top} bpm) durablement, ralentis.</span>${vam>0?`<br>VAM requise ~${vam} m/h.`:''}`
        : `<strong>Montée modérée (${Math.abs(s.grade).toFixed(1)}%)</strong> — foulée courte et fréquente, appuis avant-pied, bras actifs. Vise RPE 6-7 : tu dois pouvoir dire 2-3 mots entre chaque respiration.<br><span class="mono t3" style="font-size:.6rem">FC indicative : Z4 (${z3top}-${z4top} bpm) acceptable, attention si ça dure.</span>${vam>0?`<br>VAM requise ~${vam} m/h.`:''}`;
    } else {
      // Route — basé sur FC structurée
      const fcCible=steep?Math.round(z4top*.96):Math.round(z4top*.92);
      tags=[
        {l:`${distKm} km`,c:'var(--vl-ember)'},
        {l:`+${s.dplus}m D+`,c:'var(--vl-ember)'},
        {l:`${Math.abs(s.grade).toFixed(1)}% pente`,c:'var(--vl-amber)'},
        {l:`FC < ${fcCible} bpm`,c:'var(--vl-text-2)'},
      ];
      advice=`<strong>Côte (${Math.abs(s.grade).toFixed(1)}%)</strong> — maintenir FC sous <strong>${fcCible} bpm</strong> (${steep?'96':'92'}% LTHR). Raccourcir la foulée, ne pas chercher à maintenir l'allure — la FC est ton gouverneur ici.`;
    }

  } else if(s.type==='down'){
    const technical=Math.abs(s.grade)>12;
    const highRiskTerrain=surf&&(surf.risk==='high'||surf.risk==='medium');
    if(trail){
      tags=[
        {l:`${distKm} km`,c:'var(--vl-amber)'},
        {l:`-${s.dminus}m D-`,c:'var(--vl-amber)'},
        {l:`${Math.abs(s.grade).toFixed(1)}% pente`,c:'var(--vl-text-2)'},
        {l:'RPE 3-4',c:'var(--vl-text-2)'},
        {l:'Récupération active',c:'var(--vl-growth)'}
      ];
      if(surf) tags.push({l:`${surf.emoji} ${surf.fr}${slip?' · '+slip:''}`,c:surf.col});
      const terrainNote=slip?`<br><span class="mono t3" style="font-size:.6rem;color:var(--vl-ember)">⚠️ Sol ${slip} — réduis l'amplitude, priorise la sécurité sur le chrono.</span>`
        :(surf&&surf.risk!=='none'?`<br><span class="mono t3" style="font-size:.6rem">Revêtement : ${surf.fr} — adapte l'amplitude à l'adhérence.</span>`:'');
      advice=(technical||highRiskTerrain)
        ? `<strong>Descente technique (${Math.abs(s.grade).toFixed(1)}%${surf?` · ${surf.fr}`:''})</strong> — foulées très courtes et rapides, regard 2-3m devant, léger penché avant. Ne jamais freiner avec les talons (impact 3-4× ton poids). RPE 4 max.${terrainNote}<br><span class="mono t3" style="font-size:.6rem">FC : elle va naturellement redescendre ici, profite-en.</span>`
        : `<strong>Descente douce (${Math.abs(s.grade).toFixed(1)}%)</strong> — foulées courtes et rapides, laisse la FC descendre sous Z3 (${z2top}-${z3top} bpm). C'est ta fenêtre de récupération. RPE 3-4.${terrainNote}`;
    } else {
      tags=[
        {l:`${distKm} km`,c:'var(--vl-amber)'},
        {l:`-${s.dminus}m D-`,c:'var(--vl-amber)'},
        {l:'Récupération',c:'var(--vl-growth)'},
      ];
      advice=`<strong>Descente</strong> — allure légèrement accélérée, contrôlée. FC qui redescend sous ${z3top} bpm. Profite pour récupérer avant la prochaine côte.`;
    }

  } else {
    if(trail){
      tags=[
        {l:`${distKm} km`,c:'var(--vl-growth)'},
        {l:'RPE 4-5',c:'var(--vl-growth)'},
        {l:'Récupération active',c:'var(--vl-text-2)'}
      ];
      if(surf) tags.push({l:`${surf.emoji} ${surf.fr}${slip?' · '+slip:''}`,c:surf.col});
      advice=`<strong>Section plate / liaison</strong> — laisse la FC redescendre, reprends la respiration. RPE 4-5 : tu dois pouvoir parler en phrases courtes. Si tu as un ravito, c'est ici qu'on mange et qu'on boit.`;
    } else {
      tags=[
        {l:`${distKm} km`,c:'var(--vl-growth)'},
        {l:`FC cible ${Math.round(z4top*.9)}-${Math.round(z4top*.95)} bpm`,c:'var(--vl-growth)'},
      ];
      advice=`<strong>Section plate</strong> — allure cible, FC maintenue entre ${Math.round(z4top*.9)} et ${Math.round(z4top*.95)} bpm (90-95% LTHR). C'est ton allure de croisière sur route.`;
    }
  }

  return `<div class="vl-section-card" style="border-left-color:${cols[s.type]}" onclick="highlightSection(${idx})" data-idx="${idx}">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.3rem">
      <div class="strat-km">km ${s.startKm.toFixed(1)} → ${s.endKm.toFixed(1)}</div>
      <div class="mono t2" style="font-size:.6rem">${fmtT(secTimeS)} estimé</div>
    </div>
    <div class="strat-name" style="color:${cols[s.type]}">${icons[s.type]} ${names[s.type]}</div>
    <div class="strat-tags">${tags.map(t=>`<span class="strat-tag" style="border-color:${t.c}40;color:${t.c}">${t.l}</span>`).join('')}</div>
    <div class="strat-body">${advice}</div>
  </div>`;
}

function buildSplitsTable(kmSecs, basePaceS){
  const fcMax=userProfile.fc_max||205;
  const pct88=Math.round(fcMax*.88),pct84=Math.round(fcMax*.84),pct79=Math.round(fcMax*.79);
  let cumTime=0,rows='';
  kmSecs.filter(s=>s!=null&&s.km!=null&&s.grade!=null).forEach(s=>{
    const distKm=(s.dist||0)/1000;
    const secTime=basePaceS*(1+minettiGradePenalty(s.grade/100))*distKm;
    cumTime+=secTime;
    const type=s.grade>4?'up':s.grade<-4?'down':'flat';
    const fc={up:`< ${Math.abs(s.grade)>10?pct84:pct88} bpm`,down:'Libre',flat:`< ${pct79} bpm`}[type];
    const conseil={up:Math.abs(s.grade)>10?'Marche active':'Courir régulier',down:'Foulées courtes',flat:'Récup'}[type];
    rows+=`<tr class="section-${type}"><td class="mono">${(s.startKm??0).toFixed(1)}→${s.km.toFixed(1)}</td><td>${{up:'⛰️',down:'🎿',flat:'➡️'}[type]}</td><td class="mono" style="color:${{up:'var(--orange)',down:'var(--purple)',flat:'var(--cyan)'}[type]}">${s.grade>0?'+':''}${s.grade.toFixed(1)}%</td><td class="mono ${s.dplus>0?'to':''}">${s.dplus>0?`+${s.dplus}m`:'—'}</td><td class="mono ${s.dminus>0?'tp':''}">${s.dminus>0?`-${s.dminus}m`:'—'}</td><td class="mono t2">${s.altEnd||'—'}m</td><td class="mono">${fmtT(secTime)}</td><td class="mono tc">${fmtT(cumTime)}</td><td style="font-size:.68rem;color:var(--text2)">${conseil} · FC ${fc}</td></tr>`;
  });
  return rows;
}

// ── BDD PRODUITS NUTRITION ──
const NUTRITION_DB = {
  gels:[
    {id:'naak-ultra',brand:'Näak',name:'Ultra Energy Gel',carbs:27,caffeine:35,water:false,note:'Semi-liquide, sans eau requis'},
    {id:'naak-boost25',brand:'Näak',name:'Boost Gel 25',carbs:25,caffeine:0,water:false,note:'Sans eau requis'},
    {id:'naak-boost30',brand:'Näak',name:'Boost Gel 30',carbs:30,caffeine:0,water:false,note:'Sans eau requis'},
    {id:'naak-boost-caf',brand:'Näak',name:'Boost Gel Thé Pêche (caféine)',carbs:30,caffeine:100,water:false,note:'Sans eau, 100mg caféine'},
    {id:'ta-gel',brand:'TA Energy',name:'Énergie Gel',carbs:33,caffeine:0,water:true,note:'Avec eau obligatoire'},
    {id:'ta-gel-caf',brand:'TA Energy',name:'Énergie Gel Caféiné',carbs:33,caffeine:50,water:true,note:'Avec eau, 50mg caféine'},
    {id:'ta-gommes',brand:'TA Energy',name:'Gommes Énergie',carbs:24,caffeine:0,water:true,note:'3 gommes/sachet, avec eau'},
    {id:'ta-gommes-caf',brand:'TA Energy',name:'Gommes Énergie Caféinées',carbs:24,caffeine:50,water:true,note:'50mg caféine, avec eau'},
    {id:'maurten-100',brand:'Maurten',name:'Gel 100',carbs:25,caffeine:0,water:false,note:'Hydrogel, sans eau'},
    {id:'maurten-100-caf',brand:'Maurten',name:'Gel 100 Caf 100',carbs:25,caffeine:100,water:false,note:'Hydrogel, 100mg caféine'},
    {id:'maurten-160',brand:'Maurten',name:'Gel 160',carbs:40,caffeine:0,water:false,note:'Hydrogel haute énergie, sans eau'},
    {id:'deca-gel',brand:'Decathlon',name:'Energy Gel (<3h)',carbs:30,caffeine:0,water:true,note:'Avec eau obligatoire'},
    {id:'deca-gel-caf',brand:'Decathlon',name:'Energy Gel+ Caféiné',carbs:22,caffeine:20,water:true,note:'Avec eau, 20mg caféine'},
    {id:'nduranz-gel',brand:'Nduranz',name:'Nrgy Unit Gel',carbs:45,caffeine:0,water:false,note:'Isotonique, sans eau — très haute énergie'},
    {id:'baouw-gel',brand:'Baouw',name:'Gel Extra',carbs:30,caffeine:0,water:true,note:'Bio, avec eau'},
  ],
  barres:[
    {id:'naak-bar',brand:'Näak',name:'Ultra Energy Bar',carbs:29,caffeine:0,water:false,note:'50g, protéines végétales'},
    {id:'naak-bar-caf',brand:'Näak',name:'Ultra Energy Bar Caféine',carbs:27,caffeine:35,water:false,note:'50g, 35mg caféine'},
    {id:'ta-barre',brand:'TA Energy',name:'Barre Bio',carbs:20,caffeine:0,water:false,note:'38g, texture moelleuse'},
    {id:'nutripure-gel',brand:'Nutripure',name:'Gel Long Distance',carbs:30,caffeine:0,water:true,note:'SolidCarbs™, glucose+fructose — avec eau'},
    {id:'nutripure-barre-ld',brand:'Nutripure',name:'Barre Long Distance',carbs:30,caffeine:0,water:false,note:'42g, moelleuse, BCAA + vitamines'},
    {id:'nutripure-raw',brand:'Nutripure',name:'Raw Barre Bio',carbs:15,caffeine:0,water:false,note:'15g glucides + 8g protéines — avant effort ou ultra long'},
  ],
  boissons:[
    {id:'maurten-160d',brand:'Maurten',name:'Drink Mix 160',carbs:40,per:'500ml',water:true,note:'À diluer'},
    {id:'maurten-320d',brand:'Maurten',name:'Drink Mix 320',carbs:80,per:'500ml',water:true,note:'Haute énergie, à diluer'},
    {id:'deca-iso',brand:'Decathlon',name:'ISO (poudre)',carbs:33,per:'500ml',water:true,note:'À diluer'},
    {id:'deca-iso-plus',brand:'Decathlon',name:'ISO+ (poudre)',carbs:33,per:'500ml',water:true,note:'À diluer'},
    {id:'deca-iso-rtd',brand:'Decathlon',name:'ISO prête à boire',carbs:27,per:'500ml',water:false,note:'Prête à l\'emploi'},
    {id:'nutripure-drink',brand:'Nutripure',name:'Boisson Long Distance 30g',carbs:30,per:'400ml',water:true,note:'PureDigest™, BCAA + vitamines'},
    {id:'nutripure-drink60',brand:'Nutripure',name:'Boisson Expert Long Distance 60g',carbs:60,per:'500ml',water:true,note:'Version haute énergie — athlètes expérimentés'},
    {id:'nduranz-drink90',brand:'Nduranz',name:'Nrgy Drink 90',carbs:90,per:'500ml',water:true,note:'Haute énergie ultra distance'},
  ]
};

function getUserGels(){
  const sel = userProfile.nutrition_products||[];
  const gels = NUTRITION_DB.gels.filter(g=>sel.includes(g.id));
  const barres = NUTRITION_DB.barres.filter(b=>sel.includes(b.id));
  return [...gels,...barres];
}
function getUserBoissons(){
  const sel = userProfile.nutrition_products||[];
  return NUTRITION_DB.boissons.filter(b=>sel.includes(b.id));
}

function genNutrition(distM, estTimeS){
  const dh = estTimeS/3600;
  const dk = distM/1000;
  const userGels = getUserGels();
  const userBoissons = getUserBoissons();
  const hasProducts = userGels.length>0 || userBoissons.length>0;
  const rows = [];

  // No pre-race food — chacun fait ce qui marche pour lui

  if(dh < 1.5){
    // < 1h30 : hydratation simple selon température
    rows.push(`<tr style="background:rgba(46,204,113,.05)"><td class="mono">Pendant</td><td><strong>Eau selon la soif</strong>${dh>0.75?' + électrolytes si >25°C':''}</td><td>0g glucides</td><td>< 1h30 : réserves glycogéniques suffisantes. Électrolytes si forte chaleur uniquement · Burke et al., 2011</td></tr>`);
    if(userBoissons.length){
      const b=userBoissons[0];
      rows.push(`<tr><td class="mono">Option chaleur</td><td>${b.brand} ${b.name} dilué ×2</td><td>~${Math.round(b.carbs/2)}g</td><td>Si T° > 25°C uniquement. Diluer pour réduire l'apport sucré.</td></tr>`);
    }
  } else {
    // ≥ 1h30 : protocole complet
    const targetCarbsPerH = dh < 2.5 ? 40 : 60;

    // Premier ravitaillement ~30-35min
    const t1km = Math.round(dk*0.30);
    if(hasProducts && userGels.length){
      const gel1 = userGels.find(g=>g.caffeine===0) || userGels[0];
      rows.push(`<tr><td class="mono">~${t1km} km<br><span style="font-size:.55rem;opacity:.7">${Math.round(t1km/dk*estTimeS/60)}min</span></td><td><strong>${gel1.brand} ${gel1.name}</strong>${gel1.water?' <span style="color:var(--cyan)">+ eau obligatoire</span>':''}</td><td>${gel1.carbs}g</td><td>Premier apport glucidique après 30min. Sans caféine — adrénaline déjà élevée au départ.</td></tr>`);
    } else {
      rows.push(`<tr><td class="mono">~${t1km} km</td><td>Gel sans caféine + eau</td><td>25-30g</td><td>Premier apport après 30min · Jeukendrup, 2004</td></tr>`);
    }

    // Boisson si disponible
    if(userBoissons.length && dh >= 1.75){
      const b=userBoissons[0];
      const t2km=Math.round(dk*0.50);
      rows.push(`<tr><td class="mono">~${t2km} km<br><span style="font-size:.55rem;opacity:.7">${Math.round(t2km/dk*estTimeS/60)}min</span></td><td><strong>${b.brand} ${b.name}</strong> 200ml</td><td>${Math.round(b.carbs*0.4)}g</td><td>Hydratation + glucides. ${b.water?'Dilué dans eau froide.':'Prêt à boire.'}</td></tr>`);
    }

    // Deuxième gel — caféiné si dispo, après 60-70% de la course
    const t3km = Math.round(dk*0.65);
    if(hasProducts && userGels.length){
      const gelCaf = userGels.find(g=>g.caffeine>0);
      const gel2 = gelCaf || (userGels.find(g=>g.caffeine===0) || userGels[0]);
      rows.push(`<tr><td class="mono">~${t3km} km<br><span style="font-size:.55rem;opacity:.7">${Math.round(t3km/dk*estTimeS/60)}min</span></td><td><strong>${gel2.brand} ${gel2.name}</strong>${gel2.water?' <span style="color:var(--cyan)">+ eau obligatoire</span>':''} ${gelCaf?'<span style="color:var(--yellow)">☕ Caféine</span>':''}</td><td>${gel2.carbs}g</td><td>${gelCaf?`${gel2.caffeine}mg caféine — pic d'effet 30-45min après. Timing idéal pour la dernière ligne droite ou montée finale.`:'Maintien glycémie sur derniers km.'}</td></tr>`);
    } else {
      rows.push(`<tr><td class="mono">~${t3km} km</td><td>Gel <strong>caféiné</strong> + eau</td><td>25-30g</td><td>Caféine : pic 30-45min après prise — timing pour fin de course.</td></tr>`);
    }

    // Ultra > 2h30
    if(dh >= 2.5){
      const t4km=Math.round(dk*0.80);
      if(userGels.find(g=>g.id.includes('barre')||g.note?.includes('Bar'))){
        const bar=userGels.find(g=>g.note?.includes('Bar')||g.id.includes('bar')||g.id.includes('barre'));
        rows.push(`<tr><td class="mono">~${t4km} km</td><td><strong>${bar.brand} ${bar.name}</strong> (solide)</td><td>${bar.carbs}g</td><td>Après 2h+ : le solide est mieux toléré que les gels en continu. Mâcher = stimulation cognitive (Ebersole et al.).</td></tr>`);
      } else {
        rows.push(`<tr><td class="mono">~${t4km} km</td><td>Solide (barre, datte, banane) + eau</td><td>25-35g</td><td>Après 2h+ : diversifier les sources. Le solide est mieux toléré. Mâcher aide cognitivement.</td></tr>`);
      }
    }

    // Conseil eau général
    if(userGels.filter(g=>g.water).length > 0){
      rows.push(`<tr style="background:rgba(0,212,255,.04)"><td class="mono t2" colspan="4">💧 <strong>Rappel eau :</strong> tes gels nécessitent de l'eau. Toujours 150-200ml d'eau avec chaque prise. Ne jamais prendre gel + boisson sucrée en même temps.</td></tr>`);
    }
  }

  // Post-course
  rows.push(`<tr style="background:rgba(46,204,113,.05)"><td class="mono tg">Post &lt;30min</td><td>Protéines + glucides rapides</td><td>60g + 20g prot</td><td>Fenêtre anabolique · resynthèse glycogène max · Ivy, 1998</td></tr>`);

  return rows.join('');
}

let sectionMapInst = null;
let sectionAltiChartInst = null;

function highlightSection(idx) {
  window._activeSection = idx;
  document.querySelectorAll('.vl-section-card').forEach((el,i)=>{
    el.classList.toggle('active',i===idx);
  });
  // Open popup
  openSectionPopup(idx);
}

function openSectionPopup(idx) {
  const sections = window._gpxSections||[];
  const points = window._gpxPoints||[];
  const samples = window._gpxSamples||[];
  const distKm = window._gpxDistKm||1;
  if(!sections[idx]) return;

  const s = sections[idx];
  const total = sections.length;
  const fcMax = userProfile.fc_max||205;
  const pct88=Math.round(fcMax*.88),pct84=Math.round(fcMax*.84),pct79=Math.round(fcMax*.79);
  const cols={up:'var(--vl-ember)',down:'var(--vl-amber)',flat:'var(--vl-growth)'};
  const icons={up:'↑',down:'↓',flat:'→'};
  const names={up:'Montée',down:'Descente',flat:'Plat'};
  const distKmSec=(s.dist/1000).toFixed(2);

  // Title + counter
  document.getElementById('sectionPopupTitle').innerHTML=`<span style="color:${cols[s.type]}">${icons[s.type]} ${names[s.type]}</span> · km ${s.startKm.toFixed(1)}→${s.endKm.toFixed(1)}`;
  document.getElementById('sectionPopupCounter').textContent=`Section ${idx+1} / ${total}`;

  // Nav buttons
  document.getElementById('btnPrevSection').disabled = idx===0;
  document.getElementById('btnNextSection').disabled = idx===total-1;

  // Stats
  const statData = [
    {v:`${distKmSec} km`,l:'Distance'},
    s.type==='up'?{v:`+${s.dplus}m`,l:'D+',c:'var(--vl-ember)'}:null,
    s.type==='down'?{v:`-${s.dminus}m`,l:'D-',c:'var(--vl-amber)'}:null,
    {v:`${s.grade>0?'+':''}${s.grade.toFixed(1)}%`,l:'Pente moy',c:s.type==='up'?'var(--vl-ember)':s.type==='down'?'var(--vl-amber)':'var(--vl-growth)'},
    {v:`FC ${s.type==='up'?(Math.abs(s.grade)>10?`<${pct84}`:`<${pct88}`):s.type==='down'?'Libre':`<${pct79}`} bpm`,l:'FC cible'},
  ].filter(Boolean);
  document.getElementById('sectionPopupStats').innerHTML=statData.map(d=>`<div class="s-stat"><div class="s-sv" style="${d.c?`color:${d.c}`:''}">${d.v}</div><div class="s-sl">${d.l}</div></div>`).join('');

  // Advice
  const trail = isTrailRace();
  const lthr = userProfile.lactate_threshold || Math.round(fcMax*.88);
  const z3top = Math.round(fcMax*.80);
  const z4top = lthr;
  let advice='';
  if(s.type==='up'){
    const steep=Math.abs(s.grade)>10;
    if(trail){
      advice=steep
        ? `<strong>Montée raide (${Math.abs(s.grade).toFixed(1)}%)</strong> — RPE 7 max. Marche active si tu ne peux plus parler (RPE 8+). Cadence courte, appuis avant-pied, bras actifs.<br><span class="mono t3" style="font-size:.6rem">FC indicative : si tu dépasses Z4 (≥${z4top} bpm) durablement → ralentis.</span>`
        : `<strong>Montée modérée (${Math.abs(s.grade).toFixed(1)}%)</strong> — RPE 6-7. Tu dois pouvoir dire 2-3 mots entre chaque respiration.<br><span class="mono t3" style="font-size:.6rem">FC indicative : Z3-Z4 (${z3top}-${z4top} bpm) acceptable.</span>`;
    } else {
      const fcCible = steep ? Math.round(z4top*.96) : Math.round(z4top*.92);
      advice=`<strong>Côte (${Math.abs(s.grade).toFixed(1)}%)</strong> — maintenir FC sous <strong>${fcCible} bpm</strong> (${steep?'96':'92'}% LTHR). Raccourcir la foulée, ne pas chercher à maintenir l'allure.`;
    }
  } else if(s.type==='down'){
    const technical=Math.abs(s.grade)>12;
    if(trail){
      advice=technical
        ? `<strong>Descente technique (${Math.abs(s.grade).toFixed(1)}%)</strong> — RPE 4. Foulées très courtes, regard 2-3m devant. Ne pas freiner avec les talons. FC redescend naturellement.`
        : `<strong>Descente douce (${Math.abs(s.grade).toFixed(1)}%)</strong> — RPE 3-4. Foulées courtes rapides. Laisse la FC redescendre sous Z3 (${z3top} bpm).`;
    } else {
      advice=`<strong>Descente</strong> — allure légèrement accélérée. FC qui redescend sous ${z3top} bpm. Récupère avant la prochaine côte.`;
    }
  } else {
    if(trail){
      advice=`<strong>Liaison plate</strong> — RPE 4-5. Laisse la FC redescendre, reprends la respiration. Tu dois pouvoir parler en phrases courtes. Ravitaille ici si besoin.`;
    } else {
      advice=`<strong>Plat</strong> — allure cible, FC entre ${Math.round(z4top*.90)} et ${Math.round(z4top*.95)} bpm (90-95% LTHR).`;
    }
  }
  document.getElementById('sectionPopupAdvice').innerHTML=`<div class="clabel">Conseils</div><div style="font-size:.82rem;line-height:1.6;color:var(--text2)">${advice}</div>`;

  // Open overlay
  document.getElementById('sectionPopup').classList.add('open');
  document.body.style.overflow='hidden';

  // Section points for map
  const si=Math.round((s.startKm/distKm)*points.length);
  const ei=Math.min(Math.round((s.endKm/distKm)*points.length),points.length-1);
  const segPts=points.slice(si,ei+1);

  // Mini map
  setTimeout(()=>{
    if(sectionMapInst){sectionMapInst.remove();sectionMapInst=null;}
    sectionMapInst=L.map('sectionMap',{zoomControl:false,scrollWheelZoom:false,dragging:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(sectionMapInst);
    const col={up:'#E5562A',down:'#E8A23A',flat:'#10B981'}[s.type];
    const ll=segPts.filter((_,i)=>i%3===0).map(p=>[p.lat,p.lon]);
    const poly=L.polyline(ll,{color:col,weight:5,opacity:1}).addTo(sectionMapInst);
    L.circleMarker([segPts[0].lat,segPts[0].lon],{radius:8,fillColor:'#10B981',color:'#0E0D0A',weight:2,fillOpacity:1}).addTo(sectionMapInst);
    L.circleMarker([segPts[segPts.length-1].lat,segPts[segPts.length-1].lon],{radius:8,fillColor:'#F3EFE4',color:'#0E0D0A',weight:2,fillOpacity:1}).addTo(sectionMapInst);
    sectionMapInst.fitBounds(poly.getBounds(),{padding:[20,20]});
  },100);

  // Mini alti chart — section only
  if(sectionAltiChartInst){sectionAltiChartInst.destroy();sectionAltiChartInst=null;}
  const secSamples=samples.filter(s2=>s2.d>=s.startKm&&s2.d<=s.endKm+0.1);
  if(secSamples.length>1){
    const col={up:'#E5562A',down:'#E8A23A',flat:'#10B981'}[s.type];
    sectionAltiChartInst=new Chart(document.getElementById('sectionAltiChart'),{
      type:'line',
      data:{labels:secSamples.map(s=>s.d.toFixed(1)),datasets:[{data:secSamples.map(s=>s.alt),borderColor:col,backgroundColor:col+'28',fill:true,tension:.4,pointRadius:0,borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:i=>`km ${i[0].label}`,label:c=>`${Math.round(c.parsed.y)}m`}}},scales:{x:{ticks:{font:{size:8},maxTicksLimit:6,callback:(v,i)=>secSamples[i]?.d+'km'},grid:{display:false}},y:{ticks:{font:{size:8},callback:v=>v+'m'},grid:{color:'rgba(243,239,228,.04)'}}}}
    });
  }
}

function navigateSection(dir) {
  const sections=window._gpxSections||[];
  const next=window._activeSection+dir;
  if(next>=0&&next<sections.length){
    window._activeSection=next;
    document.querySelectorAll('.vl-section-card').forEach((el,i)=>el.classList.toggle('active',i===next));
    openSectionPopup(next);
  }
}

function closeSectionPopup() {
  document.getElementById('sectionPopup').classList.remove('open');
  document.body.style.overflow='';
  if(sectionMapInst){sectionMapInst.remove();sectionMapInst=null;}
  if(sectionAltiChartInst){sectionAltiChartInst.destroy();sectionAltiChartInst=null;}
  window._activeSection=-1;
  document.querySelectorAll('.vl-section-card').forEach(el=>el.classList.remove('active'));
}

function resetStrategy(){
  document.getElementById('stratResult').style.display='none';
  document.getElementById('stratResult').innerHTML='';
  const drop=document.getElementById('gpxDrop');
  drop.style.display='block';
  drop.onclick=()=>document.getElementById('gpxFile').click();
  drop.innerHTML=`<div style="font-size:2.5rem;margin-bottom:.75rem">🗺️</div><div style="font-family:var(--display);font-size:1.4rem;letter-spacing:.03em;margin-bottom:.4rem">Déposer le fichier GPX</div><div class="mono">Compatible OpenRunner · Strava · Garmin Connect</div>`;
  document.getElementById('gpxFile').value='';
  currentRaceContext=null;
  window._activeSection=-1;
  window._sectionPolylines=[];
  window._pendingGpxSave=null;
  if(leafletMap){leafletMap.remove();leafletMap=null;}
  if(window._gpxChart){window._gpxChart.destroy();window._gpxChart=null;}
}

function linkGpxToRaceById(raceId) {
  if(!raceId) return;
  const race = races.find(r=>String(r.id)===String(raceId));
  if(!race) return;
  currentRaceContext = race;
  saveGpxToRace();
}

function populateRaceSelector(){
  const container=document.getElementById('raceSelectorList');
  // raceSelector block is hidden in event view (the analyzeGPX output handles association)
  const sel=document.getElementById('raceSelector');
  if(!container||!sel) return;
  if(!races.length){sel.style.display='none';return;}
  // Only show if not in event view
  if(document.getElementById('eventView')?.style.display!=='none') return;
  sel.style.display='block';
  container.innerHTML=races.filter(r=>new Date(r.date)>=new Date()).map(r=>`<button class="race-sel-btn" onclick="selectRaceForStrategy(${JSON.stringify(r).replace(/"/g,'&quot;')})">${escapeHTML(r.name)} · ${new Date(r.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}</button>`).join('');
}

function selectRaceForStrategy(race){
  document.querySelectorAll('.race-sel-btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  currentRaceContext=race;
  if(race.gpx_data){const pts=JSON.parse(race.gpx_data);analyzeGPX(pts,race.name);}
  else document.getElementById('gpxFile').click();
}


// ════════════════════════════════════════════════════
// PROFIL OVERLAY
// ════════════════════════════════════════════════════
let _nutrActiveBrandGel = null;
let _nutrActiveBrandDrink = null;

function renderNutritionProducts() {
  const sel = userProfile.nutrition_products||[];
  const allGels = [...NUTRITION_DB.gels, ...NUTRITION_DB.barres];
  const allDrinks = NUTRITION_DB.boissons;

  const gelBrands = [...new Set(allGels.map(p=>p.brand))];
  const drinkBrands = [...new Set(allDrinks.map(p=>p.brand))];

  // Init active brand if not set
  if(!_nutrActiveBrandGel) _nutrActiveBrandGel = gelBrands[0];
  if(!_nutrActiveBrandDrink) _nutrActiveBrandDrink = drinkBrands[0];

  const mkBrandBtn = (brand, active, onclick) =>
    `<button onclick="${onclick}" style="padding:5px 12px;border-radius:20px;border:1px solid ${active?'var(--cyan)':'var(--border2)'};background:${active?'rgba(0,212,255,.12)':'var(--bg4)'};color:${active?'var(--cyan)':'var(--text2)'};font-family:var(--mono);font-size:.6rem;cursor:pointer;transition:all .2s">${brand}</button>`;

  const mkCard = (p) => {
    const checked = sel.includes(p.id);
    return `<label style="display:flex;align-items:flex-start;gap:10px;background:var(--bg4);border:1px solid ${checked?'var(--cyan)':'var(--border)'};border-radius:9px;padding:10px 12px;cursor:pointer;transition:border-color .2s">
      <input type="checkbox" data-nutr="${p.id}" ${checked?'checked':''} style="margin-top:2px;accent-color:var(--cyan)" onchange="this.closest('label').style.borderColor=this.checked?'var(--cyan)':'var(--border)'">
      <div>
        <div style="font-size:.78rem;font-weight:600">${p.name}</div>
        <div class="mono t2" style="font-size:.58rem">${p.carbs}g glucides${p.caffeine?` · ☕ ${p.caffeine}mg caféine`:''}</div>
        <div class="mono t3" style="font-size:.55rem">${p.note||''}</div>
      </div>
    </label>`;
  };

  // Gel brands
  const gelBrandEl = document.getElementById('nutrGelBrands');
  if(gelBrandEl) gelBrandEl.innerHTML = gelBrands.map(b=>mkBrandBtn(b,b===_nutrActiveBrandGel,`filterNutrBrand('gel','${b}')`)).join('');

  // Gel products filtered
  const gelListEl = document.getElementById('nutrGelList');
  if(gelListEl) gelListEl.innerHTML = allGels.filter(p=>p.brand===_nutrActiveBrandGel).map(mkCard).join('');

  // Drink brands
  const drinkBrandEl = document.getElementById('nutrDrinkBrands');
  if(drinkBrandEl) drinkBrandEl.innerHTML = drinkBrands.map(b=>mkBrandBtn(b,b===_nutrActiveBrandDrink,`filterNutrBrand('drink','${b}')`)).join('');

  // Drink products filtered
  const drinkListEl = document.getElementById('nutrDrinkList');
  if(drinkListEl) drinkListEl.innerHTML = allDrinks.filter(p=>p.brand===_nutrActiveBrandDrink).map(mkCard).join('');
}

function filterNutrBrand(type, brand) {
  // Save current checked state before re-rendering
  const checked = [...document.querySelectorAll('input[data-nutr]:checked')].map(i=>i.dataset.nutr);
  userProfile.nutrition_products = [...new Set([...(userProfile.nutrition_products||[]),...checked])];
  if(type==='gel') _nutrActiveBrandGel = brand;
  else _nutrActiveBrandDrink = brand;
  renderNutritionProducts();
}

async function saveNutritionProducts() {
  const checked = [...document.querySelectorAll('input[data-nutr]:checked')].map(i=>i.dataset.nutr);
  userProfile.nutrition_products = checked;
  const msg = document.getElementById('nutrSaveMsg');
  const {error} = await sb.from('profiles').upsert({id:currentUser.id, nutrition_products: checked});
  if(error){msg.textContent='❌ Erreur';msg.style.color='var(--red)';}
  else{msg.textContent=`✓ ${checked.length} produit(s) sauvegardé(s)`;msg.style.color='var(--green)';setTimeout(()=>msg.textContent='',3000);}
}

function openProfil() {
  document.getElementById('profilOverlay').classList.add('open');
  document.body.style.overflow='hidden';
  if(currentUser?.email) document.getElementById('p-email').value=currentUser.email;
  const preview=document.getElementById('avatarPreview');
  if(preview && !preview.querySelector('img')) {
    const name=(userProfile?.name||'').trim();
    const parts=name.split(/\s+/).filter(Boolean);
    const initials=parts.length>=2?(parts[0][0]+parts[parts.length-1][0]).toUpperCase():parts[0]?parts[0].slice(0,2).toUpperCase():'AB';
    preview.textContent=initials;
  }
  renderNutritionProducts();
}
function closeProfil() {
  document.getElementById('profilOverlay').classList.remove('open');
  document.body.style.overflow='';
}
async function changePassword() {
  const msg=document.getElementById('pwMsg');
  msg.textContent='Envoi...';msg.style.color='var(--text2)';
  const {error}=await sb.auth.resetPasswordForEmail(currentUser.email,{redirectTo:REDIRECT_URI});
  if(error){msg.textContent='❌ '+error.message;msg.style.color='var(--red)';}
  else{msg.textContent='✓ Email envoyé !';msg.style.color='var(--green)';}
}
let _cropState = {x:0,y:0,scale:1,startX:0,startY:0,startDist:0,dragging:false};

async function uploadAvatar(event) {
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

function closeCropModal() {
  document.getElementById('cropModal').style.display = 'none';
}

async function confirmCrop() {
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
    const path = `${currentUser.id}/avatar.jpg`;
    const {error} = await sb.storage.from('avatars').upload(path, blob, {upsert:true, contentType:'image/jpeg'});
    if(error){ showToast('Erreur : '+error.message, 'error'); return; }
    const {data} = sb.storage.from('avatars').getPublicUrl(path);
    const url = data.publicUrl + '?t=' + Date.now();
    await sb.from('profiles').upsert({id:currentUser.id, avatar_url:url});
    userProfile.avatar_url = url;
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
function showToast(msg, type='info', duration=4000) {
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
  if(!userProfile.name && !userProfile.fc_max) {
    openOnboarding();
  }
}

function openOnboarding() {
  onbStep = 0;
  updateOnbStep();
  document.getElementById('onboardingOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOnboarding() {
  document.getElementById('onboardingOverlay').classList.remove('open');
  document.body.style.overflow = '';
  localStorage.setItem('onb_done', '1');
}

function onbNav(dir) {
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
function openCGU() {
  document.getElementById('cguOverlay').classList.add('open');
}
function closeCGU() {
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
