import { VLState, sb } from './app-state.js';
import { analyzeGPX, populateRaceSelector } from './race-strategy.js';
import { fetchStreams, renderRaceComparison } from './activity-analysis.js';
import { escapeHTML, escapeAttr } from './security.js';
import { fmtD } from './formatters.js';
import { icon } from './icons.js';
import { hav } from './gpx-core.js';

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

export function showAddRaceForm() {
  const card = document.getElementById('addRaceCard');
  if(card) card.style.display = card.style.display==='none'?'block':'none';
}

export function renderCalendar() {
  const titleEl = document.getElementById('calMonthTitle');
  const gridEl = document.getElementById('calGrid');
  if(!titleEl || !gridEl) return;

  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  titleEl.textContent = `${months[calMonth]} ${calYear}`;

  const today = new Date();
  // First day of month (0=Sun..6=Sat → convert to Mon-based 0-6)
  const firstDay = new Date(calYear, calMonth, 1);
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // Mon=0

  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();

  // Build lookup: dateStr → race
  const raceByDate = {};
  (VLState.races||[]).forEach(r => { if(r.date) raceByDate[r.date.substring(0,10)] = r; });

  // Build activity lookup: dateStr → [activities]
  const actsByDate = {};
  (VLState.allActivities||[]).forEach(a => {
    const d = (a.start_date_local || a.start_date || '').slice(0, 10);
    if (!d) return;
    if (!actsByDate[d]) actsByDate[d] = [];
    actsByDate[d].push(a);
  });

  // Build renfo log lookup: dateStr → log
  const renfoByDate = {};
  VLState.renfoSessionLogs.forEach(l => {
    if (l.session_date) renfoByDate[l.session_date] = l;
  });

  let cells = '';
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  for(let i = 0; i < totalCells; i++){
    let dayNum, month = calMonth, year = calYear, otherMonth = false;
    if(i < startDow){ dayNum = daysInPrev - startDow + i + 1; month = calMonth-1; if(month<0){month=11;year=calYear-1;} otherMonth=true; }
    else if(i >= startDow + daysInMonth){ dayNum = i - startDow - daysInMonth + 1; month = calMonth+1; if(month>11){month=0;year=calYear+1;} otherMonth=true; }
    else { dayNum = i - startDow + 1; }

    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    const isToday = !otherMonth && year===today.getFullYear() && month===today.getMonth() && dayNum===today.getDate();
    const race = raceByDate[dateStr];
    const typeIcon = race ? (race.type==='Trail'||race.type==='Ultra'?icon('trail',10):icon('run',10)) : '';

    // Activity micro-chips (runs + renfo)
    const dayActs = actsByDate[dateStr] || [];
    const renfoLog = renfoByDate[dateStr];
    let chipsHtml = '';
    dayActs.forEach(a => {
      const km = (a.distance / 1000).toFixed(1);
      const isTrail = (a.sport_type||'').toLowerCase().includes('trail');
      chipsHtml += `<div style="display:flex;align-items:center;gap:2px;font-family:var(--vl-mono);font-size:9px;color:${isTrail?'var(--cyan)':'var(--green)'};line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${isTrail?icon('trail',9):icon('run',9)} ${km}k</div>`;
    });
    if (renfoLog) {
      chipsHtml += `<div style="display:flex;align-items:center;gap:2px;margin-top:1px;color:#7c3aed">${icon('renfo',14)}<span style="font-family:var(--vl-mono);font-size:8px;font-weight:700;letter-spacing:.05em">RENFO</span></div>`;
    }

    cells += `<div class="cal-cell${otherMonth?' other-month':''}${isToday?' today':''}${race?' has-event':''}" ${race?`onclick="openEventView('${escapeAttr(race.id)}')"`:''}>
      <div class="cal-day-num">${dayNum}</div>
      ${race ? `<div class="cal-event-dot" style="display:flex;align-items:center;gap:3px">${typeIcon} ${escapeHTML(race.name)}</div><div class="cal-event-type">${race.distance||'?'}km${race.elevation?` · ${race.elevation}m D+`:''}</div>` : ''}
      ${chipsHtml ? `<div style="margin-top:${race?'2px':'1px'}">${chipsHtml}</div>` : ''}
    </div>`;
  }
  gridEl.innerHTML = cells;

  // Upcoming VLState.races list
  const upcoming = (VLState.races||[]).filter(r=>r.date && new Date(r.date)>=new Date()).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,5);
  const upEl = document.getElementById('upcomingRaces');
  if(upEl){
    upEl.innerHTML = upcoming.length ? `
      <div class="clabel" style="margin-bottom:8px">Prochaines courses</div>
      ${upcoming.map(r=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="openEventView('${escapeAttr(r.id)}')">
        <div style="display:flex;align-items:center;color:${r.type==='Trail'||r.type==='Ultra'?'var(--cyan)':'var(--green)'}">${r.type==='Trail'||r.type==='Ultra'?icon('trail',18):icon('run',18)}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.85rem">${escapeHTML(r.name)}</div>
          <div class="mono t3" style="font-size:.6rem">${new Date(r.date).toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})} · ${r.distance||'?'}km${r.elevation?` · ${r.elevation}m D+`:''}</div>
        </div>
        <div class="mono" style="font-size:.7rem;color:var(--cyan)">${Math.ceil((new Date(r.date)-new Date())/(1000*60*60*24))}j →</div>
      </div>`).join('')}` : '<div class="mono t3">Aucune course à venir — clique sur "+ Ajouter une course"</div>';
  }
}

export function calNavMonth(dir) {
  calMonth += dir;
  if(calMonth > 11){ calMonth=0; calYear++; }
  if(calMonth < 0){ calMonth=11; calYear--; }
  renderCalendar();
}

function _openEventViewUI(race) {
  window._openEventRace = race;
  document.getElementById('calView').style.display = 'none';
  document.getElementById('eventView').style.display = 'block';
  const titleEl = document.getElementById('eventViewTitle');
  if (titleEl) titleEl.textContent = race.name.toUpperCase();
  const subEl = document.getElementById('eventViewSubtitle');
  if (subEl) {
    const typeLabel = race.type==='Trail'?'Trail':race.type==='Ultra'?'Ultra Trail':'Route';
    const dateStr = new Date(race.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    subEl.textContent = `${typeLabel} · ${dateStr}`;
  }
  const delBtn = document.getElementById('btnDeleteRace');
  if (delBtn) delBtn.onclick = () => deleteRace(race.id);
  const compSec = document.getElementById('eventComparisonSection');
  if (compSec) compSec.innerHTML = '';
}

export function openEventView(raceId) {
  const race = (VLState.races||[]).find(r=>String(r.id)===String(raceId));
  if (!race) return;
  // Si on vient du calendrier (calView visible) → Retour reviendra au calendrier
  const calV = document.getElementById('calView');
  if (calV && calV.style.display !== 'none') VLState._prevPanelStrategie = 'strategie';
  _openEventViewUI(race);
  history.replaceState(null, '', `#strategie/${raceId}`);
  prepareRace(race);
  if (race.strava_activity_id && race.gpx_data) {
    const actId = race.strava_activity_id;
    const actObj = VLState.allActivities.find(a=>String(a.id)===String(actId)) || {id:actId, moving_time:0};
    fetchStreams(actId).then(streams => {
      renderRaceComparison(actObj, streams, race, 'eventComparisonSection');
    }).catch(()=>{});
  }
}

