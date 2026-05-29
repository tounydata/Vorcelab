import { VLState, sb } from './app-state.js';
import { renderCalendar, loadRaces, openEventView } from './race-calendar.js';
import { autoCalibrate } from './activity-analysis.js';
import { loadRenfoApp, preloadRenfoState } from './renfo.js';
import { icon } from './icons.js';
import { showToast } from './ui.js';
import { loadProfile, populateProfilPanel, switchProfilTab } from './profile.js';
import { checkStravaToken } from './strava-client.js';
import { loadHistoryFromDB } from './dashboard.js';

export { showToast };

// ════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════
let themeMode = localStorage.getItem('vl-theme') || 'auto';

function applyTheme(mode) {
  themeMode = mode;
  const isLight = mode === 'auto'
    ? window.matchMedia('(prefers-color-scheme: light)').matches
    : mode === 'light';
  document.body.toggleAttribute('data-light', isLight);
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.themeBtn === mode));
}

export function setTheme(mode) {
  localStorage.setItem('vl-theme', mode);
  applyTheme(mode);
}

applyTheme(themeMode);
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (themeMode === 'auto') applyTheme('auto');
});

// ════════════════════════════════════════════════════
// PANELS & ROUTING
// ════════════════════════════════════════════════════
export function showPanel(name) {
  const profilTab = name.startsWith('profil-') ? name.slice(7) : null;
  let panelId     = profilTab ? 'profil' : name;
  if (name.startsWith('strategie/')) panelId = 'strategie';

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item[data-panel]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bni[data-panel]').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + panelId);
  if (!panel) return;
  panel.classList.add('active');
  document.querySelector(`.sidebar-item[data-panel="${panelId}"]`)?.classList.add('active');
  document.querySelector(`.bni[data-panel="${panelId}"]`)?.classList.add('active');

  if (panelId === 'strategie') { renderCalendar(); }
  if (panelId === 'renfo')     { loadRenfoApp(); }
  if (panelId === 'profil')    { populateProfilPanel(); switchProfilTab(profilTab || 'compte'); }
  if (name === 'strategie' && !VLState.currentRaceContext) {
    const drop = document.getElementById('gpxDrop');
    if (drop) {
      drop.style.display = 'block';
      drop.onclick = () => document.getElementById('gpxFile').click();
      drop.innerHTML = `<div style="font-size:2.5rem;margin-bottom:.75rem">${icon('map', 28)}</div><div style="font-family:var(--display);font-size:1.4rem;letter-spacing:.03em;margin-bottom:.4rem">Déposer le fichier GPX</div><div class="mono">Compatible OpenRunner · Strava · Garmin Connect</div>`;
    }
  }
}

export function navigate(panel) {
  const hash = panel === 'dashboard' ? '' : panel;
  if (window.location.hash.slice(1) !== hash) {
    window.location.hash = hash;
  } else {
    showPanel(panel);
  }
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1) || 'dashboard';
  if (hash.startsWith('strategie/')) {
    const raceId = hash.slice('strategie/'.length);
    showPanel('strategie');
    if (VLState.races?.length) openEventView(raceId);
    else loadRaces().then(() => openEventView(raceId));
  } else {
    showPanel(hash);
  }
});

// ════════════════════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════════════════════
let onbStep = 0;
const ONB_TOTAL = 5;

function initOnboarding() {
  if (!VLState.userProfile.name && !VLState.userProfile.fc_max) {
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
  onbStep = Math.max(0, Math.min(ONB_TOTAL - 1, onbStep + dir));
  updateOnbStep();
  if (onbStep === ONB_TOTAL - 1) {
    document.getElementById('onbNext').textContent = 'Commencer →';
    document.getElementById('onbNext').onclick = closeOnboarding;
  } else {
    document.getElementById('onbNext').textContent = 'Suivant →';
    document.getElementById('onbNext').onclick = () => onbNav(1);
  }
  document.getElementById('onbPrev').style.opacity       = onbStep === 0 ? '0' : '1';
  document.getElementById('onbPrev').style.pointerEvents = onbStep === 0 ? 'none' : 'all';
}

function updateOnbStep() {
  document.querySelectorAll('.onb-step').forEach((el, i) => el.classList.toggle('active', i === onbStep));
  ['onbDots', 'onbDots2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = Array.from({ length: ONB_TOTAL }, (_, i) =>
      `<div class="onb-dot${i === onbStep ? ' active' : ''}"></div>`
    ).join('');
  });
}

// ════════════════════════════════════════════════════
// CGU
// ════════════════════════════════════════════════════
export function openCGU()  { document.getElementById('cguOverlay').classList.add('open'); }
export function closeCGU() { document.getElementById('cguOverlay').classList.remove('open'); }

// ════════════════════════════════════════════════════
// BOOTSTRAP
// ════════════════════════════════════════════════════
function pruneStreamsCache() {
  const key  = 'vl_streams_pruned';
  const last = parseInt(localStorage.getItem(key) || '0', 10);
  if (Date.now() - last < 7 * 86400 * 1000) return;
  localStorage.setItem(key, String(Date.now()));
  sb.from('activity_streams')
    .delete()
    .eq('user_id', VLState.currentUser.id)
    .lt('cached_at', new Date(Date.now() - 365 * 86400 * 1000).toISOString())
    .then(({ error }) => { if (error) console.warn('[VL] pruneStreamsCache error:', error.message); });
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
  pruneStreamsCache();
  document.addEventListener('click', e => {
    if (e.target.type === 'date' || e.target.type === 'time') {
      try { e.target.showPicker(); } catch (_) {}
    }
  }, true);
  const initHash = window.location.hash.slice(1) || 'dashboard';
  if (initHash.startsWith('strategie/')) {
    const raceId = initHash.slice('strategie/'.length);
    showPanel('strategie');
    loadRaces().then(() => openEventView(raceId));
  } else {
    showPanel(initHash);
  }
  if (!localStorage.getItem('onb_done')) initOnboarding();
  if (!VLState.userProfile.vam_avg && VLState.allActivities?.length && VLState.stravaConnected) {
    autoCalibrate(VLState.allActivities);
  }
}

// auth.js fires this event after login/signup
window.addEventListener('vl:session', e => initApp(e.detail));

// Splash screen dismiss
(function () {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  setTimeout(() => { splash.classList.add('vl-fade'); setTimeout(() => splash.remove(), 420); }, 1300);
})();

// ════════════════════════════════════════════════════
// GLOBAL HANDLERS
// ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await initApp(session.user);
  } else {
    document.getElementById('authScreen').classList.add('show');
  }
});

window.addEventListener('scroll', () => {
  const b = document.getElementById('scrollTopBtn');
  if (b) b.style.display = window.scrollY > 350 ? 'flex' : 'none';
}, { passive: true });

window.addEventListener('unhandledrejection', e => {
  const msg = e.reason?.message || e.reason || 'Erreur inconnue';
  if (msg.includes('Failed to fetch') || msg.includes('network')) showToast('Problème réseau — vérifie ta connexion', 'error');
  else if (msg.includes('JWT') || msg.includes('auth')) showToast('Session expirée — reconnecte-toi', 'error');
});
