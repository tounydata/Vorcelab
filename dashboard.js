import { VLState, sb, FC_MAX_DEFAULT } from './app-state.js';
import { renderRaces } from './race-calendar.js';
import { openAnalyse, fetchStreams } from './activity-analysis.js';
import { isRun, fmtP, fmtD, tL, parseCsvDate } from './formatters.js';
import { escapeHTML } from './security.js';
import { computeActivityLoad } from './training-load.js';
import { showDashContent, showOnboarding } from './ui.js';

let annualChartInst = null;
let annualChartMode = 'km';
let chargeChartInst = null;

const _RENFO_EXO_CAT = {
  squat_lourd:'force_lourde',rdl:'force_lourde',bulgare:'force_lourde',mollets_lourds:'force_lourde',hip_thrust:'force_lourde',lunge_marcheur:'force_lourde',
  pogo_jumps:'pliometrie',bondissements:'pliometrie',drop_jumps:'pliometrie',skips:'pliometrie',lateral_bound:'pliometrie',box_jump:'pliometrie',
  step_down:'excentrique',nordic:'excentrique',mollet_excentrique:'excentrique',single_leg_rdl:'excentrique',tibialis_raise:'excentrique',reverse_nordic:'excentrique',single_leg_glute_bridge:'excentrique',wall_sit:'excentrique',
  pallof_press:'tronc',side_plank_hipdrop:'tronc',dead_bug:'tronc',bird_dog:'tronc',suitcase_carry:'tronc',copenhagen_plank:'tronc',core_rotation:'tronc',
  tractions_or_row:'haut_corps',pompes:'haut_corps',face_pull:'haut_corps',ytw_prone:'haut_corps',
  hip_9090:'mobilite',pigeon_actif:'mobilite',knee_to_wall:'mobilite',open_book:'mobilite',monster_walk:'mobilite',hip_abduction:'mobilite',cossack_squat:'mobilite',
};
const _RENFO_CAT_META = {
  force_lourde: { label:'Force lourde',  color:'#E5562A' },
  pliometrie:   { label:'Pliométrie',    color:'#f39c12' },
  excentrique:  { label:'Excentrique',   color:'#3498db' },
  tronc:        { label:'Tronc & stab.', color:'#9b59b6' },
  haut_corps:   { label:'Haut du corps', color:'#1abc9c' },
  mobilite:     { label:'Mobilité',      color:'#2ecc71' },
};

// ════════════════════════════════════════════════════
// SPARKLINE
// ════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════
// DASHBOARD MAIN RENDER
// ════════════════════════════════════════════════════
export function renderDashboard() {
  if (!VLState.allActivities.length) { showOnboarding(); return; }
  showDashContent();
  renderRaces();

  const now = new Date();

  const weekNum = (() => { const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const w = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w) / 86400000 - 3 + (w.getDay() + 6) % 7) / 7); })();
  const monthFr = ['jan','fév','mars','avr','mai','juin','juil','août','sep','oct','nov','déc'][now.getMonth()].toUpperCase();
  const weekLbl = document.getElementById('dashWeekLabel');
  if (weekLbl) weekLbl.textContent = `SEM. ${weekNum} · ${monthFr} ${now.getFullYear()}`;

  const thisMonth = VLState.allActivities.filter(a => { const d = new Date(a.start_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const lastMonth = VLState.allActivities.filter(a => { const d = new Date(a.start_date); const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear(); });

  const dowNow = now.getDay();
  const daysToMon = (dowNow + 6) % 7;
  const weekStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMon);
  const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7);
  const prevWeekEnd   = new Date(weekStart);
  const thisWeek = VLState.allActivities.filter(a => new Date(a.start_date) >= weekStart);
  const prevWeek = VLState.allActivities.filter(a => { const d = new Date(a.start_date); return d >= prevWeekStart && d < prevWeekEnd; });

  const km  = r => r.reduce((s, a) => s + a.distance / 1000, 0);
  const dp  = r => r.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
  const dur = r => r.reduce((s, a) => s + (a.moving_time || 0), 0);

  const kmM = km(thisMonth), kmW = km(thisWeek), dpM = dp(thisMonth), dpW = dp(thisWeek);
  const kmML = km(lastMonth), dpML = dp(lastMonth);
  const kmPW = km(prevWeek), dpPW = dp(prevWeek);
  const runsM = thisMonth.length, runsML = lastMonth.length, runsW = thisWeek.length, runsPW = prevWeek.length;

  document.getElementById('s-km-month').textContent   = kmM.toFixed(0);
  document.getElementById('s-km-week').textContent    = kmW.toFixed(0);
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

  const fcMax = VLState.userProfile.fc_max || FC_MAX_DEFAULT;

  if (document.getElementById('annualChart')) renderAnnualChart();

  renderActivities();
  renderBar7j(VLState.allActivities, now);

  renderChargeChart(VLState.allActivities, fcMax, []);
  loadRenfoChargeData().then(renfoLoads => renderChargeChart(VLState.allActivities, fcMax, renfoLoads));

  loadRenfoWeekBlocks(weekStart);

  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const last7Days = VLState.allActivities.filter(a => new Date(a.start_date) >= sevenDaysAgo);
  const efActs = last7Days.length > 0 ? last7Days : VLState.allActivities.slice(0, 5);
  loadAerobicStat(efActs, fcMax, last7Days.length === 0);
}