function showEventSplash(race) {
  if (navigator.vibrate) navigator.vibrate(20);
  let traceSvg = '';
  if (race.gpx_data) {
    try {
      const pts = JSON.parse(race.gpx_data);
      const step = Math.max(1, Math.floor(pts.length/200));
      const sampled = pts.filter((_,i)=>i%step===0);
      const lats=sampled.map(p=>p.lat), lons=sampled.map(p=>p.lon);
      const minLat=Math.min(...lats), maxLat=Math.max(...lats), dLat=maxLat-minLat||0.001;
      const minLon=Math.min(...lons), maxLon=Math.max(...lons), dLon=maxLon-minLon||0.001;
      const VW=300, VH=180;
      const scale=Math.min(VW/dLon, VH/dLat)*0.82;
      const ox=(VW-dLon*scale)/2, oy=(VH-dLat*scale)/2;
      const tracePts=sampled.map(p=>`${(ox+(p.lon-minLon)*scale).toFixed(1)},${(oy+(maxLat-p.lat)*scale).toFixed(1)}`);
      traceSvg = `<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" style="width:min(85%,340px);height:160px;display:block;margin:0 auto"><polyline pathLength="1" points="${tracePts.join(' ')}" fill="none" stroke="var(--vl-ember)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="1" style="animation:drawRoute 700ms ease forwards;opacity:.45"/></svg>`;
    } catch(e){}
  }
  const diff = Math.ceil((new Date(race.date)-new Date())/86400000);
  const dateStr = new Date(race.date).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  const splash = document.createElement('div');
  splash.id = 'eventSplash';
  splash.style.cssText = 'position:fixed;inset:0;background:var(--vl-bg);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;gap:4px;cursor:pointer';
  splash.innerHTML = `
    <div style="font-family:var(--vl-mono);font-size:9px;color:var(--vl-ember);letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px;animation:fadeEl .3s ease forwards;opacity:0">${escapeHTML(race.type||'Trail')}</div>
    <div style="font-family:var(--vl-display);font-size:clamp(2rem,7vw,3.5rem);font-weight:800;text-transform:uppercase;text-align:center;line-height:.88;animation:fadeEl .35s ease .05s forwards;opacity:0">${escapeHTML(race.name)}</div>
    <div style="font-family:var(--vl-serif,'Fraunces'),serif;font-style:italic;font-size:.8rem;color:var(--vl-text-2);margin-top:6px;animation:fadeEl .35s ease .1s forwards;opacity:0">${dateStr}${race.distance?' · '+race.distance+' km':''}${race.elevation?' · D+ '+race.elevation+' m':''}</div>
    <div style="margin-top:16px;animation:fadeEl .35s ease .2s forwards;opacity:0">${traceSvg}</div>
    <div style="font-family:var(--vl-display);font-size:3.5rem;font-weight:800;color:var(--vl-ember);line-height:1;margin-top:8px;animation:fadeEl .4s ease .55s forwards;opacity:0">${diff<0?'PASSÉE':diff}</div>
    ${diff>=0?`<div style="font-family:var(--vl-mono);font-size:9px;color:var(--vl-text-3);letter-spacing:.16em;text-transform:uppercase;animation:fadeEl .4s ease .6s forwards;opacity:0">jours</div>`:''}
  `;
  document.body.appendChild(splash);
  const dismiss = () => {
    if (!splash.parentNode) return;
    splash.style.animation = 'splashOut .25s ease forwards';
    setTimeout(() => splash.remove(), 240);
  };
  splash.addEventListener('click', dismiss);
  setTimeout(dismiss, 750);
}

