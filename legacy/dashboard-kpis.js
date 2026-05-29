import { VLState } from './app-state.js';

function renderSparkline(id, data, color) {
  const el = document.getElementById(id);
  if (!el || !data.length) return;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 100, H = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - min) / range) * (H - 6)}`).join(' ');
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  el.innerHTML = `<defs><linearGradient id="sg-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="${fillPts}" fill="url(#sg-${id})"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Returns { weekStart, prevWeekStart, prevWeekEnd } for use by other modules
export function renderKPIs(now) {
  const allActivities = VLState.allActivities;

  const weekNum = (() => { const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const w = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w) / 86400000 - 3 + (w.getDay() + 6) % 7) / 7); })();
  const monthFr = ['jan','fév','mars','avr','mai','juin','juil','août','sep','oct','nov','déc'][now.getMonth()].toUpperCase();
  const weekLbl = document.getElementById('dashWeekLabel');
  if (weekLbl) weekLbl.textContent = `SEM. ${weekNum} · ${monthFr} ${now.getFullYear()}`;

  const thisMonth = allActivities.filter(a => { const d = new Date(a.start_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const lastMonth = allActivities.filter(a => { const d = new Date(a.start_date); const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear(); });

  const dowNow = now.getDay();
  const daysToMon = (dowNow + 6) % 7;
  const weekStart     = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMon);
  const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7);
  const prevWeekEnd   = new Date(weekStart);
  const thisWeek = allActivities.filter(a => new Date(a.start_date) >= weekStart);
  const prevWeek = allActivities.filter(a => { const d = new Date(a.start_date); return d >= prevWeekStart && d < prevWeekEnd; });

  const km  = r => r.reduce((s, a) => s + a.distance / 1000, 0);
  const dp  = r => r.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);

  const kmM = km(thisMonth), kmW = km(thisWeek), dpM = dp(thisMonth), dpW = dp(thisWeek);
  const kmML = km(lastMonth), dpML = dp(lastMonth);
  const kmPW = km(prevWeek),  dpPW = dp(prevWeek);
  const runsM = thisMonth.length, runsML = lastMonth.length;
  const runsW = thisWeek.length,  runsPW = prevWeek.length;

  document.getElementById('s-km-month').textContent    = kmM.toFixed(0);
  document.getElementById('s-km-week').textContent     = kmW.toFixed(0);
  document.getElementById('s-dplus-month').textContent = dpM.toFixed(0);
  document.getElementById('s-dplus-week').textContent  = dpW.toFixed(0) + ' m D+';
  const runsWeekEl  = document.getElementById('s-runs-week');  if (runsWeekEl)  runsWeekEl.textContent  = runsW;
  const runsMonthEl = document.getElementById('s-runs-month'); if (runsMonthEl) runsMonthEl.textContent = runsM;

  // Sparklines
  const sparkKmData = [], sparkDpData = [];
  let cumKm = 0, cumDp = 0;
  const today = now.getDate();
  for (let day = 1; day <= today; day++) {
    const dayActs = thisMonth.filter(a => new Date(a.start_date).getDate() === day);
    cumKm += dayActs.reduce((s, a) => s + a.distance / 1000, 0);
    cumDp += dayActs.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
    sparkKmData.push(cumKm); sparkDpData.push(cumDp);
  }
  renderSparkline('spark-km', sparkKmData, '#10B981');
  renderSparkline('spark-dp', sparkDpData, '#E5562A');

  // Hero deltas
  const pctKm   = kmML  > 0 ? (kmM  - kmML)  / kmML  * 100 : null;
  const pctDp   = dpML  > 0 ? (dpM  - dpML)  / dpML  * 100 : null;
  const pctRuns = runsML > 0 ? (runsM - runsML) / runsML * 100 : null;
  const setHeroDelta = (id, pct) => { const el = document.getElementById(id); if (!el || pct === null) return; const sign = pct > 0 ? '+ ' : '− '; el.textContent = `${sign}${Math.abs(Math.round(pct))}% · vs M-1`; el.style.color = pct > 5 ? 'var(--vl-growth)' : pct < -5 ? 'var(--vl-ember)' : 'var(--vl-text-3)'; };
  setHeroDelta('s-km-month-delta', pctKm);
  setHeroDelta('s-dplus-delta', pctDp);

  // Satellite deltas
  const pctKmW   = kmPW  > 0 ? (kmW  - kmPW)  / kmPW  * 100 : null;
  const pctDpW   = dpPW  > 0 ? (dpW  - dpPW)  / dpPW  * 100 : null;
  const pctRunsW = runsPW > 0 ? (runsW - runsPW) / runsPW * 100 : null;
  const setSatDelta = (id, pct) => { const el = document.getElementById(id); if (!el) return; if (pct === null) { el.textContent = ''; return; } const sign = pct > 0 ? '↑' : pct < -5 ? '↓' : '='; el.textContent = `${sign} ${Math.abs(Math.round(pct))}%`; el.style.color = pct > 5 ? 'var(--vl-growth)' : pct < -5 ? 'var(--vl-ember)' : 'var(--vl-text-3)'; };
  setSatDelta('s-km-week-delta', pctKmW);
  setSatDelta('s-dplus-week-delta', pctDpW);
  setSatDelta('s-runs-delta', pctRuns);
  setSatDelta('s-runs-week-delta', pctRunsW);

  return { weekStart };
}