// ════════════════════════════════════════════════════
// 7-DAY BAR CHART
// ════════════════════════════════════════════════════
function renderBar7j(activities, now) {
  const el = document.getElementById('dash-bar7j');
  if (!el) return;
  const LABELS = ['Lu','Ma','Me','Je','Ve','Sa','Di'];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const acts = activities.filter(a => a.start_date?.slice(0, 10) === ds);
    return { label: LABELS[(d.getDay()+6)%7], km: acts.reduce((s,a)=>s+a.distance/1000,0), dp: acts.reduce((s,a)=>s+(a.total_elevation_gain||0),0), ds, acts };
  });
  const maxKm = Math.max(...days.map(d => d.km), 0.1);
  const maxDp = Math.max(...days.map(d => d.dp), 1);
  const VW = 280, BH = 44, TH = 56, COL = 40;
  const dpPts = days.map((d, i) => ({ x: i*COL+COL/2, y: d.dp>0 ? BH-(d.dp/maxDp)*BH*0.88 : BH }));
  const _spline = (pts) => {
    const cl = v => Math.max(0, Math.min(BH, v));
    let d = `M${pts[0].x},${pts[0].y}`;
    const t = 0.18;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
      d += ` C${(p1.x+(p2.x-p0.x)*t).toFixed(1)},${cl(p1.y+(p2.y-p0.y)*t).toFixed(1)} ${(p2.x-(p3.x-p1.x)*t).toFixed(1)},${cl(p2.y-(p3.y-p1.y)*t).toFixed(1)} ${p2.x},${p2.y}`;
    }
    return d;
  };
  const lineD  = _spline(dpPts);
  const areaD  = lineD + ` L${dpPts[dpPts.length-1].x},${BH} L${dpPts[0].x},${BH} Z`;
  const bars   = days.map((d,i) => { const h=d.km>0?Math.max(4,(d.km/maxKm)*BH):2; const c=d.km>0?'var(--vl-ember)':'var(--vl-line)'; return `<rect x="${i*COL+COL/2-7}" y="${BH-h}" width="14" height="${h}" rx="2" fill="${c}"/>`; }).join('');
  const lbls   = days.map((d,i) => `<text x="${i*COL+COL/2}" y="${TH-1}" text-anchor="middle" style="font-family:'JetBrains Mono','IBM Plex Mono',monospace;font-size:9px;fill:var(--vl-text-3);letter-spacing:.08em">${d.label}</text>`).join('');
  const overlays = days.map((d,i) => `<rect class="b7-col" data-idx="${i}" x="${i*COL}" y="0" width="${COL}" height="${BH}" fill="transparent" pointer-events="all" style="cursor:${d.acts.length?'pointer':'default'}"/>`).join('');
  el.style.position = 'relative';
  el.innerHTML = `<svg viewBox="0 0 ${VW} ${TH}" preserveAspectRatio="none" width="100%" height="${TH}" style="display:block">
    <path d="${areaD}" fill="var(--vl-growth)" opacity="0.18"/>
    <path d="${lineD}" fill="none" stroke="var(--vl-growth)" stroke-width="1.5" opacity="0.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${bars}${lbls}${overlays}
  </svg>`;

  const tip = document.createElement('div');
  tip.style.cssText = "position:absolute;top:2px;pointer-events:none;white-space:nowrap;display:none;background:var(--vl-surf-2,#1e1f24);border:1px solid var(--vl-line);border-radius:6px;padding:3px 8px;font-family:'JetBrains Mono','IBM Plex Mono',monospace;font-size:10px;color:var(--vl-text-1);z-index:10;transform:translateX(-50%)";
  el.appendChild(tip);

  const dpTotal   = days.reduce((s, d) => s + d.dp, 0);
  const dpTotalEl = document.getElementById('bar7jDpTotal');
  if (dpTotalEl) dpTotalEl.textContent = Math.round(dpTotal);

  el.querySelectorAll('.b7-col').forEach(rect => {
    const i   = +rect.dataset.idx;
    const day = days[i];
    rect.addEventListener('mouseenter', () => {
      if (!day.acts.length) return;
      const parts = [];
      if (day.km > 0) parts.push(`${day.km.toFixed(1)} km`);
      if (day.dp > 0) parts.push(`${Math.round(day.dp)} m D+`);
      if (!parts.length) return;
      tip.textContent = parts.join(' · ');
      const svgW = el.querySelector('svg').getBoundingClientRect().width;
      tip.style.left = `${((i * COL + COL / 2) / VW) * svgW}px`;
      tip.style.display = 'block';
    });
    rect.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    rect.addEventListener('click', () => {
      if (!day.acts.length) return;
      if (day.acts.length === 1) {
        openAnalyse(day.acts[0]);
      } else {
        window._actDateFilter = day.ds;
        renderActivities();
        if (window.Vorcelab) Vorcelab.navigate('activites');
      }
    });
  });
}

