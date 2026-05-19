// ════════════════════════════════════════════════════
// FORMATTERS — pure formatting helpers
// ════════════════════════════════════════════════════
const isRun = t => ['Run','TrailRun','Trail Run','Running'].includes(t);
const fmtP = s => s > 0 ? `${Math.floor(1000/s/60)}:${String(Math.round(1000/s%60)).padStart(2,'0')}` : '--';
const fmtD = s => { const h=Math.floor(s/3600),m=Math.floor(s%3600/60); return h>0?`${h}h${String(m).padStart(2,'0')}`:`${m}min`; };
const tE = t => ({Run:'🏃',TrailRun:'⛰️'}[t]||'🏃');
const tL = t => ({Run:'Route',TrailRun:'Trail'}[t]||'Run');
const bC = t => t==='TrailRun'?'linear-gradient(90deg,#ff6b35,#fbbf24)':'linear-gradient(90deg,#00d4ff,#a78bfa)';

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

function deltaHTML(pct, label='mois dernier') {
  if (!pct && pct !== 0) return '';
  if (pct > 5) return `<span class="delta-up">↑ +${Math.round(pct)}% vs ${label}</span>`;
  if (pct < -5) return `<span class="delta-down">↓ ${Math.round(pct)}% vs ${label}</span>`;
  return `<span class="delta-eq">= stable vs ${label}</span>`;
}

// fmtT — format seconds as duration (e.g. 3670 → "1h01")
function fmtT(s){const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h>0?`${h}h${String(m).padStart(2,'0')}`:`${m}min`;}
