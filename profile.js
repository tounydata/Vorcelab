import { VLState, sb } from './app-state.js';
import { escapeAttr, safeUrl } from './security.js';
import { renderNutritionProducts } from './nutrition.js';
import { showToast } from './ui.js';

const REDIRECT_URI = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}/`;

const PAIN_ZONES = [
  { key: 'knee',       label: 'Genou' },
  { key: 'achilles',   label: "Tendon d'Achille" },
  { key: 'hip',        label: 'Hanche / ITB' },
  { key: 'plantar',    label: 'Fascia plantaire' },
  { key: 'shin',       label: 'Périostite tibiale' },
  { key: 'lower_back', label: 'Bas du dos' },
  { key: 'hamstring',  label: 'Ischio-jambiers' },
  { key: 'calf',       label: 'Mollet' },
];

function renderPainGrid() {
  const grid = document.getElementById('painGrid');
  if (!grid) return;
  grid.innerHTML = '';
  PAIN_ZONES.forEach(z => {
    const active = (VLState.userProfile.pain_zones || []).includes(z.key);
    const div = document.createElement('div');
    div.className = 'pain-zone' + (active ? ' active' : '');
    div.onclick = () => { togglePainZone(z.key, div); };
    div.innerHTML = `<input type="checkbox" ${active ? 'checked' : ''}><span style="font-size:.8rem;font-weight:500">${z.label}</span>`;
    grid.appendChild(div);
  });
}

function togglePainZone(key, el) {
  if (!VLState.userProfile.pain_zones) VLState.userProfile.pain_zones = [];
  const idx = VLState.userProfile.pain_zones.indexOf(key);
  if (idx >= 0) { VLState.userProfile.pain_zones.splice(idx, 1); el.classList.remove('active'); el.querySelector('input').checked = false; }
  else { VLState.userProfile.pain_zones.push(key); el.classList.add('active'); el.querySelector('input').checked = true; }
}

function updateSilhouetteSex() {
  const sex = VLState.userProfile?.sex || 'M';
  const isFemale = sex === 'F';
  const show = (id, visible) => { const el = document.getElementById(id); if (el) el.style.display = visible ? '' : 'none'; };
  show('sg-front-m', !isFemale); show('sg-front-f', isFemale);
  show('sg-back-m', !isFemale);  show('sg-back-f', isFemale);
}

export async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', VLState.currentUser.id).single();
  if (data) {
    VLState.userProfile = { pain_zones: [], ...data };
    VLState.userProfile.pain_zones = VLState.userProfile.pain_zones || [];
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('p-name', data.name); set('p-birthdate', data.birthdate); set('p-sex', data.sex);
    set('p-weight', data.weight); set('p-height', data.height);
    set('p-vo2max', data.vo2max); set('p-fcmax', data.fc_max);
    set('p-lactate', data.lactate_threshold); set('p-lactate-pace', data.lactate_pace);
    set('p-goals', data.goals);
    if (data.name) {
      document.getElementById('headerName').textContent = data.name;
      const hm = document.getElementById('headerNameMobile'); if (hm) hm.textContent = data.name;
    }
    if (data.avatar_url) updateAvatar(data.avatar_url);
    if (data.nutrition_products) VLState.userProfile.nutrition_products = data.nutrition_products;
    if (data.nutrition_level) { VLState.userProfile.nutrition_level = data.nutrition_level; set('nutr-level', data.nutrition_level); }
    if (data.prs) {
      const p = data.prs; VLState.userProfile.prs = p;
      const sp = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      if (p['5k'])      { sp('pr-5k', p['5k'].time);           sp('pr-5k-date', p['5k'].date); }
      if (p['10k'])     { sp('pr-10k', p['10k'].time);         sp('pr-10k-date', p['10k'].date); }
      if (p['15k'])     { sp('pr-15k', p['15k'].time);         sp('pr-15k-date', p['15k'].date); }
      if (p['semi'])    { sp('pr-semi', p['semi'].time);        sp('pr-semi-date', p['semi'].date); }
      if (p['marathon']){ sp('pr-marathon', p['marathon'].time);sp('pr-marathon-date', p['marathon'].date); }
      if (p['ultra'])   { sp('pr-ultra', p['ultra'].time); sp('pr-ultra-date', p['ultra'].date); sp('pr-ultra-dist', p['ultra'].dist); sp('pr-ultra-dplus', p['ultra'].dplus); }
    }
    updateSilhouetteSex();
    if (data.runner_profile) VLState.runnerProfile = data.runner_profile;
  }
}

export async function saveProfile() {
  const profile = {
    id: VLState.currentUser.id,
    name:      document.getElementById('p-name').value || null,
    birthdate: document.getElementById('p-birthdate').value || null,
    age: document.getElementById('p-birthdate').value
      ? Math.floor((new Date() - new Date(document.getElementById('p-birthdate').value)) / 31557600000)
      : null,
    sex:                document.getElementById('p-sex').value || null,
    weight:             parseFloat(document.getElementById('p-weight').value) || null,
    height:             parseFloat(document.getElementById('p-height').value) || null,
    vo2max:             parseFloat(document.getElementById('p-vo2max').value) || null,
    fc_max:             parseInt(document.getElementById('p-fcmax').value) || null,
    lactate_threshold:  parseInt(document.getElementById('p-lactate').value) || null,
    lactate_pace:       document.getElementById('p-lactate-pace').value || null,
    pain_zones:         VLState.userProfile.pain_zones || [],
    goals:              document.getElementById('p-goals').value || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('profiles').upsert(profile);
  const msg = document.getElementById('profileSaveMsg');
  if (error) {
    msg.textContent = '❌ ' + error.message; msg.style.color = 'var(--red)';
  } else {
    VLState.userProfile = { ...VLState.userProfile, ...profile };
    updateSilhouetteSex();
    msg.textContent = '✓ Sauvegardé'; msg.style.color = 'var(--green)';
    if (profile.name) {
      document.getElementById('headerName').textContent = profile.name;
      const hm = document.getElementById('headerNameMobile'); if (hm) hm.textContent = profile.name;
    }
    setTimeout(() => msg.textContent = '', 3000);
  }
}

function parsePRTime(str) {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export async function savePRs() {
  const prs = {};
  const add = (key, tid, did, extra = {}) => {
    const t = document.getElementById(tid)?.value?.trim();
    const d = document.getElementById(did)?.value;
    const s = parsePRTime(t);
    if (s !== null) prs[key] = { time: t, date: d || null, timeS: s, ...extra };
  };
  add('5k',      'pr-5k',      'pr-5k-date',      { dist: 5000 });
  add('10k',     'pr-10k',     'pr-10k-date',     { dist: 10000 });
  add('15k',     'pr-15k',     'pr-15k-date',     { dist: 15000 });
  add('semi',    'pr-semi',    'pr-semi-date',    { dist: 21097 });
  add('marathon','pr-marathon','pr-marathon-date', { dist: 42195 });
  const ud  = parseFloat(document.getElementById('pr-ultra-dist')?.value) || null;
  const udp = parseFloat(document.getElementById('pr-ultra-dplus')?.value) || null;
  const ut  = document.getElementById('pr-ultra')?.value?.trim();
  const uts = parsePRTime(ut);
  if (uts !== null && ud) prs['ultra'] = { time: ut, timeS: uts, dist: ud * 1000, dplus: udp, date: document.getElementById('pr-ultra-date')?.value || null };
  const { error } = await sb.from('profiles').upsert({ id: VLState.currentUser.id, prs, updated_at: new Date().toISOString() });
  const msg = document.getElementById('prSaveMsg');
  if (error) { msg.textContent = '❌ ' + error.message; msg.style.color = 'var(--red)'; }
  else { VLState.userProfile.prs = prs; msg.textContent = '✓ PR sauvegardés'; msg.style.color = 'var(--green)'; setTimeout(() => msg.textContent = '', 3000); }
}

export async function changePassword() {
  const msg = document.getElementById('pwMsg');
  msg.textContent = 'Envoi...'; msg.style.color = 'var(--text2)';
  const { error } = await sb.auth.resetPasswordForEmail(VLState.currentUser.email, { redirectTo: REDIRECT_URI });
  if (error) { msg.textContent = '❌ ' + error.message; msg.style.color = 'var(--red)'; }
  else { msg.textContent = '✓ Email envoyé !'; msg.style.color = 'var(--green)'; }
}

let _cropState = { x: 0, y: 0, scale: 1, startX: 0, startY: 0, startDist: 0, dragging: false };

export async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const modal = document.getElementById('cropModal');
    const img   = document.getElementById('cropImage');
    modal.style.display = 'flex';
    img.onload = () => {
      const r = Math.max(280 / img.naturalWidth, 280 / img.naturalHeight);
      _cropState = { x: 0, y: 0, scale: r, startX: 0, startY: 0, startDist: 0, dragging: false };
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
  ctx.drawImage(img, -_cropState.x / s, -_cropState.y / s, 280 / s, 280 / s, 0, 0, size, size);
  closeCropModal();
  showToast('Upload en cours...', 'info', 2000);
  canvas.toBlob(async (blob) => {
    const path = `${VLState.currentUser.id}/avatar.jpg`;
    const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    const { data } = sb.storage.from('avatars').getPublicUrl(path);
    const url = data.publicUrl + '?t=' + Date.now();
    await sb.from('profiles').upsert({ id: VLState.currentUser.id, avatar_url: url });
    VLState.userProfile.avatar_url = url;
    updateAvatar(url);
    showToast('Photo mise à jour ✓', 'success');
  }, 'image/jpeg', 0.88);
}

function updateAvatar(url) {
  const mark    = document.getElementById('avatarMark');
  const preview = document.getElementById('avatarPreview');
  if (url) {
    if (mark)    mark.innerHTML    = `<img src="${escapeAttr(safeUrl(url))}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
    if (preview) preview.innerHTML = `<img src="${escapeAttr(safeUrl(url))}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  }
}

export function populateProfilPanel() {
  if (VLState.currentUser?.email) {
    const el = document.getElementById('p-email');
    if (el) el.value = VLState.currentUser.email;
  }
  const preview = document.getElementById('avatarPreview');
  if (preview && !preview.querySelector('img')) {
    const name  = (VLState.userProfile?.name || '').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0] ? parts[0].slice(0, 2).toUpperCase() : 'AB';
    preview.textContent = initials;
  }
  renderNutritionProducts();
}

export function openProfil()  { window.location.hash = 'profil'; }
export function closeProfil() { window.location.hash = ''; }

export function switchProfilTab(tab) {
  document.querySelectorAll('.vl-profil-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.vl-tab').forEach(b => b.classList.remove('active'));
  const content = document.getElementById('tab-' + tab);
  if (content) content.style.display = 'block';
  document.querySelector(`.vl-tab[data-tab="${tab}"]`)?.classList.add('active');
  const hash = tab === 'compte' ? 'profil' : `profil-${tab}`;
  if (window.location.hash.slice(1) !== hash) history.replaceState(null, '', '#' + hash);
}

// Touch & mouse events for the avatar crop modal
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cropContainer');
  if (!container) return;
  let lastTouchDist = 0;

  container.addEventListener('mousedown', e => {
    _cropState.dragging = true;
    _cropState.startX = e.clientX - _cropState.x;
    _cropState.startY = e.clientY - _cropState.y;
  });
  document.addEventListener('mousemove', e => {
    if (!_cropState.dragging) return;
    _cropState.x = e.clientX - _cropState.startX;
    _cropState.y = e.clientY - _cropState.startY;
    applyTransform();
  });
  document.addEventListener('mouseup', () => _cropState.dragging = false);

  container.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      _cropState.dragging = true;
      _cropState.startX = e.touches[0].clientX - _cropState.x;
      _cropState.startY = e.touches[0].clientY - _cropState.y;
    }
    if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
    e.preventDefault();
  }, { passive: false });

  container.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && _cropState.dragging) {
      _cropState.x = e.touches[0].clientX - _cropState.startX;
      _cropState.y = e.touches[0].clientY - _cropState.startY;
      applyTransform();
    }
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      _cropState.scale *= dist / lastTouchDist;
      lastTouchDist = dist;
      applyTransform();
    }
    e.preventDefault();
  }, { passive: false });

  container.addEventListener('touchend', () => _cropState.dragging = false);
});