// ════════════════════════════════════════════════════
// CHARGE 28J CHART
// ════════════════════════════════════════════════════
function renderChargeChart(activities, fcMax, renfoLoads) {
  const canvas = document.getElementById('chargeChart');
  if (!canvas) return;
  if (chargeChartInst) { chargeChartInst.destroy(); chargeChartInst = null; }
  const now  = new Date();
  const DAYS = 28;
  const dates = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  const runLoads = dates.map(ds => {
    const dayActs = activities.filter(a => a.start_date?.slice(0, 10) === ds);
    return dayActs.reduce((s, a) => s + computeActivityLoad(a, fcMax), 0);
  });
  const renfoMap  = Object.fromEntries((renfoLoads || []).map(r => [r.date, r.load]));
  const renfoData = dates.map(ds => renfoMap[ds] || 0);
  const allVals   = [...runLoads, ...renfoData];
  const maxVal    = Math.max(...allVals, 1);
  const norm      = v => Math.round((v / maxVal) * 100);
  const labels    = dates.map((ds, i) => i % 7 === 0 ? new Date(ds+'T12:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' }) : '');
  try {
    chargeChartInst = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Course', data:runLoads.map(norm), borderColor:'#E5562A', backgroundColor:'rgba(229,86,42,.12)', fill:true, tension:.4, pointRadius:0, borderWidth:1.5 },
          { label:'Renfo',  data:renfoData.map(norm), borderColor:'#7c3aed', backgroundColor:'rgba(124,58,237,.10)', fill:true, tension:.4, pointRadius:0, borderWidth:1.5 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: (_, elements) => {
          if (!elements?.length || !window.Vorcelab) return;
          const idx    = elements[0].index;
          const ds     = dates[idx];
          const dayActs = activities.filter(a => a.start_date?.slice(0, 10) === ds);
          if (!dayActs.length) return;
          if (dayActs.length === 1) {
            openAnalyse(dayActs[0]);
          } else {
            window._actDateFilter = ds;
            renderActivities();
            Vorcelab.navigate('activites');
          }
        },
        plugins: { legend:{display:false}, tooltip:{mode:'index',intersect:false,callbacks:{label:c=>`${c.dataset.label} · ${c.raw}`}} },
        scales: {
          x: { display:true, ticks:{font:{family:'var(--vl-mono)',size:8},color:'var(--vl-text-3)',maxRotation:0,autoSkip:false}, grid:{display:false}, border:{display:false} },
          y: { display:false, min:0, max:105 },
        },
      },
    });
  } catch (e) { chargeChartInst = null; }
}

