import { VLState, sb, SUPA_URL, FC_MAX_DEFAULT } from './app-state.js';
import { isRun, fmtD, fmtP, fmtT } from './formatters.js';
import { escapeHTML, escapeAttr } from './security.js';
import { hav, buildDetailedSections, minettiGradePenalty } from './gpx-core.js';
import { icon } from './icons.js';
import { buildSessionInsights, renderSessionQualityBlock } from './session-quality.js';
import { findSimilarActivities, computeProgressSignals, renderComparisonBlock } from './progress-comparison.js';

export async function fetchStreams(activityId) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) return { _authError: true };
  const userId = VLState.currentUser?.id;

  // Cache-first: read from DB if available
  if (userId) {
    const { data: cached } = await sb.from('activity_streams')
      .select('data')
      .eq('user_id', userId)
      .eq('activity_id', activityId)
      .maybeSingle();
    if (cached?.data && Object.keys(cached.data).length > 0) {
      return cached.data;
    }
  }

  // Fallback: fetch from Strava via edge function
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ activityId, keys: 'time,distance,altitude,heartrate,velocity_smooth,cadence,latlng' }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.warn('[VL] fetchStreams HTTP', r.status, r.statusText, body);
      if (r.status === 401) return { _authError: true };
      return {};
    }
    const data = await r.json();
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      console.warn('[VL] fetchStreams: réponse vide pour activité', activityId);
      return data ?? {};
    }
    // Store in DB cache (fire-and-forget, never blocks the caller)
    if (userId) {
      sb.from('activity_streams').upsert({
        user_id: userId,
        activity_id: activityId,
        data,
        cached_at: new Date().toISOString(),
      }, { onConflict: 'user_id,activity_id' }).then(({ error }) => {
        if (error) console.warn('[VL] fetchStreams cache write error:', error.message);
      });
    }
    return data;
  } catch(e) {
    console.warn('[VL] fetchStreams exception:', e);
    return {};
  }
}

import { fetchWeather } from './weather.js';
export { fetchWeather };

export function computeRaceContext(act, weather) {
  const fcMax=VLState.userProfile.fc_max||FC_MAX_DEFAULT;
  let factors=[],totalAdj=0;

  // Température — pénalité continue dès 15°C (Ely et al. 2007 : déclin dès ~13-15°C)
  // +0.5% par °C au-dessus de 15°C → 25°C = +5%, 30°C = +7.5%
  if(weather?.temp!=null){
    const a=Math.max(0,(weather.temp-15)*0.005);
    totalAdj+=a;
    factors.push({icon:icon('weather',14),label:'Température',value:`${weather.temp.toFixed(1)}°C`,adj:a>0.005?`+${(a*100).toFixed(1)}%`:'~0%',color:a>0.04?'var(--red)':a>0.02?'var(--orange)':'var(--green)'});
  }

  // Pluie — logarithmique : l'essentiel de l'effet vient des 2-3 premiers mm
  // min(3.5% à 10mm), log1p donne une courbe réaliste
  if(weather?.precip!=null){
    const a=Math.min(0.035,Math.log1p(weather.precip)*0.018);
    totalAdj+=a;
    factors.push({icon:icon('rain',14),label:'Pluie',value:`${weather.precip.toFixed(1)}mm`,adj:a>0.005?`+${(a*100).toFixed(1)}%`:'~0%',color:a>0.02?'var(--orange)':'var(--green)'});
  }

  // Vent — quadratique (drag aérodynamique ∝ v²)
  // (wind/30)² × 0.04 → 10km/h:0.4%, 20km/h:1.8%, 30km/h:4%, capé à 4.5%
  if(weather?.wind!=null){
    const a=Math.min(0.045,Math.pow(weather.wind/30,2)*0.04);
    totalAdj+=a;
    factors.push({icon:icon('wind',14),label:'Vent',value:`${weather.wind.toFixed(0)}km/h`,adj:`+${(a*100).toFixed(1)}%`,color:a>0.02?'var(--orange)':'var(--green)'});
  }

  // Dénivelé — formule Minetti calibrée (dp/(dk×1000)×5.5, cap 45%)
  const dp=act.total_elevation_gain||0,dk=(act.distance||1)/1000,ga=Math.min(0.45,dp/(dk*1000)*5.5);
  totalAdj+=ga;
  factors.push({icon:icon('elevation',14),label:'Dénivelé',value:`+${dp}m`,adj:`+${(ga*100).toFixed(1)}%`,color:ga>0.15?'var(--orange)':'var(--yellow)'});

  // Nuit — uniquement 21h-5h (vraie nuit, pas simplement "après 20h")
  const h=parseInt(act.start_date_local?.split('T')[1]?.split(':')[0]||12);
  if(h<5||h>=21){totalAdj+=0.02;factors.push({icon:icon('moon',14),label:'Nuit',value:`${h}h`,adj:'+2%',color:'var(--purple)'});}

  // Trail — +4% pour rugosité de surface (racines, rochers, instabilité)
  // réduit de +8% : le surcoût vertical est déjà capturé par le facteur dénivelé
  if(act.type==='TrailRun'){totalAdj+=0.04;factors.push({icon:icon('terrain',14),label:'Trail',value:'Terrain',adj:'+4%',color:'var(--orange)'});}

  const raw=act.average_speed>0?1000/act.average_speed:0,norm=raw/(1+totalAdj),nm=Math.floor(norm/60),ns=Math.round(norm%60);
  return {factors,totalAdj,paceNorm:`${nm}:${String(ns).padStart(2,'0')}`};
}

