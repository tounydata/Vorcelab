import { icon } from './icons.js';
export const isRun = t => ['Run','TrailRun','Trail Run','Running'].includes(t);
export const fmtP = s => s > 0 ? `${Math.floor(1000/s/60)}:${String(Math.round(1000/s%60)).padStart(2,'0')}` : '--';
export const fmtD = s => { const h=Math.floor(s/3600),m=Math.floor(s%3600/60); return h>0?`${h}h${String(m).padStart(2,'0')}`:`${m}min`; };
export const tE = t => (t === 'TrailRun' ? icon('trail', 13) : icon('run', 13));
export const tL = t => ({Run:'Route',TrailRun:'Trail'}[t]||'Run');

export function parseCsvDate(str) {
  if (!str) return null;
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  d = new Date(str.replace(' UTC','').replace(/,(\s*\d{4}),/,', $1'));
  if (!isNaN(d.getTime())) return d;
  d = new Date(str.replace(/,/g,''));
  return isNaN(d.getTime()) ? null : d;
}
export const bC = t => t==='TrailRun'?'linear-gradient(90deg,#ff6b35,#fbbf24)':'linear-gradient(90deg,#00d4ff,#a78bfa)';

export function deltaHTML(pct, label='mois dernier') {
  if (!pct && pct !== 0) return '';
  if (pct > 5) return `<span class="delta-up">↑ +${Math.round(pct)}% vs ${label}</span>`;
  if (pct < -5) return `<span class="delta-down">↓ ${Math.round(pct)}% vs ${label}</span>`;
  return `<span class="delta-eq">= stable vs ${label}</span>`;
}

// fmtT — alias de fmtD, utilisé dans les calculs GPX
export const fmtT = fmtD;