async function loadRenfoChargeData() {
  if (!VLState.currentUser) return [];
  const _cd    = new Date(Date.now() - 28 * 86400000);
  const cutoff = `${_cd.getFullYear()}-${String(_cd.getMonth()+1).padStart(2,'0')}-${String(_cd.getDate()).padStart(2,'0')}`;
  const { data } = await sb.from('renfo_exercise_log')
    .select('session_date,rpe,created_at')
    .gte('session_date', cutoff)
    .order('created_at', { ascending: true });
  if (!data?.length) return [];
  const byDate = {};
  data.forEach(r => {
    const d = r.session_date;
    if (!byDate[d]) byDate[d] = { rpes:[], times:[] };
    if (r.rpe)        byDate[d].rpes.push(r.rpe);
    if (r.created_at) byDate[d].times.push(new Date(r.created_at).getTime());
  });
  return Object.entries(byDate).map(([date, s]) => {
    const avgRpe = s.rpes.length ? s.rpes.reduce((a, b) => a + b, 0) / s.rpes.length : 5;
    const mins   = s.times.length > 1 ? Math.min(120, Math.max(20, (Math.max(...s.times) - Math.min(...s.times)) / 60000)) : 40;
    return { date, load: Math.round(avgRpe * mins) };
  });
}

async function loadRenfoWeekBlocks(weekStart) {
  const el      = document.getElementById('renfo-cat-blocks');
  const countEl = document.getElementById('renfo-week-count');
  if (!el || !VLState.currentUser) return;

  const weekCutoff  = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,'0')}-${String(weekStart.getDate()).padStart(2,'0')}`;
  const now         = new Date();
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCutoff = `${monthStart.getFullYear()}-${String(monthStart.getMonth()+1).padStart(2,'0')}-01`;
  const ninetyAgo   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
  const histCutoff  = `${ninetyAgo.getFullYear()}-${String(ninetyAgo.getMonth()+1).padStart(2,'0')}-${String(ninetyAgo.getDate()).padStart(2,'0')}`;

  const { data } = await sb.from('renfo_session_log')
    .select('session_date,completed_exercises')
    .gte('session_date', histCutoff)
    .eq('user_id', VLState.currentUser.id)
    .order('session_date', { ascending: false });

  const rows = data || [];

  const weekRows     = rows.filter(r => r.session_date >= weekCutoff);
  const weekSessions = [...new Set(weekRows.map(r => r.session_date))];
  if (countEl) countEl.textContent = weekSessions.length;

  const monthRows     = rows.filter(r => r.session_date >= monthCutoff);
  const monthSessions = [...new Set(monthRows.map(r => r.session_date))];
  const monthCountEl  = document.getElementById('renfo-month-count');
  if (monthCountEl) monthCountEl.textContent = monthSessions.length;

  const catLastDone = {};
  rows.forEach(r => {
    Object.keys(r.completed_exercises || {}).forEach(exoId => {
      const cat = _RENFO_EXO_CAT[exoId];
      if (cat && !catLastDone[cat]) catLastDone[cat] = r.session_date;
    });
  });

  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  function daysSince(ds) {
    if (!ds) return null;
    return Math.round((new Date(todayStr + 'T12:00') - new Date(ds + 'T12:00')) / 86400000);
  }
  function fmtSince(d) {
    if (d === null) return null;
    if (d === 0) return "AUJOURD'HUI";
    if (d === 1) return 'HIER';
    return `${d}J SANS`;
  }

  const _CAT_DUR = { force_lourde:40, pliometrie:25, excentrique:30, tronc:20, haut_corps:25, mobilite:15 };

  el.innerHTML = Object.entries(_RENFO_CAT_META).map(([cat, meta]) => {
    const ds    = daysSince(catLastDone[cat] || null);
    const since = fmtSince(ds);
    const dur   = _CAT_DUR[cat] || 30;
    const sub   = since ? `${since} · ${dur} MIN` : `${dur} MIN`;
    const fresh = ds !== null && ds <= 7;
    return `<div class="renfo-cat-block" onclick="window._pendingRenfoFocus='${cat}';Vorcelab.navigate('renfo')" style="cursor:pointer;${fresh?'border-color:rgba(167,139,250,.35);background:rgba(167,139,250,.1);':''}">
      <div style="font-family:var(--vl-mono);font-size:.58rem;font-weight:700;color:${fresh?'var(--color-renfo,#a78bfa)':'var(--vl-text-2)'};line-height:1.2;margin-bottom:5px">${meta.label}</div>
      <div style="font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-3);letter-spacing:.04em">${sub}</div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════