// ════════════════════════════════════════════════════
// LOCAL ACTIVITY ANALYSIS — NO EXTERNAL AI
// ════════════════════════════════════════════════════
export async function generateLocalActivitySummary(act, streams, ctx) {
  const fcMax = VLState.userProfile.fc_max || FC_MAX_DEFAULT;

  const zones = [0, 0, 0, 0, 0];
  const hrS = streams.heartrate?.data || [];

  if (hrS.length) {
    hrS.forEach(h => {
      const p = h / fcMax;
      if (p < .6) zones[0]++;
      else if (p < .7) zones[1]++;
      else if (p < .8) zones[2]++;
      else if (p < .9) zones[3]++;
      else zones[4]++;
    });

    const tot = hrS.length;
    zones.forEach((_, i) => zones[i] = Math.round(zones[i] / tot * 100));
  }

  const distKm = act.distance / 1000;
  const fcPct = act.average_heartrate ? Math.round(act.average_heartrate / fcMax * 100) : null;

  let intensityVerdict = 'intensité non évaluable sans fréquence cardiaque moyenne';

  if (fcPct !== null) {
    if (fcPct < 70) intensityVerdict = `intensité faible (${fcPct}% FCmax)`;
    else if (fcPct < 80) intensityVerdict = `intensité modérée (${fcPct}% FCmax)`;
    else if (fcPct < 88) intensityVerdict = `intensité élevée (${fcPct}% FCmax)`;
    else intensityVerdict = `intensité très élevée (${fcPct}% FCmax)`;
  }

  const actDate = new Date(act.start_date);

  const d28ago = new Date(actDate);
  d28ago.setDate(actDate.getDate() - 28);

  const d7ago = new Date(actDate);
  d7ago.setDate(actDate.getDate() - 7);

  const recentRuns = VLState.allActivities.filter(a => {
    const d = new Date(a.start_date);
    return isRun(a.type) && d >= d28ago && d < actDate;
  });

  const last7Runs = recentRuns.filter(a => new Date(a.start_date) >= d7ago);

  const km28 = recentRuns.reduce((s, a) => s + a.distance / 1000, 0).toFixed(0);
  const km7 = last7Runs.reduce((s, a) => s + a.distance / 1000, 0).toFixed(0);
  const dp28 = recentRuns.reduce((s, a) => s + (a.total_elevation_gain || 0), 0).toFixed(0);

  const z45 = zones[3] + zones[4];

  let effortComment = '';

  if (fcPct === null) {
    effortComment = 'La fréquence cardiaque moyenne est absente, donc le dosage cardio ne peut pas être jugé correctement.';
  } else if (fcPct < 70) {
    effortComment = 'Le dosage correspond plutôt à une sortie facile ou récupératrice.';
  } else if (fcPct < 80) {
    effortComment = 'Le dosage correspond à une endurance active ou à un effort modéré.';
  } else if (fcPct < 88) {
    effortComment = 'Le dosage est soutenu et demande une récupération correcte.';
  } else {
    effortComment = 'Le dosage est très intense et ne doit pas être répété trop souvent sans récupération.';
  }

  return [
    `${distKm.toFixed(2)} km en ${fmtD(act.moving_time)}, D+ ${act.total_elevation_gain || 0} m, allure moyenne ${fmtP(act.average_speed)}/km.`,
    `Fréquence cardiaque : moyenne ${act.average_heartrate || '?'} bpm, max ${act.max_heartrate || '?'} bpm, verdict ${intensityVerdict}.`,
    `Répartition cardio : Z1 ${zones[0]}%, Z2 ${zones[1]}%, Z3 ${zones[2]}%, Z4 ${zones[3]}%, Z5 ${zones[4]}%, soit ${z45}% en zones hautes Z4-Z5.`,
    `Contexte récent : ${recentRuns.length} sorties sur 28 jours, ${km28} km, D+ ${dp28} m ; sur 7 jours : ${last7Runs.length} sortie(s), ${km7} km.`,
    `${effortComment}`,
  ].join(' ');
}