export function goToEvent(raceId) {
  const race = (VLState.races||[]).find(r=>String(r.id)===String(raceId));
  const cur = window.location.hash.slice(1) || 'dashboard';
  if (!cur.startsWith('strategie')) VLState._prevPanelStrategie = cur;
  history.pushState(null, '', '#strategie');
  window.Vorcelab?.showPanel?.('strategie');
  if (race) showEventSplash(race);
  // Refresh race data so GPX saved on another device is always picked up; splash covers the fetch
  loadRaces().then(() => openEventView(raceId));
}

export function backToCalendar() {
  document.getElementById('eventView').style.display = 'none';
  history.replaceState(null, '', '#strategie');
  document.getElementById('calView').style.display = 'block';
  VLState.currentRaceContext = null;
  document.getElementById('stratResult').style.display='none';
  document.getElementById('gpxDrop').style.display='flex';
  const ef=document.getElementById('editRaceForm');if(ef)ef.style.display='none';
  const rm=document.getElementById('raceMenu');if(rm)rm.style.display='none';
  const cs=document.getElementById('eventComparisonSection');if(cs)cs.innerHTML='';
  window._openEventRace=null;
  if(window._actMapInst2){window._actMapInst2.remove();window._actMapInst2=null;}
}

export function backFromStrategie() {
  const prev = VLState._prevPanelStrategie;
  const evV = document.getElementById('eventView');
  const calV = document.getElementById('calView');
  if (evV) evV.style.display = 'none';
  if (calV) calV.style.display = 'block';
  window._openEventRace = null;
  const ef = document.getElementById('editRaceForm');
  if (ef) ef.style.display = 'none';
  const cs = document.getElementById('eventComparisonSection');
  if (cs) cs.innerHTML = '';
  VLState.currentRaceContext = null;
  if (prev === 'strategie') {
    history.replaceState(null, '', '#strategie');
  } else {
    window.Vorcelab?.navigate?.('dashboard');
  }
}

export async function deleteRace(raceId) {
  if(!confirm('Supprimer cette course ?')) return;
  await sb.from('race_calendar').delete().eq('id', raceId);
  await loadRaces();
  backToCalendar();
  renderCalendar();
}

export function toggleEditRaceForm() {
  const form = document.getElementById('editRaceForm');
  if(!form) return;
  const isHidden = form.style.display === 'none' || !form.style.display;
  if(isHidden) {
    const race = VLState.currentRaceContext || window._openEventRace;
    if(race) {
      document.getElementById('editRaceName').value = race.name || '';
      document.getElementById('editRaceDate').value = race.date ? race.date.slice(0,10) : '';
      document.getElementById('editRaceType').value = race.type || 'Trail';
      document.getElementById('editRaceDist').value = race.distance != null ? race.distance : '';
      document.getElementById('editRaceDplus').value = race.elevation != null ? race.elevation : '';
      document.getElementById('editRaceGoal').value = race.goal_time || '';
    }
    form.style.display = 'grid';
  } else {
    form.style.display = 'none';
  }
}

export async function saveEditRace() {
  const race = VLState.currentRaceContext || window._openEventRace;
  if(!race?.id) return;
  const name = document.getElementById('editRaceName').value.trim();
  const date = document.getElementById('editRaceDate').value;
  const type = document.getElementById('editRaceType').value;
  const distance = parseFloat(document.getElementById('editRaceDist').value) || null;
  const elevation = parseInt(document.getElementById('editRaceDplus').value) || null;
  const goal_time = document.getElementById('editRaceGoal').value.trim() || null;
  if(!name || !date) { alert('Nom et date requis'); return; }
  const {error} = await sb.from('race_calendar').update({name,date,type,distance,elevation,goal_time}).eq('id', race.id);
  if(error){alert('Erreur: '+error.message);return;}
  await loadRaces();
  const updated = (VLState.races||[]).find(r=>String(r.id)===String(race.id));
  if(updated) {
    window._openEventRace = updated;
    if(VLState.currentRaceContext?.id===updated.id) VLState.currentRaceContext = updated;
    const titleEl = document.getElementById('eventViewTitle');
    if(titleEl) titleEl.innerHTML = `${updated.type==='Trail'||updated.type==='Ultra'?icon('trail',14):icon('run',14)} ${escapeHTML(updated.name)} — ${new Date(updated.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}`;
  }
  document.getElementById('editRaceForm').style.display = 'none';
  renderCalendar();
}