// LAST ACTIVITY WIDGET
// ════════════════════════════════════════════════════
export function renderLastActivity() {
  const w = document.getElementById('lastActWidget');
  if (!w) return;
  const act = VLState.allActivities[0];
  if (!act) { w.innerHTML = '<div class="mono t3">Aucune activité</div>'; return; }

  const now      = new Date();
  const diffDays = Math.floor((now - new Date(act.start_date)) / 86400000);
  const relDate  = diffDays === 0 ? "Aujourd'hui" : diffDays === 1 ? 'Hier' : `Il y a ${diffDays} j`;
  const distKm   = (act.distance / 1000).toFixed(1);
  const hasEle   = act.total_elevation_gain > 0;
  const hasHR    = !!act.average_heartrate;
  const cols     = 3 + (hasEle ? 1 : 0) + (hasHR ? 1 : 0);

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

// ════════════════════════════════════════════════════
// AEROBIC % (streams-based)
// ════════════════════════════════════════════════════
async function loadAerobicStat(weekActs, fcMax, fallback = false) {
  const el = document.getElementById('aerobicStatVal');
  if (!el) return;
  el.textContent = '…';
  const threshold = fcMax * 0.75;
  if (!weekActs.length) { el.textContent = '—'; return; }

  let totalPts = 0, aerobicPts = 0, authError = false;
  await Promise.all(weekActs.map(async a => {
    try {
      const streams = await fetchStreams(a.id);
      if (streams._authError) { authError = true; return; }
      const hr = streams.heartrate?.data;
      if (!hr?.length) return;
      totalPts    += hr.length;
      aerobicPts  += hr.filter(v => v < threshold).length;
    } catch {}
  }));

  const elNow = document.getElementById('aerobicStatVal');
  if (!elNow) return;
  if (totalPts === 0) {
    if (authError) {
      elNow.textContent = '↻'; elNow.title = 'Token Strava expiré — resynchronise';
      elNow.style.cursor = 'pointer'; elNow.style.color = 'var(--vl-ember)';
      elNow.onclick = () => { if (window.Vorcelab) Vorcelab.navigate('profil'); };
    } else { elNow.textContent = '—'; }
    return;
  }

  const pct = Math.round(aerobicPts / totalPts * 100);
  elNow.style.color = pct >= 75 ? 'var(--vl-growth)' : pct < 50 ? 'var(--vl-ember)' : '';
  elNow.style.fontSize = '';
  elNow.textContent = pct + '%';
  const qualityEl = document.getElementById('aerobicStatQuality');
  if (qualityEl) {
    const q  = pct >= 80 ? 'EXCELLENT' : pct >= 65 ? 'BON' : pct >= 50 ? 'MOYEN' : 'FAIBLE';
    const qc = pct >= 80 ? 'var(--color-victory,#34d399)' : pct >= 65 ? 'var(--vl-text-2)' : pct >= 50 ? 'var(--vl-amber)' : 'var(--color-alert,#e07c5e)';
    qualityEl.textContent = q; qualityEl.style.color = qc;
  }
  if (fallback) {
    const labelEl = document.querySelector('#aerobicStatCard .s-sl');
    if (labelEl) labelEl.textContent = '% EF · dernières sorties';
  }
}

// ════════════════════════════════════════════════════
// ANNUAL CUMULATIVE CHART
// ════════════════════════════════════════════════════
export function setAnnualMode(mode) {
  annualChartMode = mode;
  const base = "font-family:var(--vl-mono);font-size:9px;font-weight:700;letter-spacing:.1em;padding:6px 12px;border-radius:4px;border:1px solid var(--vl-line-2);cursor:pointer;touch-action:manipulation";
  const btnKm = document.getElementById('annualBtnKm');
  const btnDp = document.getElementById('annualBtnDp');
  if (btnKm) btnKm.setAttribute('style', base + (mode === 'km' ? ';background:var(--vl-ember);color:var(--vl-ink)' : ';background:transparent;color:var(--vl-text-3)'));
  if (btnDp) btnDp.setAttribute('style', base + (mode === 'dp' ? ';background:var(--vl-ember);color:var(--vl-ink)' : ';background:transparent;color:var(--vl-text-3)'));
  renderAnnualChart();
}

function renderAnnualChart() {
  if (annualChartInst) { annualChartInst.destroy(); annualChartInst = null; }
  const isDp = annualChartMode === 'dp';

  const apiDayKeys = new Set(VLState.allActivities.map(a => {
    const d = new Date(a.start_date);
    return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }).filter(Boolean));

  const histRuns = VLState.historyActivities.map(h => {
    const d = parseCsvDate(h['Activity Date'] || h['Date']);
    if (!d || isNaN(d.getTime())) return null;
    if (apiDayKeys.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)) return null;
    return {
      type: h['Activity Type'] === 'Trail Run' ? 'TrailRun' : 'Run',
      distance: parseFloat(h['Distance']) || 0,
      total_elevation_gain: parseFloat(h['Elevation Gain']) || 0,
      start_date: d.toISOString(),
    };
  }).filter(Boolean);

  const allRuns = [...VLState.allActivities, ...histRuns]
    .filter(a => isRun(a.type) && (isDp ? true : a.distance > 0));

  const monthly = {}, yearly = {};
  allRuns.forEach(a => {
    const d = new Date(a.start_date);
    if (isNaN(d.getTime())) return;
    const y = d.getFullYear().toString();
    const m = d.getMonth();
    if (!monthly[y]) monthly[y] = Array(12).fill(0);
    if (!yearly[y])  yearly[y]  = Array(12).fill(0);
    const val = isDp ? (a.total_elevation_gain || 0) : a.distance / 1000;
    monthly[y][m] += val;
    yearly[y][m]  += val;
  });

  const sortedYears = Object.keys(yearly).sort().slice(-2);
  if (!sortedYears.length) return;

  const colors       = ['#5E5B52', '#10B981'];
  const months       = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const yUnit        = isDp ? 'm' : 'km';

  const datasets = sortedYears.map((y, i) => {
    let cum = 0;
    const data = yearly[y].map((v, m) => {
      if (parseInt(y) === currentYear && m > currentMonth) return null;
      cum += v; return Math.round(cum);
    });
    const isCurrent = parseInt(y) === currentYear;
    return {
      label: y, data,
      borderColor:     colors[i % colors.length],
      backgroundColor: isCurrent ? 'rgba(16,185,129,0.08)' : 'transparent',
      fill:            isCurrent,
      tension: .4, pointRadius: isCurrent ? 2 : 0, borderWidth: isCurrent ? 2 : 1.5,
      borderDash: isCurrent ? [] : [4, 3],
      spanGaps: false,
    };
  });

  try {
    annualChartInst = new Chart(document.getElementById('annualChart'), {
      type: 'line', data: { labels: months, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position:'bottom', labels:{ boxWidth:8, font:{size:9,family:'JetBrains Mono, monospace'}, color:'#9B978A', padding:10 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const y  = ctx.dataset.label;
                const m  = ctx.dataIndex;
                const mo = Math.round(monthly[y]?.[m] || 0);
                const cum = ctx.parsed.y || 0;
                return `${y}  ·  ${mo}${yUnit} ce mois  ·  ${cum}${yUnit} cumulé`;
              }
            }
          }
        },
        scales: {
          x: { ticks:{ font:{size:9,family:'JetBrains Mono, monospace'}, color:'#5E5B52' }, grid:{color:'rgba(243,239,228,.04)'} },
          y: { ticks:{ font:{size:9,family:'JetBrains Mono, monospace'}, color:'#5E5B52', callback: v => v + yUnit }, grid:{color:'rgba(243,239,228,.04)'} },
        },
      },
    });
  } catch (e) { annualChartInst = null; }
}