// ════════════════════════════════════════════════════
// ANALYSE — PAGE COMPLÈTE (panel routing)
// ════════════════════════════════════════════════════
export async function openAnalyse(act) {
  VLState._prevPanel = window.location.hash.slice(1) || 'dashboard';
  const analyseEl = document.getElementById('analyseInner');
  analyseEl.innerHTML = `<div class="loading" style="min-height:300px"><div class="spinner"></div><div class="mono">Chargement des données...</div></div>`;
  window.navigate('analyse');
  try {

  const streams = await fetchStreams(act.id);
  // Fallback: use first latlng point from streams if start_latlng missing
  let lat0 = act.start_latlng?.[0], lon0 = act.start_latlng?.[1];
  const llStream = streams.latlng?.data;
  if((lat0==null||lon0==null) && Array.isArray(llStream) && llStream.length){
    lat0 = llStream[0][0]; lon0 = llStream[0][1];
  }
  const weather = (lat0!=null && lon0!=null)
    ? await fetchWeather(lat0, lon0, act.start_date_local)
    : null;

  const ctx = computeRaceContext(act, weather);
  const fcMax = VLState.userProfile.fc_max || FC_MAX_DEFAULT;
  const d = new Date(act.start_date_local);
  const dateStr = d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});

  // Zones FC
  let zd={Z1:0,Z2:0,Z3:0,Z4:0,Z5:0};
  const hrS=streams.heartrate?.data||[];
  if(hrS.length){hrS.forEach(h=>{const p=h/fcMax;if(p<.6)zd.Z1++;else if(p<.7)zd.Z2++;else if(p<.8)zd.Z3++;else if(p<.9)zd.Z4++;else zd.Z5++;});const tot=hrS.length;Object.keys(zd).forEach(k=>zd[k]=Math.round(zd[k]/tot*100));}

  // Chart data
  const altD=streams.altitude?.data||[],hrD=streams.heartrate?.data||[],distD=streams.distance?.data||[];
  const step=Math.max(1,Math.floor(altD.length/80));
  const cA=altD.filter((_,i)=>i%step===0),cH=hrD.filter((_,i)=>i%step===0),cDist=distD.filter((_,i)=>i%step===0).map(d=>(d/1000).toFixed(2));

  document.getElementById('analyseInner').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem;flex-wrap:wrap">
      <button class="hbtn" onclick="closeAnalyse()">← Retour</button>
      <div style="flex:1">
        <div style="font-family:var(--display);font-size:1.4rem;letter-spacing:.03em">${escapeHTML(act.name)}</div>
        <div class="mono t2" style="display:flex;align-items:center;gap:5px">${dateStr} · ${act.type==='TrailRun'?icon('trail',13):icon('run',13)} ${act.type==='TrailRun'?'Trail':'Route'}</div>
      </div>
      <button class="hbtn" id="btnLinkActivity" onclick="showLinkActivityPanel(${act.id})" style="background:var(--purple);color:#fff;border-color:var(--purple)">Lier à un événement</button>
    </div>
    <div id="linkActivityPanel" style="display:none;background:var(--bg3);border:1px solid var(--border2);border-radius:9px;padding:12px;margin-bottom:1rem">
      <div class="clabel" style="margin-bottom:8px">Associer à une course du calendrier</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap" id="linkActivityRaceList"></div>
    </div>

    <div class="a-stats">
      <div class="a-stat"><div class="a-sv tc">${(act.distance/1000).toFixed(2)} km</div><div class="a-sl">Distance</div></div>
      <div class="a-stat"><div class="a-sv">${fmtD(act.moving_time)}</div><div class="a-sl">Temps mvt</div></div>
      <div class="a-stat"><div class="a-sv">${fmtP(act.average_speed)}/km</div><div class="a-sl">Allure</div><div class="a-ss t3" style="font-size:.58rem">contextualisée : ${ctx.paceNorm}/km</div></div>
      ${act.total_elevation_gain?`<div class="a-stat"><div class="a-sv to">+${act.total_elevation_gain}m</div><div class="a-sl">D+</div></div>`:''}
      ${act.average_heartrate?`<div class="a-stat"><div class="a-sv">${Math.round(act.average_heartrate)}</div><div class="a-sl">FC moy</div><div class="a-ss">max ${act.max_heartrate||'—'} bpm</div></div>`:''}
      ${act.kilojoules?`<div class="a-stat"><div class="a-sv">${Math.round(act.kilojoules*.239)}</div><div class="a-sl">kcal</div></div>`:''}
    </div>

    <div class="stat-summary" id="summaryBox">
      <div class="summary-header"><div class="summary-icon">${icon('chart',18)}</div><div class="summary-title">Lecture de séance</div></div>
      <div class="summary-loading"><div class="spinner"></div><div>Calcul en cours...</div></div>
    </div>

    <!-- Facteurs de course -->
    <div class="ctx-widget">
      <div style="font-family:var(--display);font-size:1.05rem;letter-spacing:.03em;margin-bottom:10px">Facteurs de course</div>
      <div class="ctx-factors">${ctx.factors.map(f=>`<div class="ctx-factor"><span style="display:flex;align-items:center;flex-shrink:0">${f.icon}</span><div><div style="font-size:.7rem;font-weight:600">${f.label}</div><div style="font-size:.62rem;color:var(--text2)">${f.value}</div></div><div style="font-family:var(--mono);font-size:.7rem;font-weight:500;color:${f.color}">${f.adj}</div></div>`).join('')}</div>
      <div class="ctx-result">
        <div><div class="mono" style="font-size:.56rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Allure contextualisée</div><div style="font-family:var(--display);font-size:1.4rem;color:var(--text2)">${ctx.paceNorm}/km</div></div>
        <div style="font-size:.76rem;color:var(--text2);line-height:1.5">Conditions : <strong>+${(ctx.totalAdj*100).toFixed(0)}%</strong></div>
      </div>
      <div class="mono t3" style="margin-top:8px;font-size:.56rem;font-style:italic">Minetti et al., 2002 · Ely et al., 2007 · Lejeune et al., 1998</div>
    </div>

    <div class="grid-2 mt2">
      <div class="card">
        <div class="clabel">Profil altimétrique & FC</div>
        ${cA.length
          ? `<div class="chart-wrap" style="height:190px"><canvas id="apChart"></canvas></div>`
          : `<div class="mono t3" style="font-size:.72rem;padding:.75rem 0">Profil altimétrique non disponible — données de stream Strava absentes pour cette activité.<br>Vérifier la connexion Strava ou consulter la console.</div>`
        }
      </div>
      <div class="card">
        <div class="clabel">Répartition zones FC</div>
        ${hrD.length
          ? `<div class="chart-wrap" style="height:190px"><canvas id="azChart"></canvas></div>`
          : `<div class="mono t3" style="font-size:.72rem;padding:.75rem 0">Données FC non disponibles — cardiofréquencemètre absent ou stream Strava inaccessible.</div>`
        }
      </div>
    </div>

    ${(Array.isArray(llStream) && llStream.length>1) ? `<div class="card mt2"><div class="clabel">Carte du parcours</div><div id="actMap" style="height:300px;border-radius:8px;overflow:hidden;margin-top:8px"></div></div>` : ''}

    <!-- PROFIL ATHLÈTE PAR SECTION (si streams dispo) -->
    <div id="athleteProfileSection" class="mt2"></div>

    <!-- COMPARAISON PRÉVU/RÉEL (si course liée avec GPX) -->
    <div id="raceComparisonSection" class="mt2"></div>
    <!-- QUALITÉ DE SÉANCE (étape 4) -->
    <div id="sessionQualityBlock"></div>
    <!-- COMPARAISON HISTORIQUE (étape 5) -->
    <div id="progressCompBlock"></div>`;

  // Charts
  if(cA.length){new Chart(document.getElementById('apChart'),{type:'line',data:{labels:cDist,datasets:[{label:'Alt',data:cA,borderColor:'#00d4ff',backgroundColor:'rgba(0,212,255,.08)',fill:true,tension:.4,pointRadius:0,borderWidth:1.5,yAxisID:'yA'},...(cH.length?[{label:'FC',data:cH,borderColor:'#f43f5e',backgroundColor:'transparent',fill:false,tension:.4,pointRadius:0,borderWidth:1.5,borderDash:[3,2],yAxisID:'yH'}]:[])]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:8,font:{size:9},callback:v=>v+'km'},grid:{color:'rgba(255,255,255,.05)'}},yA:{position:'left',ticks:{font:{size:9},callback:v=>v+'m'},grid:{color:'rgba(255,255,255,.05)'}},yH:{position:'right',min:50,max:220,ticks:{font:{size:9}},grid:{display:false}}}}})}
  const zv=Object.values(zd);if(zv.some(v=>v>0)){new Chart(document.getElementById('azChart'),{type:'doughnut',data:{labels:['Z1 <60%','Z2 60-70%','Z3 70-80%','Z4 80-90%','Z5 >90%'],datasets:[{data:zv,backgroundColor:['#3b82f6','#2ecc71','#fbbf24','#ff6b35','#f43f5e'],borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10},color:'#6b7d94',padding:8}}}}})}

  // Activity map
  if(Array.isArray(llStream) && llStream.length>1 && document.getElementById('actMap')){
    try {
      if(window._actMapInst){window._actMapInst.remove();window._actMapInst=null;}
      const mapEl = document.getElementById('actMap');
      window._actMapInst = L.map(mapEl,{zoomControl:true,scrollWheelZoom:false});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(window._actMapInst);
      const step = Math.max(1, Math.floor(llStream.length/500));
      const pts = llStream.filter((_,i)=>i%step===0);
      const poly = L.polyline(pts,{color:'#00d4ff',weight:4,opacity:.9}).addTo(window._actMapInst);
      L.circleMarker(llStream[0],{radius:7,fillColor:'#2ecc71',color:'#fff',weight:2,fillOpacity:1}).addTo(window._actMapInst);
      L.circleMarker(llStream[llStream.length-1],{radius:7,fillColor:'#f43f5e',color:'#fff',weight:2,fillOpacity:1}).addTo(window._actMapInst);
      window._actMapInst.fitBounds(poly.getBounds(),{padding:[18,18]});
      setTimeout(()=>window._actMapInst&&window._actMapInst.invalidateSize(), 80);
    } catch(e){ console.warn('Map render failed', e); }
  }

  // Athlete profile by section (VAM, recovery, etc.)
  renderAthleteProfile(streams, act);

  // Check if this activity is linked to a race — reload fresh from DB first
  await window.Vorcelab?.loadRaces?.();
  const linkedRace = VLState.races.find(r => String(r.strava_activity_id) === String(act.id));
  if(linkedRace?.gpx_data) {
    renderRaceComparison(act, streams, linkedRace);
  }
  // Always populate link panel with all VLState.races (so user can re-link or attach to any course)
  const linkList = document.getElementById('linkActivityRaceList');
  if(linkList) {
    const sorted = [...VLState.races].sort((a,b)=>new Date(b.date)-new Date(a.date));
    linkList.innerHTML = sorted.length
      ? sorted.map(r=>`<button class="race-sel-btn" data-raceid="${r.id}" data-racename="${escapeAttr(r.name)}" data-actid="${act.id}" onclick="linkActivityToRace(this.dataset.raceid, this.dataset.racename, parseInt(this.dataset.actid))">${icon('calendar',13)} ${escapeHTML(r.name)} · ${new Date(r.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}</button>`).join('')
      : '<span class="mono t3">Aucune course dans le calendrier — ajoutes-en une depuis l\'onglet Calendrier</span>';
  }

// Local summary async
const summaryText = await generateLocalActivitySummary(act, streams, ctx);
const summaryBox = document.getElementById('summaryBox');
if (summaryBox) {
  summaryBox.innerHTML = `
    <div class="summary-header">
      <div class="summary-icon">${icon('chart',18)}</div>
      <div class="summary-title">Lecture de séance</div>
    </div>
    <div class="summary-text">${escapeHTML(summaryText)}</div>
  `;

  // Étape 4 — Qualité de séance
  const sqEl = document.getElementById('sessionQualityBlock');
  if (sqEl) sqEl.innerHTML = renderSessionQualityBlock(buildSessionInsights(act, streams, fcMax));

  // Étape 5 — Comparaison historique
  const similar = findSimilarActivities(act, VLState.allActivities);
  const pcEl = document.getElementById('progressCompBlock');
  if (pcEl) pcEl.innerHTML = renderComparisonBlock(act, similar, computeProgressSignals(act, similar));
}
  } catch(e) {
    console.error('[VL] openAnalyse error:', e);
    const inner = document.getElementById('analyseInner');
    if (inner) inner.innerHTML = `<div class="loading" style="min-height:300px"><div class="mono t2" style="text-align:center">Impossible de charger l'analyse.<br><small style="opacity:.6">${e?.message || 'Erreur réseau'}</small></div><button class="hbtn" style="margin-top:1rem" onclick="closeAnalyse()">← Retour</button></div>`;
  }
} // ferme openAnalyse()

