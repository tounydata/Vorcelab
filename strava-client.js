import { VLState, sb, SUPA_URL, CLIENT_ID } from './app-state.js';
import { isRun } from './formatters.js';
import { showToast, showOnboarding } from './ui.js';
import { renderDashboard } from './dashboard.js';
import { autoCalibrate } from './activity-analysis.js';

const REDIRECT_URI = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}/`;

function mapDbActivity(row) {
  const raw = row.raw_data || {};
  const rawType = row.type || 'Run';
  const sportType = row.sport_type || '';
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

export async function loadActivities() {
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

function setStravaConnected(name) {
  VLState.stravaConnected = true;
  document.getElementById('statusDot').className = 'dot dot-on';
  document.getElementById('statusText').textContent = name || 'Connecté';
  document.getElementById('btnStrava').style.display = 'none';
  const s = document.getElementById('btnSync'); if (s) s.style.display = 'inline-flex';
  const dotM = document.getElementById('statusDotMobile'); if (dotM) dotM.className = 'dot dot-on';
  const sm = document.getElementById('btnSyncMobile'); if (sm) sm.style.display = 'inline-flex';
  const bsm = document.getElementById('btnStravaMobile'); if (bsm) bsm.style.display = 'none';
}

async function exchangeCode(code, scope) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const r = await fetch(`${SUPA_URL}/functions/v1/strava-oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ code, scope }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({ error: 'Exchange failed' })); throw new Error(e.error || 'OAuth exchange failed'); }
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

export async function checkStravaToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const scope = urlParams.get('scope') || '';
  const returnedState = urlParams.get('state');

  if (code) {
    window.history.replaceState({}, '', window.location.pathname);
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
    } catch (e) {
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

export async function disconnectStrava() {
  const ok = confirm('Déconnecter Strava de ce compte Vorcelab ? Les futures synchronisations seront arrêtées.');
  if (!ok) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) { showToast('Session expirée. Reconnecte-toi.', 'error'); return; }
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-disconnect`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) throw new Error('Erreur déconnexion Strava');
    VLState.allActivities = []; VLState.stravaConnected = false;
    document.getElementById('statusDot').className = 'dot dot-off';
    document.getElementById('statusText').textContent = 'Strava';
    document.getElementById('btnStrava').style.display = 'flex';
    const syncBtn = document.getElementById('btnSync'); if (syncBtn) syncBtn.style.display = 'none';
    const dotM = document.getElementById('statusDotMobile'); if (dotM) dotM.className = 'dot dot-off';
    const syncM = document.getElementById('btnSyncMobile'); if (syncM) syncM.style.display = 'none';
    const stravaM = document.getElementById('btnStravaMobile'); if (stravaM) stravaM.style.display = 'inline-flex';
    showToast('Strava déconnecté', 'success');
    renderDashboard();
  } catch (e) { showToast('Impossible de déconnecter Strava', 'error'); }
}

export async function manualSync() {
  const btn = document.getElementById('btnSync');
  if (btn) { btn.textContent = '⟳'; btn.style.animation = 'spin 1s linear infinite'; btn.disabled = true; }
  showToast('Synchronisation Strava en cours…', 'info', 3000);
  const prevIds = new Set((VLState.allActivities || []).map(a => a.id));
  try {
    await refreshActivitiesFromServer();
    await new Promise(r => setTimeout(r, 3000));
    await loadActivities();
    renderDashboard();
    showToast('Synchronisation terminée ✓', 'success');
    const hasNewTrail = (VLState.allActivities || []).some(a =>
      !prevIds.has(a.id) &&
      (a.type || a.sport_type || '').toLowerCase().includes('trail') &&
      (a.total_elevation_gain || 0) > 100
    );
    if (hasNewTrail) autoCalibrate(VLState.allActivities);
    VLState.runnerProfile = null;
  } catch (e) { showToast('Erreur de synchronisation', 'error'); }
  finally { if (btn) { btn.textContent = '⟳'; btn.style.animation = ''; btn.disabled = false; } }
}