// ════════════════════════════════════════════════════
// ACTIVITIES LIST
// ════════════════════════════════════════════════════
export function renderActivities() {
  const grid     = document.getElementById('actsGrid');
  const gridFull = document.getElementById('actsGridFull');
  const infoEl   = document.getElementById('actsInfo');
  const infoFull = document.getElementById('actsInfoFull');

  const dateFilter   = window._actDateFilter;
  window._actDateFilter = null;
  const filteredActs = dateFilter
    ? VLState.allActivities.filter(a => a.start_date?.slice(0, 10) === dateFilter)
    : VLState.allActivities;

  if (infoEl) infoEl.textContent = `${VLState.allActivities.length} sorties`;
  if (infoFull) infoFull.textContent = dateFilter
    ? `${filteredActs.length} sortie${filteredActs.length !== 1 ? 's' : ''} · ${new Date(dateFilter + 'T12:00').toLocaleDateString('fr-FR', { day:'numeric', month:'long' })}`
    : `${VLState.allActivities.length} sorties`;

  const makeCard = (act) => {
    const d      = new Date(act.start_date_local);
    const ds     = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }).toUpperCase();
    const pace   = fmtP(act.average_speed);
    const distKm = (act.distance / 1000).toFixed(1);
    const meta   = [distKm+' km', fmtD(act.moving_time), act.total_elevation_gain>0?`D+ ${act.total_elevation_gain}m`:null, act.average_heartrate?`${Math.round(act.average_heartrate)} bpm`:null].filter(Boolean).join(' · ');
    const card   = document.createElement('div');
    card.className = 'act-card';
    card.onclick   = () => openAnalyse(act);
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

  if (grid) {
    grid.innerHTML = '';
    VLState.allActivities.slice(0, 4).forEach(act => grid.appendChild(makeCard(act)));
  }
  if (gridFull) {
    gridFull.innerHTML = '';
    filteredActs.forEach(act => gridFull.appendChild(makeCard(act)));
  }
}