export function showLinkActivityPanel(actId) {
  const panel = document.getElementById('linkActivityPanel');
  if(panel) panel.style.display = panel.style.display==='none'?'block':'none';
}

export async function linkActivityToRace(raceId, raceName, actId) {
  const btn = document.getElementById('btnLinkActivity');
  if(btn){btn.textContent='Liaison...';btn.disabled=true;}
  const {error} = await sb.from('race_calendar')
    .update({strava_activity_id: actId})
    .eq('id', raceId);
  const panel = document.getElementById('linkActivityPanel');
  if(panel) panel.style.display='none';
  if(!error){
    // Reload VLState.races from DB to ensure persistence
    await window.Vorcelab?.loadRaces?.();
    if(btn){
      btn.textContent=`✓ Lié à ${raceName}`;
      btn.style.background='var(--green)';btn.style.color='#000';btn.style.borderColor='var(--green)';
    }
    // Now check if linked race has GPX and show comparison
    const linkedRace = VLState.races.find(r=>r.id===raceId);
    if(linkedRace?.gpx_data){
      const streams=await fetchStreams(actId);
      renderRaceComparison({id:actId,moving_time:0}, streams, linkedRace);
    }
  } else if(btn){
    btn.textContent='❌ Erreur';btn.disabled=false;
  }
}

