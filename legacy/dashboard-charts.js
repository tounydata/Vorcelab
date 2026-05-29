import { VLState, sb } from './app-state.js';
import { parseCsvDate, isRun } from './formatters.js';
import { computeActivityLoad } from './training-load.js';
import { openAnalyse } from './activity-analysis.js';

let annualChartInst = null;
let annualChartMode = 'km';
let chargeChartInst = null;

export function renderBar7j(activities, now) {
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
        window.Vorcelab?.renderActivities?.();
        if (window.Vorcelab) Vorcelab.navigate('activites');
      }
    });
  });
}

export function renderChargeChart(activities, fcMax, renfoLoads) {
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
            window.Vorcelab?.renderActivities?.();
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

export async function loadRenfoChargeData() {
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

export function setAnnualMode(mode) {
  annualChartMode = mode;
  const base = "font-family:var(--vl-mono);font-size:9px;font-weight:700;letter-spacing:.1em;padding:6px 12px;border-radius:4px;border:1px solid var(--vl-line-2);cursor:pointer;touch-action:manipulation";
  const btnKm = document.getElementById('annualBtnKm');
  const btnDp = document.getElementById('annualBtnDp');
  if (btnKm) btnKm.setAttribute('style', base + (mode === 'km' ? ';background:var(--vl-ember);color:var(--vl-ink)' : ';background:transparent;color:var(--vl-text-3)'));
  if (btnDp) btnDp.setAttribute('style', base + (mode === 'dp' ? ';background:var(--vl-ember);color:var(--vl-ink)' : ';background:transparent;color:var(--vl-text-3)'));
  renderAnnualChart();
}

export function renderAnnualChart() {
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