// ════════════════════════════════════════════════════
// HISTORY ZIP IMPORT
// ════════════════════════════════════════════════════
function updateOnboardingSteps() {
  if (VLState.allActivities.length > 0)      { document.getElementById('step1').classList.add('done'); document.getElementById('step1-num').textContent = '✓'; }
  if (VLState.historyActivities.length > 0)  { document.getElementById('step2').classList.add('done'); document.getElementById('step2-num').textContent = '✓'; }
  if (VLState.userProfile.fc_max || VLState.userProfile.vo2max) { document.getElementById('step3').classList.add('done'); document.getElementById('step3-num').textContent = '✓'; }
}

async function parseAndSaveCSV(text, statsEl) {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return;
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const vals = []; let cur = '', inQ = false;
    for (const ch of line) { if (ch === '"') inQ = !inQ; else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; } else cur += ch; }
    vals.push(cur.trim());
    const obj = {}; headers.forEach((h, i) => obj[h] = vals[i] || ''); return obj;
  }).filter(r => { const t = r['Activity Type'] || r['Type'] || ''; return ['Run','Trail Run','Running'].includes(t); });

  VLState.historyActivities = rows;
  const totalKm   = rows.reduce((s, r) => s + (parseFloat(r['Distance']) || 0), 0) / 1000;
  const totalDplus = rows.reduce((s, r) => s + (parseFloat(r['Elevation Gain']) || 0), 0);
  const dates     = rows.map(r => r['Activity Date'] || r['Date']).filter(Boolean).sort();

  const { error } = await sb.from('activities_history').delete().eq('user_id', VLState.currentUser.id).then(() =>
    sb.from('activities_history').insert({ user_id: VLState.currentUser.id, data: rows, imported_at: new Date().toISOString() })
  );

  statsEl.innerHTML = `
    <div class="hsr"><span class="t2">Activités running importées</span><span class="mono">${rows.length}</span></div>
    <div class="hsr"><span class="t2">Distance totale</span><span class="mono">${totalKm.toFixed(0)} km</span></div>
    <div class="hsr"><span class="t2">D+ total</span><span class="mono">${totalDplus.toFixed(0)} m</span></div>
    <div class="hsr"><span class="t2">Période</span><span class="mono">${dates[0]?.split(' ')[0]||'?'} → ${dates[dates.length-1]?.split(' ')[0]||'?'}</span></div>
    ${error ? `<div style="color:var(--red);font-size:.7rem;margin-top:6px">Erreur sauvegarde : ${escapeHTML(String(error.message||error))}</div>` : `<div style="color:var(--green);font-family:var(--mono);font-size:.6rem;margin-top:6px">✓ Historique sauvegardé</div>`}`;

  renderAnnualChart();
  updateOnboardingSteps();
}