// ────────────────────────────────────────────────────
// VAM COMPUTATION — pure function, no side effects
// ────────────────────────────────────────────────────
export function computeVAMFromStreams(streams) {
  const altD=streams.altitude?.data||[], hrD=streams.heartrate?.data||[];
  const velD=streams.velocity_smooth?.data||[], distD=streams.distance?.data||[];
  const timeD=streams.time?.data||[];
  if(!altD.length || !velD.length) return null;
  if(!timeD.length || timeD.length !== altD.length) {
    console.warn('[VL] computeVAMFromStreams: stream temps absent ou taille incompatible — VAM non calculée');
    return null;
  }

  let uphillSections=[], downhillSections=[], recoveries=[];
  let inUphill=false, uphillStart=null;
  const WIN=Math.min(30, Math.floor(altD.length/10));

  for(let i=WIN; i<altD.length-WIN; i++){
    const elevN=altD[i+WIN]-altD[i], distN=distD[i+WIN]-distD[i];
    const grade=distN>0 ? elevN/distN*100 : 0;
    if(grade>4 && !inUphill){
      inUphill=true; uphillStart={idx:i, alt:altD[i], dist:distD[i], time:timeD[i]};
    } else if(grade<=1.5 && inUphill){
      inUphill=false;
      const dAlt=altD[i]-uphillStart.alt, dTime=timeD[i]-uphillStart.time;
      if(dAlt>10 && dTime>0){
        const vam=Math.round(dAlt/(dTime/3600));
        const avgHR=hrD.length ? Math.round(hrD.slice(uphillStart.idx,i).reduce((a,b)=>a+b,0)/(i-uphillStart.idx)) : null;
        uphillSections.push({vam, dAlt:Math.round(dAlt), dist:Math.round(distD[i]-uphillStart.dist), avgHR});
        if(hrD.length){
          const hrAtTop=hrD[i]||0, hrAfter60=hrD[Math.min(i+60,hrD.length-1)]||0;
          if(hrAtTop>0) recoveries.push({drop:hrAtTop-hrAfter60, hrAtTop, hrAfter60});
        }
      }
    }
    if(grade<-5){
      const avgVel=velD.slice(i,i+30).reduce((a,b)=>a+b,0)/30;
      downhillSections.push({speed:+(avgVel*3.6).toFixed(1), grade:+grade.toFixed(1)});
    }
  }

  if(!uphillSections.length && !recoveries.length) return null;

  return {
    uphillSections, downhillSections, recoveries,
    avgVAM:     uphillSections.length ? Math.round(uphillSections.reduce((a,b)=>a+b.vam,0)/uphillSections.length) : null,
    maxVAM:     uphillSections.length ? Math.max(...uphillSections.map(s=>s.vam)) : null,
    avgRecovery:recoveries.length ? Math.round(recoveries.reduce((a,b)=>a+b.drop,0)/recoveries.length) : null,
    avgDownhill:downhillSections.length ? +(downhillSections.reduce((a,b)=>a+b.speed,0)/downhillSections.length).toFixed(1) : null,
  };
}

// ────────────────────────────────────────────────────
// AUTO-CALIBRATION — bootstrap VAM from last N trail activities
// Called from app.js on init (if vam_avg null) and after sync
// ────────────────────────────────────────────────────
export async function autoCalibrate(activities, topN = 10) {
  if(!VLState.currentUser?.id) return null;
  const candidates = (activities||[])
    .filter(a => (a.type||a.sport_type||'').toLowerCase().includes('trail') && (a.total_elevation_gain||0) > 100)
    .slice(0, topN);
  if(!candidates.length) return null;

  const allVAMs=[], allRecoveries=[];
  for(const act of candidates) {
    const streams = await fetchStreams(act.id);
    if(!Object.keys(streams).length) {
      if(allVAMs.length === 0) {
        console.warn('[VL] autoCalibrate: streams inaccessibles (Strava non connecté?), arrêt');
        return null;
      }
      break;
    }
    const r = computeVAMFromStreams(streams);
    if(r?.avgVAM) {
      allVAMs.push(r.avgVAM);
      if(r.avgRecovery != null) allRecoveries.push(r.avgRecovery);
    }
  }
  if(!allVAMs.length) return null;

  const avgVAM    = Math.round(allVAMs.reduce((a,b)=>a+b,0)/allVAMs.length);
  const maxVAM    = Math.max(...allVAMs);
  const avgRecovery = allRecoveries.length ? Math.round(allRecoveries.reduce((a,b)=>a+b,0)/allRecoveries.length) : null;

  Object.assign(VLState.userProfile, {vam_avg:avgVAM, vam_max:maxVAM, ...(avgRecovery!=null?{recovery_drop_avg:avgRecovery}:{})});
  await sb.from('profiles').upsert({
    id: VLState.currentUser.id,
    vam_avg: avgVAM, vam_max: maxVAM,
    ...(avgRecovery!=null ? {recovery_drop_avg:avgRecovery} : {}),
  });
  console.info(`[VL] VAM calibré : ${avgVAM} m/h (${allVAMs.length}/${candidates.length} activités)`);
  return {avgVAM, maxVAM, avgRecovery, processed:allVAMs.length, total:candidates.length};
}

