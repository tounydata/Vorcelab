import { VLState, sb, SUPA_URL } from './app-state.js';
import { showToast } from './ui.js';

export function switchTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('authMsg').textContent = '';
}

function updatePasswordRules() {
  const pass = document.getElementById('signupPassword')?.value || '';
  const rules = [
    { id: 'ruleLength', ok: pass.length >= 8,    text: '8 caractères minimum' },
    { id: 'ruleUpper',  ok: /[A-Z]/.test(pass),  text: '1 majuscule minimum' },
    { id: 'ruleDigit',  ok: /[0-9]/.test(pass),  text: '1 chiffre minimum' },
  ];
  rules.forEach(rule => {
    const el = document.getElementById(rule.id);
    if (!el) return;
    el.textContent = `${rule.ok ? '✓' : '○'} ${rule.text}`;
    el.style.color = rule.ok ? 'var(--green)' : 'var(--vl-text-3)';
  });
}

export async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const msg   = document.getElementById('authMsg');
  if (!email || !pass) {
    msg.textContent = 'Entre ton email et ton mot de passe.';
    msg.style.color = 'var(--red)'; return;
  }
  msg.textContent = 'Connexion...'; msg.style.color = 'var(--text2)';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { msg.textContent = 'Email ou mot de passe incorrect.'; msg.style.color = 'var(--red)'; return; }
  if (data?.user) window.dispatchEvent(new CustomEvent('vl:session', { detail: data.user }));
}

export async function signup() {
  const name  = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const pass  = document.getElementById('signupPassword').value;
  const msg   = document.getElementById('authMsg');
  if (pass.length < 8 || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) {
    msg.textContent = 'Mot de passe : 8 caractères minimum, avec au moins 1 majuscule et 1 chiffre.';
    msg.style.color = 'var(--red)'; return;
  }
  msg.textContent = 'Création...'; msg.style.color = 'var(--text2)';
  const { data, error } = await sb.auth.signUp({ email, password: pass });
  if (error) { msg.textContent = error.message; msg.style.color = 'var(--red)'; return; }
  if (data.user) {
    await sb.from('profiles').upsert({ id: data.user.id, name });
    msg.textContent = '✓ Compte créé ! Vérifie ton email si demandé.'; msg.style.color = 'var(--green)';
    setTimeout(() => window.dispatchEvent(new CustomEvent('vl:session', { detail: data.user })), 1500);
  }
}

export async function logout() {
  await sb.auth.signOut();
  VLState.currentUser = null;
  VLState.userProfile = { pain_zones: [] };
  VLState.allActivities = [];
  VLState.historyActivities = [];
  VLState.races = [];
  document.querySelectorAll('.modal, .overlay, .drawer, .profile-modal').forEach(el => {
    el.classList.remove('show', 'active', 'open'); el.style.display = 'none';
  });
  document.getElementById('appShell').classList.remove('show');
  document.getElementById('authScreen').classList.add('show');
}

export async function deleteAccount() {
  const firstConfirm = confirm(
    'Supprimer définitivement ton compte Vorcelab ?\n\nToutes tes données seront supprimées : profil, activités, calendrier, renfo, connexion Strava.\n\nCette action est irréversible.'
  );
  if (!firstConfirm) return;
  const secondConfirm = prompt('Pour confirmer, écris exactement : SUPPRIMER');
  if (secondConfirm !== 'SUPPRIMER') { showToast('Suppression annulée', 'error'); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) { showToast('Session expirée. Reconnecte-toi.', 'error'); return; }
  try {
    showToast('Suppression du compte en cours...', 'success');
    const r = await fetch(`${SUPA_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(payload.error || 'Erreur suppression compte');
    await sb.auth.signOut();
    VLState.currentUser = null; VLState.userProfile = { pain_zones: [] };
    VLState.allActivities = []; VLState.historyActivities = []; VLState.races = [];
    document.querySelectorAll('.modal, .overlay, .drawer, .profile-modal').forEach(el => {
      el.classList.remove('show', 'active', 'open'); el.style.display = 'none';
    });
    document.getElementById('appShell').classList.remove('show');
    document.getElementById('authScreen').classList.add('show');
    showToast('Compte supprimé', 'success');
  } catch (e) { showToast('Impossible de supprimer le compte', 'error'); }
}
