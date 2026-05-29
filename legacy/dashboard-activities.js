import { VLState, FC_MAX_DEFAULT } from './app-state.js';
import { fmtP, fmtD, tL } from './formatters.js';
import { escapeHTML } from './security.js';
import { openAnalyse, fetchStreams } from './activity-analysis.js';

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
  <button class="btn-analyse" onclick="Vorcelab.openAnalyse(${JSON.stringify(act).replace(/"/g,'&quot;')})">Analyser cette sortie →</button>`;
}

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

export async function loadAerobicStat(weekActs, fcMax, fallback = false) {
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