export function renderAthleteProfile(streams, act) {
  const section = document.getElementById('athleteProfileSection');
  if(!section) return;

  const vamData = computeVAMFromStreams(streams);

  if(!vamData) return;
  const {uphillSections, downhillSections, recoveries, avgVAM, maxVAM, avgRecovery, avgDownhill} = vamData;

  if(!uphillSections.length && !recoveries.length) {
    section.innerHTML = `<div class="card"><div class="clabel">Profil athlète</div><div class="mono t3" style="font-size:.75rem;padding:8px 0">Pas de montées significatives détectées sur cette sortie.</div></div>`;
    return;
  }

  // Level assessment
  const vamLevel = maxVAM > 1000 ? {l:'Excellent', c:'var(--green)'} : maxVAM > 700 ? {l:'Bon', c:'var(--cyan)'} : maxVAM > 400 ? {l:'Moyen', c:'var(--yellow)'} : {l:'À développer', c:'var(--orange)'};
  const recovLevel = avgRecovery > 30 ? {l:'Rapide', c:'var(--green)'} : avgRecovery > 20 ? {l:'Correct', c:'var(--cyan)'} : avgRecovery > 10 ? {l:'Lent', c:'var(--yellow)'} : {l:'Très lent', c:'var(--orange)'};

  section.innerHTML = `
    <div class="card">
      <div class="clabel">Profil athlète — extrait de cette sortie</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:1rem">
        ${avgVAM ? `<div class="s-stat"><div class="s-sv" style="color:${vamLevel.c}">${avgVAM} m/h</div><div class="s-sl">VAM moyenne montée</div><div class="mono t3" style="font-size:.58rem">${vamLevel.l} · max ${maxVAM} m/h</div></div>` : ''}
        ${avgRecovery ? `<div class="s-stat"><div class="s-sv" style="color:${recovLevel.c}">${avgRecovery} bpm</div><div class="s-sl">Récup FC / min post-montée</div><div class="mono t3" style="font-size:.58rem">${recovLevel.l}</div></div>` : ''}
        ${avgDownhill ? `<div class="s-stat"><div class="s-sv tc">${avgDownhill} km/h</div><div class="s-sl">Vitesse moy descente</div></div>` : ''}
        ${uphillSections.length ? `<div class="s-stat"><div class="s-sv">${uphillSections.length}</div><div class="s-sl">Montées analysées</div></div>` : ''}
      </div>
      ${avgVAM ? `<div style="font-size:.74rem;color:var(--text2);line-height:1.6">
        <strong>Grimpeur :</strong> VAM moyenne ${avgVAM} m/h
        ${avgVAM > 700 ? ' — niveau trail compétitif.' : avgVAM > 400 ? ' — bon niveau trail loisir.' : ' — marge de progression en montée.'}
        ${avgRecovery ? `<br><strong>Récupération cardiaque :</strong> −${avgRecovery} bpm/min après montée — ${avgRecovery > 25 ? 'excellente capacité de récup intra-effort.' : avgRecovery > 15 ? 'capacité correcte.' : 'à travailler — voir programme Récup dans Renfo.'}` : ''}
      </div>` : ''}
    </div>`;
}

