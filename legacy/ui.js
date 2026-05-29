import { escapeHTML } from './security.js';

export function showToast(msg, type = 'info', duration = 4000) {
  const icons  = { success: '✓', error: '✕', info: 'ℹ' };
  const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--cyan)' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="color:${colors[type]};font-weight:700;font-size:1rem">${icons[type]}</span><span>${escapeHTML(msg)}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;margin-left:auto;font-size:1rem">×</button>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut .25s ease forwards';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

export function showOnboarding() {
  document.getElementById('onboarding').style.display = 'block';
  document.getElementById('dashContent').style.display = 'none';
}

export function showDashContent() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('dashContent').style.display = 'block';
}