async function processZip(file) {
  const stats = document.getElementById('histStats');
  stats.style.display = 'block';
  stats.innerHTML = '<div class="mono">Lecture du ZIP en cours...</div>';
  try {
    const zip = await JSZip.loadAsync(file);
    let csvFile = zip.file('activities.csv');
    if (!csvFile) { const keys = Object.keys(zip.files); const k = keys.find(k => k.endsWith('activities.csv')); if (k) csvFile = zip.file(k); }
    if (!csvFile) { stats.innerHTML = '<div class="mono tr">activities.csv introuvable dans le ZIP</div>'; return; }
    const text = await csvFile.async('string');
    await parseAndSaveCSV(text, stats);
  } catch (e) { stats.innerHTML = `<div class="mono tr">Erreur : ${escapeHTML(e.message)}</div>`; }
}

export function handleZipDrop(e) {
  e.preventDefault();
  document.getElementById('zipDropZone').classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.name.endsWith('.zip')) processZip(f);
}

export function handleZipFile(e) {
  const f = e.target.files[0];
  if (f) processZip(f);
}

export async function loadHistoryFromDB() {
  const { data } = await sb.from('activities_history').select('data').eq('user_id', VLState.currentUser.id).single();
  if (data?.data) { VLState.historyActivities = data.data; renderAnnualChart(); }
}