export async function renderRaceComparison(act, streams, race, targetId) {
  const section = document.getElementById(targetId||'raceComparisonSection')||document.getElementById('eventComparisonSection');
  if(!section || !race.gpx_data) return;

  let gpxPts;
  try { gpxPts = JSON.parse(race.gpx_data); } catch { return; }
  if (!gpxPts || gpxPts.length < 10) return;

  const cumDist=[0];
  for(let i=1;i<gpxPts.length;i++) cumDist.push(cumDist[i-1]+hav(gpxPts[i-1],gpxPts[i]));
  const totalDist=cumDist[cumDist.length-1];
  if (totalDist < 100) return;

  const kmSecs=[];let segTarget=500,prevIdx=0;
  for(let i=0;i<cumDist.length;i++){
    if(cumDist[i]>=segTarget||i===cumDist.length-1){
      let sdp=0,sdm=0;
      for(let j=prevIdx+1;j<=i;j++){if(gpxPts[j]?.ele&&gpxPts[j-1]?.ele){const diff=gpxPts[j].ele-gpxPts[j-1].ele;if(diff>0)sdp+=diff;else sdm+=Math.abs(diff);}}
      const segDist=cumDist[i]-cumDist[prevIdx];
      const elevChange=gpxPts[i]?.ele&&gpxPts[prevIdx]?.ele?gpxPts[i].ele-gpxPts[prevIdx].ele:0;
      const grade=segDist>0?(elevChange/segDist)*100:0;
      kmSecs.push({startKm:+(cumDist[prevIdx]/1000).toFixed(2),endKm:+(cumDist[i]/1000).toFixed(2),dist:segDist,dplus:Math.round(sdp),dminus:Math.round(sdm),grade:+grade.toFixed(1)});
      prevIdx=i;segTarget=cumDist[i]+500;
    }
  }

  const sections=buildDetailedSections(kmSecs);
  const totalDplus=sections.reduce((a,s)=>a+(s.dplus||0),0);
  const totalDminus=sections.reduce((a,s)=>a+(s.dminus||0),0);

  let basePaceS=320;
  if(race.goal_time){
    const parts=race.goal_time.split(/[h:]/);
    let gs=0;
    if(parts.length===2)gs=parseInt(parts[0])*60+parseInt(parts[1]);
    else if(parts.length===3)gs=parseInt(parts[0])*3600+parseInt(parts[1])*60+(parseInt(parts[2])||0);
    if(gs>0){
      const tf=sections.reduce((a,s)=>a+(1+minettiGradePenalty(s.grade/100))*s.dist/1000,0);
      basePaceS=tf>0?gs/tf:gs/(totalDist/1000);
    }
  } else if(VLState.userProfile.prs?.semi?.timeS){
    const isTrail=/trail|ultra/i.test(race.type||'');
    basePaceS=VLState.userProfile.prs.semi.timeS/21097*1000*(isTrail?1.18:1.0);
  }

  const predicted=sections.map(s=>{
    return Math.round(basePaceS*(1+minettiGradePenalty(s.grade/100))*s.dist/1000);
  });

  const distD=streams.distance?.data||[];
  const timeD=streams.time?.data||[];
  const useTimeStream = timeD.length > 0 && timeD.length === distD.length;
  const actual=sections.map(s=>{
    if(!distD.length) return null;
    const startIdx=distD.findIndex(d=>d>=s.startKm*1000);
    const endIdx=distD.findIndex(d=>d>=s.endKm*1000);
    if(startIdx<0||endIdx<0||endIdx<=startIdx) return null;
    return useTimeStream ? timeD[endIdx]-timeD[startIdx] : endIdx-startIdx;
  });

  const hrD=streams.heartrate?.data||[];
  const sectionHR=sections.map(s=>{
    if(!hrD.length||!distD.length) return null;
    const si=distD.findIndex(d=>d>=s.startKm*1000);
    const ei=distD.findIndex(d=>d>=s.endKm*1000);
    if(si<0||ei<0||ei<=si) return null;
    const slice=hrD.slice(si,ei);
    return slice.length ? Math.round(slice.reduce((a,b)=>a+b,0)/slice.length) : null;
  });

  // Calorie estimation: weight × (dist_km + D+/100 + D-/200) — Minetti km-equivalent model
  const weight = VLState.userProfile.weight || 70;
  const predCal = Math.round(weight * (totalDist/1000 + totalDplus/100 + totalDminus/200));
  const actCal = act.calories && act.calories > 0 ? act.calories : null;
  const calDiff = actCal ? Math.round((actCal - predCal) / predCal * 100) : null;

  // Fetch historical weather for race start location + date (fire-and-forget, don't block render)
  let weather = null;
  const startPt = gpxPts.find(p=>p.lat&&p.lon);
  const raceDate = race.date || act.start_date;
  if (startPt && raceDate) {
    weather = await fetchWeather(startPt.lat, startPt.lon, raceDate).catch(()=>null);
  }

  const cols={up:'var(--orange)',down:'var(--purple)',flat:'var(--cyan)'};
  const icons={up:icon('elevation',13),down:icon('back',13),flat:icon('run',13)};

  const rows = sections.map((s,i) => {
    const pred=predicted[i], real=actual[i];
    const diff=real&&pred ? Math.round((real-pred)/pred*100) : null;
    const diffColor=diff===null?'var(--text3)':Math.abs(diff)<=10?'var(--green)':Math.abs(diff)<=25?'var(--yellow)':'var(--red)';
    const diffIcon=diff===null?'—':diff>25?icon('warning',11):diff>10?'~':'✓';
    return `<tr>
      <td style="color:${cols[s.type]}">${icons[s.type]} ${s.startKm.toFixed(1)}→${s.endKm.toFixed(1)} km</td>
      <td class="mono">${s.type==='up'?`+${s.dplus}m`:s.type==='down'?`-${s.dminus}m`:'—'}</td>
      <td class="mono">${fmtT(pred)}</td>
      <td class="mono">${real?fmtT(real):'—'}</td>
      <td class="mono" style="color:${diffColor};font-weight:600">${diff!==null?(diff>0?'+':'')+diff+'% '+diffIcon:'—'}</td>
      <td class="mono t2">${sectionHR[i]?sectionHR[i]+' bpm':'—'}</td>
    </tr>`;
  }).join('');

  const validDiffs=sections.map((_,i)=>{const p=predicted[i],r=actual[i];return r&&p?(r-p)/p*100:null;}).filter(d=>d!==null);
  const uphillDiffs=sections.map((s,i)=>s.type==='up'&&actual[i]&&predicted[i]?(actual[i]-predicted[i])/predicted[i]*100:null).filter(d=>d!==null);
  const downDiffs=sections.map((s,i)=>s.type==='down'&&actual[i]&&predicted[i]?(actual[i]-predicted[i])/predicted[i]*100:null).filter(d=>d!==null);
  const flatDiffs=sections.map((s,i)=>s.type==='flat'&&actual[i]&&predicted[i]?(actual[i]-predicted[i])/predicted[i]*100:null).filter(d=>d!==null);
  const avgUpDiff=uphillDiffs.length?Math.round(uphillDiffs.reduce((a,b)=>a+b,0)/uphillDiffs.length):null;
  const avgDownDiff=downDiffs.length?Math.round(downDiffs.reduce((a,b)=>a+b,0)/downDiffs.length):null;
  const avgFlatDiff=flatDiffs.length?Math.round(flatDiffs.reduce((a,b)=>a+b,0)/flatDiffs.length):null;

  const sportType=(VLState.currentRaceContext||window._openEventRace)?.type||race.type||'Trail';
  const calibChips=[
    avgUpDiff!==null?`${icon('elevation',12)} Montées ${avgUpDiff>0?'+':''}${avgUpDiff}% (×${(1+avgUpDiff/100).toFixed(2)})`:'',
    avgDownDiff!==null?`${icon('back',12)} Descentes ${avgDownDiff>0?'+':''}${avgDownDiff}% (×${(1+avgDownDiff/100).toFixed(2)})`:'',
    avgFlatDiff!==null?`${icon('run',12)} Plat ${avgFlatDiff>0?'+':''}${avgFlatDiff}% (×${(1+avgFlatDiff/100).toFixed(2)})`:'',
  ].filter(Boolean);

  const weatherAlerts=weather?[
    weather.temp>=28?`${icon('warning',13)} Chaleur importante — impact direct sur la FC et le chrono`:'',
    weather.temp<=3?`${icon('weather',13)} Froid extrême — rigidité musculaire, économie de course dégradée`:'',
    weather.wind>=30?`${icon('wind',13)} Vent fort — pénalise les sections exposées`:'',
    weather.precip>=3?`${icon('rain',13)} Pluie significative — sol glissant, freinage en descente`:'',
  ].filter(Boolean):[];

  const weatherHTML=weather?`
    <div class="card" style="background:var(--bg3);margin-top:12px">
      <div class="clabel" style="margin-bottom:.5rem;display:flex;align-items:center;gap:5px">${icon('weather',14)} Conditions le jour de course</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:${weatherAlerts.length?'8px':'0'}">
        ${weather.temp!==null?`<span class="mono" style="font-size:.78rem;display:flex;align-items:center;gap:3px">${icon('weather',12)} ${weather.temp}°C</span>`:''}
        ${weather.wind!==null?`<span class="mono" style="font-size:.78rem;display:flex;align-items:center;gap:3px">${icon('wind',12)} ${weather.wind} km/h</span>`:''}
        ${weather.precip!==null?`<span class="mono" style="font-size:.78rem;display:flex;align-items:center;gap:3px">${icon('rain',12)} ${weather.precip} mm</span>`:''}
      </div>
      ${weatherAlerts.map(a=>`<div class="mono t3" style="font-size:.6rem;margin-top:4px;color:var(--yellow)">${a}</div>`).join('')}
    </div>`:'';

  const calHTML=`
    <div class="card" style="background:var(--bg3);margin-top:12px">
      <div class="clabel" style="margin-bottom:.5rem;display:flex;align-items:center;gap:5px">${icon('activity',14)} Dépense énergétique</div>
      <div style="display:grid;grid-template-columns:${actCal?'1fr 1fr 1fr':'1fr'};gap:8px">
        <div class="s-stat"><div class="s-sv">${predCal}</div><div class="s-sl">Prévu (kcal)</div><div style="font-size:.55rem;color:var(--text3)">Modèle Minetti · ${weight}kg</div></div>
        ${actCal?`<div class="s-stat"><div class="s-sv">${actCal}</div><div class="s-sl">Réel Strava (kcal)</div></div>`:''}
        ${calDiff!==null?`<div class="s-stat"><div class="s-sv" style="color:${Math.abs(calDiff)<=15?'var(--green)':'var(--yellow)'}">${calDiff>0?'+':''}${calDiff}%</div><div class="s-sl">Écart</div><div style="font-size:.55rem;color:var(--text3)">${Math.abs(calDiff)>15?'Calibration en cours':'Estimation cohérente'}</div></div>`:''}
      </div>
    </div>`;

  section.innerHTML=`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:8px">
        <div class="clabel" style="margin:0">Comparaison prévu / réel — ${escapeHTML(race.name)}</div>
        ${avgUpDiff!==null?`<div class="mono" style="font-size:.6rem;color:${Math.abs(avgUpDiff)<=10?'var(--green)':Math.abs(avgUpDiff)<=25?'var(--yellow)':'var(--red)'}">Montées : ${avgUpDiff>0?'+':''}${avgUpDiff}% vs prédictions</div>`:''}
      </div>
      <div style="overflow-x:auto">
        <table class="splits-table">
          <thead><tr><th>Section</th><th>D+/D-</th><th>Prévu</th><th>Réel</th><th>Écart</th><th>FC moy</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="mono t3" style="font-size:.56rem;margin-top:8px;display:flex;align-items:center;gap:4px">✓ = ±10% · ~ = ±25% · ${icon('warning',11)} = &gt;25% d'écart</div>
    </div>
    ${weatherHTML}`;

  // Save calibration coefficients (per sport type)
  const coeffKey=sportType.toLowerCase().includes('trail')||sportType.toLowerCase().includes('ultra')?'trail':'road';
  if(avgUpDiff!==null){VLState.userProfile.coeff_uphill=1+avgUpDiff/100;VLState.userProfile[`coeff_up_${coeffKey}`]=VLState.userProfile.coeff_uphill;}
  if(avgDownDiff!==null){VLState.userProfile.coeff_downhill=1+avgDownDiff/100;VLState.userProfile[`coeff_down_${coeffKey}`]=VLState.userProfile.coeff_downhill;}
  if(avgFlatDiff!==null){VLState.userProfile.coeff_flat=1+avgFlatDiff/100;VLState.userProfile[`coeff_flat_${coeffKey}`]=VLState.userProfile.coeff_flat;}
  if(avgUpDiff!==null){
    sb.from('profiles').upsert({id:VLState.currentUser.id,coeff_uphill:VLState.userProfile.coeff_uphill}).then(()=>{});
  }


if(validDiffs.length >= 2) {
  const summaryBox = document.createElement('div');
  summaryBox.className = 'stat-summary mt2';

  const avgDiff = validDiffs.length
    ? Math.round(validDiffs.reduce((a, b) => a + b, 0) / validDiffs.length)
    : 0;

  const worstSection = sections
    .map((s, i) => {
      const p = predicted[i];
      const r = actual[i];
      if (!p || !r) return null;
      const diff = Math.round((r - p) / p * 100);
      return { section: s, index: i, diff };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];

  const upText = avgUpDiff !== null ? `Montées : ${avgUpDiff > 0 ? '+' : ''}${avgUpDiff}% vs prévision.` : '';
  const downText = avgDownDiff !== null ? `Descentes : ${avgDownDiff > 0 ? '+' : ''}${avgDownDiff}% vs prévision.` : '';
  const flatText = avgFlatDiff !== null ? `Plat : ${avgFlatDiff > 0 ? '+' : ''}${avgFlatDiff}% vs prévision.` : '';

  const worstText = worstSection
    ? `Plus gros écart : section ${worstSection.index + 1}, ${worstSection.diff > 0 ? '+' : ''}${worstSection.diff}% vs prévision.`
    : `Aucune section dominante détectée.`;

  summaryBox.innerHTML = `
    <div class="summary-header">
      <div class="summary-icon">${icon('chart',18)}</div>
      <div class="summary-title">Comparaison course vs projection</div>
    </div>
    <div class="summary-text">
      Écart global : ${avgDiff > 0 ? '+' : ''}${avgDiff}% vs projection.<br>
      ${upText ? upText + '<br>' : ''}
      ${downText ? downText + '<br>' : ''}
      ${flatText ? flatText + '<br>' : ''}
      ${worstText}
    </div>
  `;

  section.appendChild(summaryBox);
}
  }

export function raceMenuLinkActivity() {
  const race = VLState.currentRaceContext || window._openEventRace;
  if (!race) return;
  window.Vorcelab?.linkActivityFromRace?.(race);
}

export function closeAnalyse() {
  if(window._actMapInst){window._actMapInst.remove();window._actMapInst=null;}
  window.navigate(VLState._prevPanel || 'dashboard');
}