export function toggleRaceMenu(e) {
  if(e) e.stopPropagation();
  const menu = document.getElementById('raceMenu');
  if(!menu) return;
  const opening = menu.style.display === 'none';
  menu.style.display = opening ? 'block' : 'none';
  if(opening) {
    const saveItem = document.getElementById('raceMenuSaveGpx');
    if(saveItem) saveItem.style.display = (VLState.currentRaceContext?.id && window._pendingGpxSave) ? 'block' : 'none';
    const delGpxItem = document.getElementById('raceMenuDeleteGpx');
    if(delGpxItem) {
      const race = window._openEventRace;
      let hasGpx = false;
      try { if(race?.gpx_data){ const p=JSON.parse(race.gpx_data); hasGpx=Array.isArray(p)&&p.length>0; } } catch{}
      delGpxItem.style.display = hasGpx ? 'block' : 'none';
    }
  }
}

export function raceMenuChangeGpx() {
  const race = window._openEventRace;
  toggleRaceMenu();
  resetStrategy();
  VLState.currentRaceContext = race;
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('raceMenuWrap');
  const menu = document.getElementById('raceMenu');
  if(menu && menu.style.display !== 'none' && wrap && !wrap.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// ════════════════════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════════════════════

function toggleRaceForm() { const f=document.getElementById('raceForm'); if(f) f.classList.toggle('open'); else showAddRaceForm(); }

export async function loadRaces() {
  const {data} = await sb.from('race_calendar').select('*').eq('user_id',VLState.currentUser.id).order('date');
  if (data) { VLState.races=data; renderRaces(); populateRaceSelector(); renderCalendar(); }
}

export async function saveRace() {
  const race = {
    user_id:VLState.currentUser.id,
    name:document.getElementById('rName').value,
    date:document.getElementById('rDate').value,
    distance:parseFloat(document.getElementById('rDist').value)||null,
    elevation:parseInt(document.getElementById('rElev').value)||null,
    type:document.getElementById('rType').value,
    goal_time:document.getElementById('rGoal').value
  };
  if(!race.name||!race.date)return;
  const {error}=await sb.from('race_calendar').insert(race);
  if(!error){const rf=document.getElementById('raceForm');if(rf)rf.classList.remove('open');const arc=document.getElementById('addRaceCard');if(arc)arc.style.display='none';await loadRaces();}
}

function buildProjFromDB(p) {
  if (!p) return null;
  const cc = p.confidence==='good'?'var(--color-victory,#34d399)':p.confidence==='medium'?'var(--vl-amber)':'var(--color-alert,#e07c5e)';
  const nd = p.confidence==='good'?5:p.confidence==='medium'?3:1;
  const confDots = [0,1,2,3,4].map(i=>i<nd?`<span style="color:${cc}">&#9679;</span>`:'<span style="color:var(--vl-text-3)">&#9675;</span>').join('');
  return {...p, confDots, confidenceColor: cc};
}

// deleteRace defined in MONTHLY CALENDAR section above

export function renderRaces() {
  const list=document.getElementById('raceList');
  const nextWidget=document.getElementById('nextRaceWidget');
  if(!VLState.races.length){
    if(list) list.innerHTML='<div class="mono t3">Aucune course planifiée</div>';
    if(nextWidget) nextWidget.innerHTML='<div class="mono t3">Aucune course planifiée</div>';
    renderCalendar(); return;
  }
  const now=new Date();
  const upcoming=VLState.races.filter(r=>new Date(r.date)>=now).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const next=upcoming[0];
  if(next && nextWidget){
    const diff=Math.ceil((new Date(next.date)-now)/86400000);
    // gpx_data is stored as JSON array of {lat,lon,ele} — check it has actual points
    let gpxPts=null;
    try{ if(next.gpx_data){ const p=JSON.parse(next.gpx_data); if(Array.isArray(p)&&p.length>0) gpxPts=p; } }catch{}
    const hasGpx=!!gpxPts;
    const phase=diff<=7?{label:'SEMAINE DE COURSE',c:'var(--vl-ember)'}:diff<=21?{label:'AFFÛTAGE',c:'var(--vl-amber)'}:diff<=42?{label:'PRÉPARATION SPÉCIFIQUE',c:'var(--vl-growth)'}:{label:'CONSTRUCTION DE BASE',c:'var(--vl-text-2)'};
    const raceDate=new Date(next.date).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
    // Mini altimetry SVG — parse from JSON points (gpx_data is [{lat,lon,ele}])
    let miniAlti='';
    let gpxTrace='';
    if(gpxPts&&gpxPts.length>4){
      try{
        // Altimetry profile
        const step=Math.max(1,Math.floor(gpxPts.length/80));
        const eles=gpxPts.filter((_,i)=>i%step===0).map(p=>p.ele||0);
        const mn=Math.min(...eles),mx=Math.max(...eles),range=mx-mn||1;
        const W=100,H=36;
        const coords=eles.map((v,i)=>`${((i/(eles.length-1))*W).toFixed(1)},${(H-2-((v-mn)/range)*(H-6)).toFixed(1)}`);
        const pathD=`M${coords.join(' L')}`;
        miniAlti=`<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" width="100%" height="44" style="display:block;pointer-events:none"><defs><linearGradient id="maG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--vl-ember)" stop-opacity="0.35"/><stop offset="1" stop-color="var(--vl-ember)" stop-opacity="0"/></linearGradient></defs><path d="${pathD} L${W},${H} L0,${H} Z" fill="url(#maG)"/><path d="${pathD}" fill="none" stroke="var(--vl-ember)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/></svg>`;

        // 2D route trace — fills the empty zone between stats and altimetry
        const trStep=Math.max(1,Math.floor(gpxPts.length/300));
        const pts=gpxPts.filter((_,i)=>i%trStep===0);
        const lats=pts.map(p=>p.lat),lons=pts.map(p=>p.lon);
        const minLat=Math.min(...lats),maxLat=Math.max(...lats),dLat=maxLat-minLat||0.001;
        const minLon=Math.min(...lons),maxLon=Math.max(...lons),dLon=maxLon-minLon||0.001;
        const VW=240,VH=130;
        const scale=Math.min(VW/dLon,VH/dLat)*0.82;
        const ox=(VW-dLon*scale)/2,oy=(VH-dLat*scale)/2;
        const tracePts=pts.map(p=>`${(ox+(p.lon-minLon)*scale).toFixed(1)},${(oy+(maxLat-p.lat)*scale).toFixed(1)}`);
        gpxTrace=`<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;opacity:.22;pointer-events:none"><polyline points="${tracePts.join(' ')}" fill="none" stroke="var(--vl-ember)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      }catch(e){}
    }
    const proj=next._projection||buildProjFromDB(next.last_projection);
    nextWidget.innerHTML=`
    <div onclick='goToEvent("${next.id}")' style="position:relative;overflow:hidden;flex:1;display:flex;flex-direction:column;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent">
      <div style="position:relative;padding:10px 14px 0;flex-shrink:0">
        <span style="font-family:var(--vl-mono);font-size:8.5px;font-weight:700;letter-spacing:.16em;color:var(--vl-text-3);text-transform:uppercase">STRATÉGIE DE COURSE</span>
      </div>
      <div style="position:relative;flex:1;display:flex;min-height:0;overflow:hidden">
        <div style="flex:1.1;padding:10px 14px 14px;display:flex;flex-direction:column;min-width:0;overflow:hidden">
          <div style="font-family:var(--vl-mono);font-size:9px;color:var(--vl-ember);letter-spacing:.18em;text-transform:uppercase;margin-bottom:4px">${escapeHTML(next.type)} · COURSE VISÉE</div>
          <div style="font-family:var(--vl-display);font-size:clamp(1.8rem,3.5vw,2.6rem);font-weight:800;letter-spacing:.02em;text-transform:uppercase;line-height:.88;margin-bottom:6px">${escapeHTML(next.name)}</div>
          <div style="font-family:var(--vl-mono);font-size:.68rem;color:var(--vl-text-2);margin-bottom:10px">${raceDate}${next.distance?' · '+next.distance+' km':''}${next.elevation?' · D+ '+next.elevation+' m':''}</div>
          <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end">
            <div style="font-family:var(--vl-display);font-size:3.8rem;font-weight:800;color:var(--vl-ember);line-height:.82;letter-spacing:-.03em">${diff}</div>
            <div style="font-family:var(--vl-mono);font-size:9px;color:var(--vl-text-3);text-transform:uppercase;letter-spacing:.16em;margin-top:4px">JOURS</div>
            <div style="font-family:var(--vl-mono);font-size:8.5px;color:${phase.c};letter-spacing:.1em;text-transform:uppercase;font-weight:600;margin-top:4px;margin-bottom:12px">${phase.label}</div>
            <button onclick="event.stopPropagation();prepareRace('${next.id}')" style="background:var(--vl-ember);color:var(--vl-ink);border:none;border-radius:var(--vl-r-sm);padding:9px 14px;font-family:var(--vl-display);font-size:.9rem;font-weight:700;letter-spacing:.08em;cursor:pointer;touch-action:manipulation;width:100%;text-align:center">OUVRIR LA STRATÉGIE →</button>
          </div>
        </div>
        <div style="width:44%;border-left:1px solid var(--vl-line-2);display:flex;flex-direction:column;overflow:hidden;flex-shrink:0">
          ${proj?`<div style="padding:12px 12px 8px;flex-shrink:0">
            <div style="font-family:var(--vl-mono);font-size:9.5px;color:var(--vl-text-2);letter-spacing:.16em;margin-bottom:5px;text-transform:uppercase;font-weight:700">PROJECTION VORCELAB</div>
            <div style="font-family:var(--vl-display);font-size:clamp(2.2rem,4vw,3rem);font-weight:800;color:var(--color-victory,#34d399);letter-spacing:-.03em;line-height:.82">${fmtD(proj.cible)}</div>
            <div style="font-size:11px;font-family:var(--vl-mono);letter-spacing:2px;margin-top:6px">${proj.confDots}</div>
            ${proj.prudent&&proj.agressif?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              <span style="font-family:var(--vl-mono);font-size:7px;color:var(--vl-text-3)">PRUDENT <span style="color:var(--vl-text-2)">${fmtD(proj.prudent)}</span></span>
              <span style="font-family:var(--vl-mono);font-size:7px;color:var(--color-victory,#34d399);font-weight:700">CIBLE ${fmtD(proj.cible)}</span>
              <span style="font-family:var(--vl-mono);font-size:7px;color:var(--vl-text-3)">AGRESSIF <span style="color:var(--vl-text-2)">${fmtD(proj.agressif)}</span></span>
            </div>`:''}
          </div>`:''}
          ${gpxTrace?`<div style="flex:1;overflow:hidden;min-height:40px">${gpxTrace}</div>`:''}
          ${miniAlti?`<div style="position:relative;overflow:hidden;flex-shrink:0"><div style="position:absolute;bottom:0;left:0;right:0;height:50%;background:linear-gradient(to top,var(--vl-surf),transparent);z-index:1;pointer-events:none"></div>${miniAlti}</div>`:''}
        </div>
      </div>
    </div>`;
  } else { if(nextWidget) nextWidget.innerHTML='<div class="mono t3">Toutes les courses sont passées</div>'; }
  if(!list) { renderCalendar(); return; }
  list.innerHTML=VLState.races.map(r=>{
    const d=new Date(r.date),diff=Math.ceil((d-now)/86400000),past=diff<0;
    const color=past?'var(--text3)':diff<7?'var(--orange)':diff<30?'var(--yellow)':'var(--cyan)';
    let hasGpx=false;try{if(r.gpx_data){const _p=JSON.parse(r.gpx_data);hasGpx=Array.isArray(_p)&&_p.length>0;}}catch{}
    const hasActivity=!!r.strava_activity_id;

    // Smart buttons based on state
    let buttons='';
    if(!past){
      buttons+=`<button onclick="prepareRace('${r.id}')" class="btn-prepare">${hasGpx?icon('map',14)+' Voir stratégie':icon('map',14)+' Préparer'}</button>`;
    } else {
      if(hasGpx){
        buttons+=`<button onclick="prepareRace('${r.id}')" class="btn-prepare" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2)">${icon('chart',14)} Voir stratégie</button>`;
      } else {
        buttons+=`<button onclick="importOrgGpx('${r.id}')" class="btn-prepare" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2)">📥 GPX organisateur</button>`;
      }
      if(hasActivity){
        buttons+=`<button onclick="linkActivityFromRace('${r.id}')" class="btn-prepare" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2);font-size:.52rem">↺ Changer</button>`;
      } else {
        buttons+=`<button onclick="linkActivityFromRace('${r.id}')" class="btn-prepare" style="background:var(--purple);color:#fff;border-color:var(--purple)">🔗 Lier activité</button>`;
      }
    }

    const linkedAct=hasActivity?VLState.allActivities.find(a=>String(a.id)===String(r.strava_activity_id)):null;
    const onCardClick=linkedAct?`openAnalyse(${JSON.stringify(linkedAct).replace(/"/g,'&quot;')})`:hasGpx?`prepareRace('${r.id}')`:'';


    return `<div class="race-item" style="cursor:${onCardClick?'pointer':'default'};transition:background .15s"
      onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''"
      onclick="if(event.target.tagName!=='BUTTON'){${onCardClick}}">
      <div><div class="race-cd" style="color:${color}">${past?'✓':diff}</div><div class="race-cd-lbl">${past?'passée':'jours'}</div></div>
      <div class="race-info">
        <div class="race-name">${escapeHTML(r.name)}</div>
        <div class="race-meta">${d.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})} · ${r.distance||'?'}km · D+${r.elevation||'?'}m</div>
        <div class="race-tags">
          <span class="race-tag" style="border-color:${color}40;color:${color}">${escapeHTML(r.type)}</span>
          ${r.goal_time?`<span class="race-tag" style="border-color:var(--text3)40;color:var(--text2)">${icon('check',10)} ${escapeHTML(r.goal_time)}</span>`:''}
          ${hasGpx?`<span class="race-tag" style="border-color:var(--green)40;color:var(--green)">✓ GPX</span>`:''}
          ${hasActivity?`<span class="race-tag" style="border-color:var(--purple)40;color:var(--purple)">✓ Activité</span>`:''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
        ${buttons}
        <button onclick="deleteRace('${r.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:.75rem">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════
// PREPARE RACE — lien calendrier → stratégie
// ════════════════════════════════════════════════════
function showLinkRacePanel() {
  const panel = document.getElementById('linkRacePanel');
  if(panel) panel.style.display = panel.style.display==='none'?'block':'none';
}

async function linkGpxToRace(raceId, raceName) {
  if(!window._pendingGpxSave) {
    alert('Charge d\'abord un GPX avant de lier à un événement.');
    return;
  }
  const btn = document.getElementById('btnLinkRace');
  if(btn){btn.textContent='Sauvegarde...';btn.disabled=true;}
  const {error} = await sb.from('race_calendar')
    .update({gpx_data: JSON.stringify(window._pendingGpxSave)})
    .eq('id', raceId);
  const panel = document.getElementById('linkRacePanel');
  if(panel) panel.style.display='none';
  if(btn){
    if(error){btn.textContent='❌ Erreur';btn.disabled=false;}
    else{
      btn.textContent=`✓ Lié à ${raceName}`;
      btn.style.background='var(--green)';btn.style.color='#000';btn.style.border='none';
      const idx=VLState.races.findIndex(r=>r.id===raceId);
      if(idx>=0)VLState.races[idx].gpx_data=JSON.stringify(window._pendingGpxSave);
      VLState.currentRaceContext={id:raceId,name:raceName,gpx_data:JSON.stringify(window._pendingGpxSave)};
      renderRaces();
    }
  }
}

export async function saveGpxToRace() {
  if(!VLState.currentRaceContext?.id||!window._pendingGpxSave) return;
  const btn=document.getElementById('btnSaveGpx');
  if(btn){btn.textContent='Sauvegarde...';btn.disabled=true;}
  const {error}=await sb.from('race_calendar')
    .update({gpx_data: JSON.stringify(window._pendingGpxSave)})
    .eq('id', VLState.currentRaceContext.id);
  if(btn){
    if(error){btn.textContent='❌ Erreur';btn.style.background='var(--red)';}
    else{
      btn.textContent='✓ GPX associé !';
      btn.style.background='var(--cyan)';
      // Update local cache
      const idx=VLState.races.findIndex(r=>r.id===VLState.currentRaceContext.id);
      if(idx>=0)VLState.races[idx].gpx_data=JSON.stringify(window._pendingGpxSave);
      VLState.currentRaceContext.gpx_data=JSON.stringify(window._pendingGpxSave);
      renderRaces();
      setTimeout(()=>{if(btn){btn.textContent=`💾 Associé à ${VLState.currentRaceContext.name}`;btn.disabled=true;}},2000);
    }
  }
}

export async function deleteGpxFromRace() {
  const race = window._openEventRace;
  if(!race?.id) return;
  const {error} = await sb.from('race_calendar').update({gpx_data: null}).eq('id', race.id);
  if(error){ showToast('Erreur suppression GPX', 'error'); return; }
  const idx = VLState.races.findIndex(r=>r.id===race.id);
  if(idx>=0) VLState.races[idx].gpx_data = null;
  race.gpx_data = null;
  if(VLState.currentRaceContext?.id===race.id) VLState.currentRaceContext.gpx_data = null;
  renderRaces();
  showToast('GPX supprimé ✓', 'success');
}

export function importOrgGpx(raceOrId) {
  const race = (typeof raceOrId === 'string' || typeof raceOrId === 'number')
    ? (VLState.races||[]).find(r => String(r.id) === String(raceOrId))
    : raceOrId;
  if (!race) return;
  // Create hidden file input and trigger click
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gpx';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    showToast('Analyse du GPX...', 'info');
    const text = await file.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const trkpts = [...xml.querySelectorAll('trkpt')];
    if(!trkpts.length){ showToast('GPX invalide — aucun point trouvé', 'error'); return; }
    const points = trkpts.map(p=>({
      lat: parseFloat(p.getAttribute('lat')),
      lon: parseFloat(p.getAttribute('lon')),
      ele: parseFloat(p.querySelector('ele')?.textContent||0)
    }));
    // Sample every 5 points to reduce size
    const sampled = points.filter((_,i)=>i%5===0);
    const {error} = await sb.from('race_calendar')
      .update({gpx_data: JSON.stringify(sampled)})
      .eq('id', race.id);
    if(error){ showToast('Erreur sauvegarde GPX', 'error'); return; }
    await loadRaces();
    showToast(`GPX associé à ${race.name} ✓`, 'success');
  };
  input.click();
}

export async function linkActivityFromRace(raceOrId) {
  const race = (typeof raceOrId === 'string' || typeof raceOrId === 'number')
    ? (VLState.races||[]).find(r => String(r.id) === String(raceOrId))
    : raceOrId;
  if (!race) return;
  // Find activities close to race date (±3 days)
  const raceDate = new Date(race.date);
  const nearby = VLState.allActivities.filter(a => {
    const d = new Date(a.start_date);
    const diff = Math.abs(d - raceDate) / 86400000;
    return diff <= 3;
  });

  // Show modal with nearby activities
  const modal = document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:2rem';
  modal.onclick = e => { if(e.target===modal) document.body.removeChild(modal); };

  const inner = document.createElement('div');
  inner.style.cssText='background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r);padding:1.5rem;max-width:500px;width:100%;max-height:80vh;overflow-y:auto';
  inner.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <div style="font-family:var(--display);font-size:1.2rem">Lier à ${escapeHTML(race.name)}</div>
      <button onclick="this.closest('[style*=fixed]').remove()" class="hbtn">✕</button>
    </div>
    <div class="mono t2" style="margin-bottom:1rem;font-size:.62rem">Activités Strava dans les 3 jours autour du ${new Date(race.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long'})}</div>
    ${nearby.length ? nearby.map(a=>`
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px;cursor:pointer;transition:border-color .2s"
        onmouseover="this.style.borderColor='var(--purple)'"
        onmouseout="this.style.borderColor='var(--border)'"
        onclick="confirmLinkActivity('${escapeAttr(race.id)}','${escapeAttr(race.name)}',${Number(a.id)},this.closest('[style*=fixed]'))">
        <div style="font-weight:600;font-size:.85rem">${escapeHTML(a.name)}</div>
        <div class="mono t2" style="font-size:.62rem;margin-top:3px">${new Date(a.start_date_local).toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'})} · ${(a.distance/1000).toFixed(1)}km · ${fmtD(a.moving_time)} · +${a.total_elevation_gain||0}m</div>
      </div>`).join('')
    : `<div class="mono t3">Aucune activité trouvée dans les 3 jours autour de la course.<br><br>Vérifie que Strava est connecté et que l'activité est bien synchronisée.</div>`}`;

  modal.appendChild(inner);
  document.body.appendChild(modal);
}

export async function confirmLinkActivity(raceId, raceName, actId, modal) {
  const {error} = await sb.from('race_calendar')
    .update({strava_activity_id: actId})
    .eq('id', raceId);
  if(!error){
    await loadRaces();
    if(modal) modal.remove();
    // Trigger comparison in event view if it's open for this race
    const updatedRace = VLState.races.find(r=>String(r.id)===String(raceId));
    const compSection = document.getElementById('eventComparisonSection');
    if(updatedRace?.gpx_data && compSection) {
      showToast('Liaison effectuée, chargement de la comparaison…', 'info');
      try {
        const streams = await fetchStreams(actId);
        const actObj = VLState.allActivities.find(a=>String(a.id)===String(actId)) || {id:actId, moving_time:0};
        renderRaceComparison(actObj, streams, updatedRace, 'eventComparisonSection');
      } catch(e) { console.warn('comparison fetch failed', e); }
    } else {
      showToast('Activité liée ✓', 'success');
    }
  }
}

export function prepareRace(raceOrId) {
  const race = (typeof raceOrId === 'object' && raceOrId !== null)
    ? raceOrId
    : (VLState.races||[]).find(r => String(r.id) === String(raceOrId));
  if (!race) return;

  const cur = window.location.hash.slice(1) || 'dashboard';
  if (!cur.startsWith('strategie')) {
    VLState._prevPanelStrategie = cur;
    // pushState évite de déclencher hashchange (qui rappellerait openEventView/resetStrategy)
    history.pushState(null, '', '#strategie');
    window.Vorcelab?.showPanel?.('strategie');
  }

  // Ensure eventView is visible (when called from outside openEventView)
  const evV = document.getElementById('eventView');
  if (!evV || evV.style.display !== 'block') {
    _openEventViewUI(race);
  }

  // Stable URL for this race strategy
  history.replaceState(null, '', `#strategie/${race.id}`);

  // Reset UI state, then restore context AFTER reset (resetStrategy clears it)
  resetStrategy();
  VLState.currentRaceContext = race;

  if (race.gpx_data) {
    try {
      const points = JSON.parse(race.gpx_data);
      const validPts = points.filter(p => p.lat && p.lon && Math.abs(p.lat) > 0.001);
      if (validPts.length < 10) { showGpxUploadPrompt(race); return; }
      let d = 0;
      for(let i=1;i<validPts.length;i++) d += hav(validPts[i-1], validPts[i]);
      if (d < 100) { showGpxUploadPrompt(race); return; }
      document.getElementById('gpxDrop').style.display = 'none';
      const _sr = document.getElementById('stratResult');
      if (_sr) { _sr.style.display = 'block'; _sr.innerHTML = `<div class="loading" style="min-height:60vh"><div class="spinner"></div><div class="mono" style="margin-top:.5rem">Calcul de la stratégie…</div></div>`; }
      analyzeGPX(points, race.name);
    } catch(e) {
      showGpxUploadPrompt(race);
    }
  } else {
    showGpxUploadPrompt(race);
  }
}

function showGpxUploadPrompt(race) {
  const drop = document.getElementById('gpxDrop');
  drop.style.display = 'block';
  drop.innerHTML = `
    <div style="font-size:2rem;margin-bottom:.5rem">${icon('map',28)}</div>
    <div style="font-family:var(--display);font-size:1.3rem;letter-spacing:.03em;margin-bottom:.25rem">${escapeHTML(race.name)}</div>
    <div class="mono t2" style="margin-bottom:.75rem">Upload le GPX pour générer la stratégie</div>
    <div class="mono t3">Compatible OpenRunner · Strava · Garmin Connect</div>`;
  drop.onclick = ()=>document.getElementById('gpxFile').click();
}

// ════════════════════════════════════════════════════
// ZIP HANDLER
// ════════════════════════════════════════════════════
