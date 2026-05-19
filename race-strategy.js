import { hav, minettiGradePenalty, buildDetailedSections, isTrailRace, RPE_SCALE } from './gpx-core.js';
import { terrainTimePenalty, fetchTerrainSurfaces, surfaceInfo, slipRisk } from './terrain.js';
import { escapeHTML } from './security.js';
import { fmtT, fmtP, fmtD, bC, isRun } from './formatters.js';
import { VLState, sb, SUPA_URL, FC_MAX_DEFAULT } from './app-state.js';
import { genNutrition } from './nutrition.js';
import { icon } from './icons.js';
import { computeRunnerProfile, sensitivityLabel, climbSourceLabel } from './runner-profile.js';

// leafletMap est dans VLState.leafletMap

export function handleGpxDrop(e){e.preventDefault();document.getElementById('gpxDrop').classList.remove('drag');const f=e.dataTransfer.files[0];if(f&&f.name.endsWith('.gpx'))parseGPX(f);}
export function handleGpxFile(e){const f=e.target.files[0];if(f)parseGPX(f);}

export function parseGPX(file, raceCtx=null){
  if(raceCtx) VLState.currentRaceContext=raceCtx;
  const reader=new FileReader();
  reader.onload=async e=>{
    const xml=new DOMParser().parseFromString(e.target.result,'text/xml');
    const pts=xml.querySelectorAll('trkpt');
    if(!pts.length){alert('GPX invalide ou vide');return;}
    const points=[];
    pts.forEach(pt=>{const lat=parseFloat(pt.getAttribute('lat')),lon=parseFloat(pt.getAttribute('lon')),ele=pt.querySelector('ele');points.push({lat,lon,ele:ele?parseFloat(ele.textContent):null});});
    await analyzeGPX(points, file.name||'');
  };
  reader.readAsText(file);
}


export async function analyzeGPX(points, fname) {
  let cumDist=[0],dplus=0,dminus=0;
  for(let i=1;i<points.length;i++){
    cumDist.push(cumDist[i-1]+hav(points[i-1],points[i]));
    if(points[i].ele&&points[i-1].ele){const diff=points[i].ele-points[i-1].ele;if(diff>0)dplus+=diff;else dminus+=Math.abs(diff);}
  }
  const totalDist=cumDist[cumDist.length-1];
  const eles=points.map(p=>p.ele).filter(e=>e!=null);
  const altMin=Math.min(...eles),altMax=Math.max(...eles);

  // Samples every 100m
  const samples=[];let target=0;
  for(let i=0;i<points.length;i++){if(cumDist[i]>=target){samples.push({d:+(cumDist[i]/1000).toFixed(2),alt:points[i].ele?Math.round(points[i].ele):null});target+=100;}}
  samples.push({d:+(totalDist/1000).toFixed(2),alt:eles[eles.length-1]?Math.round(eles[eles.length-1]):null});

  // Weather gate — only integrate forecast if race ≤ 10 days away
  let weather=null, weatherNote=null;
  const raceTs=VLState.currentRaceContext?.date?new Date(VLState.currentRaceContext.date).getTime():null;
  const daysToRace=raceTs?Math.ceil((raceTs-Date.now())/86400000):null;
  const weatherReliable=daysToRace===null||daysToRace<=10;
  if(weatherReliable){
    try{
      const forecastDays=daysToRace===null?2:Math.min(10,Math.max(2,daysToRace+1));
      // Race hour: use event datetime if non-midnight, else assume 9:00
      const raceDtm=VLState.currentRaceContext?.date?new Date(VLState.currentRaceContext.date):null;
      const raceHour=raceDtm&&raceDtm.getHours()>0?raceDtm.getHours():9;
      const h=(daysToRace!==null&&daysToRace>0?daysToRace:0)*24+raceHour;
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${points[0].lat}&longitude=${points[0].lon}&hourly=temperature_2m,precipitation_probability,precipitation,windspeed_10m&timezone=Europe%2FParis&forecast_days=${forecastDays}`);
      const d=await r.json();
      const precip6h=(d.hourly?.precipitation||[]).slice(Math.max(0,h-6),h+1).reduce((a,v)=>a+(v||0),0);
      if(d.hourly?.temperature_2m?.[h]!=null){
        weather={temp:d.hourly.temperature_2m[h],precip_prob:d.hourly?.precipitation_probability?.[h]??0,precip:d.hourly?.precipitation?.[h]??0,precip_recent:precip6h,wind:d.hourly?.windspeed_10m?.[h]};
        if(daysToRace&&daysToRace>0&&!(raceDtm&&raceDtm.getHours()>0)){
          weatherNote=`Météo J+${daysToRace} — heure estimée à 9h (heure réelle non renseignée dans l'événement)`;
        }
      } else {
        weatherNote='Météo non disponible pour la fenêtre de course';
      }
    }catch{weatherNote='Météo indisponible';}
  } else {
    weatherNote=`Météo non intégrée — prévision trop lointaine (J+${daysToRace})`;
  }

  // Lancer le calcul profil coureur en parallèle avec terrain (résultat attendu plus tard)
  // Cache invalidé si : nouvelles activités OU profil > 7 jours
  const _rpCached   = VLState.runnerProfile;
  const _rpAge      = _rpCached?._computedAt ? Date.now() - new Date(_rpCached._computedAt).getTime() : Infinity;
  const _rpStale    = !_rpCached
    || _rpCached._actCount !== (VLState.allActivities?.length || 0)
    || _rpAge > 7 * 86_400_000;
  const _rpPromise = (_rpStale && VLState.allActivities?.length && VLState.stravaConnected)
    ? computeRunnerProfile(VLState.allActivities, VLState.userProfile, VLState.currentRaceContext)
        .then(rp => { VLState.runnerProfile = rp; return rp; })
        .catch(() => _rpCached || null)
    : Promise.resolve(_rpCached || null);

  // 500m sections with detailed grade
  const kmSecs=[];let segTarget=500,prevIdx=0,segNum=0;
  for(let i=0;i<cumDist.length;i++){
    if(cumDist[i]>=segTarget||i===cumDist.length-1){
      let sdp=0,sdm=0;
      for(let j=prevIdx+1;j<=i;j++){if(points[j].ele&&points[j-1].ele){const diff=points[j].ele-points[j-1].ele;if(diff>0)sdp+=diff;else sdm+=Math.abs(diff);}}
      const segDist=cumDist[i]-cumDist[prevIdx];
      const elevChange=points[i].ele&&points[prevIdx].ele?points[i].ele-points[prevIdx].ele:0;
      const grade=segDist>0?(elevChange/segDist)*100:0;
      const startKm=+(cumDist[prevIdx]/1000).toFixed(2);
      const endKm=+(cumDist[i]/1000).toFixed(2);
      kmSecs.push({km:endKm,startKm,dist:segDist,dplus:Math.round(sdp),dminus:Math.round(sdm),grade:+grade.toFixed(1),altEnd:points[i].ele?Math.round(points[i].ele):null});
      prevIdx=i;segTarget=cumDist[i]+500;segNum++;
    }
  }

  // ── ALGO PROGRESSION ──
  // Compute performance index from recent quality sessions (>20% time in Z3+)
  function computeProgressionFactor(trailOnly=false) {
    if(!VLState.allActivities.length) return 1;
    const fcMax=VLState.userProfile.fc_max||205;
    const z3min=Math.round(fcMax*.80);
    let sessions=VLState.allActivities.filter(a=>{
      if(!isRun(a.type)) return false;
      if(trailOnly && a.type!=='TrailRun') return false;
      if(!a.average_heartrate) return false;
      return a.average_heartrate > z3min && a.distance > 3000;
    }).sort((a,b)=>new Date(a.start_date)-new Date(b.start_date));
    // Fall back to all runs if not enough trail sessions
    if(sessions.length<4 && trailOnly) return computeProgressionFactor(false);
    if(sessions.length<4) return 1;
    const half=Math.floor(sessions.length/2);
    const early=sessions.slice(0,half);
    const recent=sessions.slice(-half);
    const avgPaceEarly=early.reduce((s,a)=>s+a.average_speed,0)/early.length;
    const avgPaceRecent=recent.reduce((s,a)=>s+a.average_speed,0)/recent.length;
    if(avgPaceEarly<=0) return 1;
    return Math.min(1.10, Math.max(0.90, avgPaceRecent/avgPaceEarly));
  }

  // Use event type as priority; fall back to D+/km from parsed points
  // (window._gpxPoints not yet set at this point in analyzeGPX)
  const isTrail=(()=>{
    const t=VLState.currentRaceContext?.type;
    if(t){
      if(['Trail','TrailRun','trail'].includes(t)) return true;
      if(['Run','Road','road','Route','route','Running'].includes(t)) return false;
    }
    return totalDist>0&&(dplus/(totalDist/1000))>20;
  })();
  const progressionFactor = computeProgressionFactor(isTrail);
  const qualityCount = VLState.allActivities.filter(a=>isRun(a.type)&&a.average_heartrate>(VLState.userProfile.fc_max||205)*.80&&a.distance>3000).length;

  // Base pace from real performance data — goal_time never influences pace calculation
  function computeBasePace() {
    const now=Date.now(), cutoff60=now-60*24*3600*1000;
    const raceDpKm=dplus/(totalDist/1000);
    if(isTrail) {
      const trailRuns=VLState.allActivities
        .filter(a=>(a.type==='TrailRun'||/trail/i.test(a.sport_type||''))&&a.distance>5000&&a.average_speed>0)
        .sort((a,b)=>new Date(b.start_date)-new Date(a.start_date))
        .slice(0,20);
      if(trailRuns.length>=1) {
        const top=trailRuns.slice(0,10);
        const scored=top.map(a=>{
          const aDpKm=(a.total_elevation_gain||0)/(a.distance/1000);
          const similarity=1-Math.min(1,Math.abs(aDpKm-raceDpKm)/(raceDpKm+1));
          const recency=new Date(a.start_date).getTime()>=cutoff60?2:1;
          return {paceS:1000/a.average_speed,weight:(0.4+0.6*similarity)*recency};
        });
        const totalW=scored.reduce((s,x)=>s+x.weight,0);
        const weightedPace=scored.reduce((s,x)=>s+x.paceS*x.weight,0)/totalW;
        const paceS=weightedPace/progressionFactor;
        const recentCount=trailRuns.filter(a=>new Date(a.start_date).getTime()>=cutoff60).length;
        const prog=progressionFactor>1?`+${((progressionFactor-1)*100).toFixed(1)}%`:progressionFactor<0.98?`${((progressionFactor-1)*100).toFixed(1)}%`:'stable';
        const source=`${icon('trail',14)} ${trailRuns.length} sortie${trailRuns.length>1?'s':''} trail · D+ pondéré · ×2 récent (${recentCount}/60j) · progression ${prog}`;
        return {paceS,source,dataQuality:{trailCount:trailRuns.length,recentCount,hasHR:trailRuns.some(a=>a.average_heartrate)}};
      }
      return {paceS:420,source:`${icon('warning',14)} Aucune sortie trail — sync tes activités trail Strava pour une projection fiable`,dataQuality:{trailCount:0,recentCount:0,hasHR:false}};
    }
    if(VLState.userProfile.prs) {
      const prs=VLState.userProfile.prs;
      const candidates=['semi','10k','15k','marathon','5k'].filter(k=>prs[k]?.timeS&&prs[k]?.dist);
      if(candidates.length) {
        const pr=prs[candidates[0]];
        const paceS=(pr.timeS/pr.dist*1000)/progressionFactor;
        const prog=progressionFactor>1?`+${((progressionFactor-1)*100).toFixed(1)}%`:progressionFactor<0.98?`${((progressionFactor-1)*100).toFixed(1)}%`:'stable';
        const roadRuns=VLState.allActivities.filter(a=>isRun(a.type)&&a.distance>3000);
        const recentCount=roadRuns.filter(a=>new Date(a.start_date).getTime()>=cutoff60).length;
        return {paceS,source:`${icon('chart',14)} PR ${candidates[0].toUpperCase()} · progression ${prog}`,dataQuality:{trailCount:0,recentCount,hasHR:roadRuns.some(a=>a.average_heartrate)}};
      }
    }
    return {paceS:isTrail?420:320,source:isTrail?`${icon('settings',14)} Estimation défaut trail — sync Strava`:`${icon('settings',14)} Estimation par défaut — renseigne tes PR`,dataQuality:{trailCount:0,recentCount:0,hasHR:false}};
  }
  const {paceS:basePaceS,source:projSource,dataQuality}=computeBasePace();

  // Build sections
  const sections=buildDetailedSections(kmSecs);
  // Fetch terrain surfaces — awaité avant le calcul des sections (pénalité terrain incluse)
  const surfacePromise=fetchTerrainSurfaces(points, sections);
  window._gpxSectionSurfaces = await surfacePromise;
  window._gpxWeather = weather;
  // Attente profil coureur (lancé en parallèle du terrain)
  const rp = await _rpPromise;

  const sectionTimes=[];
  let estTimeS=0;
  // Personal calibration: VAM > coeff_uphill > Minetti (fallback)
  const _vam=VLState.userProfile.vam_avg||0,_cu=VLState.userProfile.coeff_uphill||0,_cd=VLState.userProfile.coeff_downhill||0,_cf=VLState.userProfile.coeff_flat||0;
  sections.forEach((s,i)=>{
    const surfKey=window._gpxSectionSurfaces?.[i]??null;
    const g=s.grade/100;
    let pente;
    if(s.type==='up'&&_vam>0&&g>0.01){const vp=3_600_000*g/_vam;pente=Math.max(0,vp/basePaceS-1);}
    else if(s.type==='up'&&_cu>0){pente=minettiGradePenalty(g)*_cu;}
    else if(s.type==='down'&&_cd>0){pente=minettiGradePenalty(g)*_cd;}
    else if(s.type==='flat'&&_cf>0){pente=minettiGradePenalty(g)*_cf;}
    else{pente=minettiGradePenalty(g);}
    const pentePenalty=1+pente;
    const terPenalty=terrainTimePenalty(surfKey,weather,s.grade,s.type);
    const t=basePaceS*pentePenalty*terPenalty*s.dist/1000;
    sectionTimes.push(Math.round(t));estTimeS+=t;
  });

  // Ajustements personnels conditions extérieures (prudents, plafonnés)
  const personalAdjustments = [];
  let personalMultiplier = 1;
  if (rp && weather) {
    const { heat, cold, wind, rain } = rp.externalSensitivity;
    // Chaleur : appliqué si météo > 20°C et sensibilité confirmée
    if (heat.sensitivity !== 'unknown' && heat.confidence !== 'low' && heat.pacePenaltyPer10C && weather.temp > 20) {
      const adj = Math.min(0.05, heat.pacePenaltyPer10C * (Math.max(0, weather.temp - 18) / 10));
      if (adj > 0.005) {
        personalMultiplier *= (1 + adj);
        personalAdjustments.push({ label: `Chaleur ${Math.round(weather.temp)}°C`, detail: `+${(adj*100).toFixed(1)}% — ${sensitivityLabel(heat)}`, color: 'var(--vl-amber)' });
      }
    }
    // Vent : route uniquement (trail en forêt = exposition réduite)
    if (!isTrail && wind.sensitivity !== 'unknown' && wind.confidence !== 'low' && wind.pacePenaltyPer20Kmh && (weather.wind || 0) > 20) {
      const adj = Math.min(0.03, wind.pacePenaltyPer20Kmh * (weather.wind / 20));
      if (adj > 0.005) {
        personalMultiplier *= (1 + adj);
        personalAdjustments.push({ label: `Vent ${Math.round(weather.wind)} km/h`, detail: `+${(adj*100).toFixed(1)}% — ${sensitivityLabel(wind)}`, color: 'var(--vl-amber)' });
      }
    }
    // Sol humide
    if (rain.sensitivity !== 'unknown' && rain.confidence !== 'low' && rain.terrainPenaltySignal && (weather.precip > 1 || (weather.precip_recent || 0) > 2)) {
      const adj = Math.min(0.04, rain.terrainPenaltySignal * 0.5);
      if (adj > 0.005) {
        personalMultiplier *= (1 + adj);
        personalAdjustments.push({ label: 'Sol humide', detail: `+${(adj*100).toFixed(1)}% — ${sensitivityLabel(rain)}`, color: 'var(--vl-ember)' });
      }
    }
    // Froid
    if (cold.sensitivity !== 'unknown' && cold.confidence !== 'low' && cold.pacePenalty && weather.temp < 5) {
      const adj = Math.min(0.03, cold.pacePenalty * 0.5);
      if (adj > 0.005) {
        personalMultiplier *= (1 + adj);
        personalAdjustments.push({ label: `Froid ${Math.round(weather.temp)}°C`, detail: `+${(adj*100).toFixed(1)}% — ${sensitivityLabel(cold)}`, color: 'var(--vl-text-3)' });
      }
    }
  }
  if (personalMultiplier > 1) estTimeS *= personalMultiplier;

  // Confidence scoring
  const terrainKnown=(window._gpxSectionSurfaces||[]).filter(s=>s!==null).length;
  const terrainRatio=sections.length>0?terrainKnown/sections.length:0;

  // Historical similarity signals (90-day window)
  const distKmRace=totalDist/1000;
  const dpKmRace=distKmRace>0?dplus/distKmRace:0;
  const cutoff90=Date.now()-90*24*3600*1000;
  const recentRuns=VLState.allActivities.filter(a=>isRun(a.type)&&new Date(a.start_date).getTime()>=cutoff90&&a.distance>0);
  const longestRecentKm=recentRuns.length?Math.max(...recentRuns.map(a=>a.distance/1000)):0;
  const biggestDpKm=recentRuns.length?Math.max(...recentRuns.map(a=>(a.total_elevation_gain||0)/(a.distance/1000))):0;
  const distRatio=longestRecentKm>0?distKmRace/longestRecentKm:99;
  const dpRatio=dpKmRace>5&&biggestDpKm>0?dpKmRace/biggestDpKm:1;
  const similarCount=recentRuns.filter(a=>{
    const aKm=a.distance/1000;
    return aKm>=distKmRace*0.5&&aKm<=distKmRace*1.5;
  }).length;

  let confScore=0;
  if(isTrail){if(dataQuality.trailCount>=5)confScore+=2;else if(dataQuality.trailCount>=2)confScore+=1;}
  else{if(dataQuality.recentCount>=3)confScore+=2;else if(dataQuality.recentCount>=1)confScore+=1;}
  if(dataQuality.recentCount>=3)confScore+=1;
  if(dataQuality.hasHR)confScore+=1;
  if(terrainRatio>=0.6)confScore+=1;
  if(weather&&weatherReliable)confScore+=1;
  if(totalDist>5000&&sections.length>=5)confScore+=1;
  if(distRatio<=1.2)confScore+=1; // race distance covered by recent training
  else if(distRatio>1.8)confScore-=1; // race much longer than any recent run
  if(isTrail&&dpRatio>1.6)confScore-=1; // D+/km much bigger than recent trail sessions
  if(similarCount>=3)confScore+=1; // enough similar-distance sessions in history
  // Pénalités endurance depuis runner profile (plus précis que les ratios bruts)
  if(rp?.enduranceProfile) {
    const ep=rp.enduranceProfile;
    if(ep.distanceRatioToRace>2.0) confScore-=2;
    else if(ep.distanceRatioToRace>1.5) confScore-=1;
    if(ep.elevationRatioToRace>2.0) confScore-=1;
    if(rp.dataQuality.freshness==='low') confScore-=1;
    if(rp.dataQuality.activitiesWithWeather>=10) confScore+=1;
  }
  confScore=Math.max(0,confScore);
  const confidence=confScore>=7?'good':confScore>=4?'medium':'low';
  const confidenceLabel={good:'Fiable',medium:'Indicative',low:'Estimation'}[confidence];
  const confidenceColor={good:'var(--vl-growth)',medium:'var(--vl-amber)',low:'var(--vl-ember)'}[confidence];
  const confDots=[0,1,2,3,4].map(i=>i<(confidence==='good'?5:confidence==='medium'?3:1)?`<span style="color:${confidenceColor}">&#9679;</span>`:'<span style="color:var(--vl-text-3)">&#9675;</span>').join('');

  // Range: prudent / probable / agressif
  // En faible confiance : incertitude surtout vers le haut (ne pas promettre un scénario rapide)
  const rf=confidence==='good'?{min:0.96,max:1.08}:confidence==='medium'?{min:0.95,max:1.15}:{min:0.97,max:1.25};
  const timeMin=estTimeS*rf.min;
  const timeMax=estTimeS*rf.max;

  // Goal comparison — display only, goal_time has zero effect on pace calc
  let goalCompareStr='',goalCompareColor='var(--vl-text-3)',goalLabel='';
  if(VLState.currentRaceContext?.goal_time){
    const gParts=VLState.currentRaceContext.goal_time.match(/(\d+)[hH](\d*)/);
    if(gParts){
      const goalSec=parseInt(gParts[1])*3600+(parseInt(gParts[2])||0)*60;
      const absDiff=Math.abs(goalSec-Math.round(estTimeS));
      const gmh=Math.floor(absDiff/3600),gmm=Math.floor(absDiff%3600/60);
      const diffStr=`${gmh>0?gmh+'h':''}${String(gmm).padStart(gmh>0?2:1,'0')}min`;
      const ratio=Math.round(estTimeS)/goalSec;
      if(ratio<0.94){goalLabel='Très conservateur';goalCompareColor='var(--vl-text-3)';goalCompareStr=`Projection ${diffStr} plus rapide que ton objectif`;}
      else if(ratio<0.97){goalLabel='Conservateur';goalCompareColor='var(--vl-growth)';goalCompareStr=`Projection ${diffStr} plus rapide que ton objectif`;}
      else if(ratio<=1.03){goalLabel='Réaliste';goalCompareColor='var(--vl-growth)';goalCompareStr='Objectif aligné avec la projection Vorcelab';}
      else if(ratio<=1.10){goalLabel='Ambitieux';goalCompareColor='var(--vl-amber)';goalCompareStr=`Objectif ${diffStr} plus rapide que la projection Vorcelab`;}
      else{goalLabel='Très ambitieux';goalCompareColor='var(--vl-ember)';goalCompareStr=`Objectif ${diffStr} plus rapide que la projection Vorcelab`;}
    }
  }

  const dh=estTimeS/3600;
  const distKm=totalDist/1000;
  const raceName=VLState.currentRaceContext?.name||fname.replace('.gpx','')||'Course';
  const raceDate=VLState.currentRaceContext?.date?new Date(VLState.currentRaceContext.date).toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}):'';
  const splits=buildSplitsTable(kmSecs,basePaceS);

  const res=document.getElementById('stratResult');
  res.style.display='block';
  document.getElementById('gpxDrop').style.display='none';

  // isTrail already declared above
  const saveGpxItem = document.getElementById('raceMenuSaveGpx');
  if(saveGpxItem) saveGpxItem.style.display = VLState.currentRaceContext?.id ? 'block' : 'none';


  res.innerHTML=`
    ${!VLState.currentRaceContext?`<div style="font-family:var(--vl-display);font-size:2rem;letter-spacing:0.02em;line-height:0.9;text-transform:uppercase;margin-bottom:.25rem">${escapeHTML(raceName)}</div><div class="mlabel" style="color:var(--vl-text-3);margin-bottom:1.25rem">${raceDate}</div>`:''}

    <!-- Stats strip -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:1px;background:var(--vl-line);border:1px solid var(--vl-line);border-radius:var(--vl-r-sm);overflow:hidden;margin-bottom:1rem">
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:var(--vl-ember)">${distKm.toFixed(1)} km</div><div class="lbl">Distance</div></div>
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:var(--vl-amber)">+${Math.round(dplus)} m</div><div class="lbl">D+</div></div>
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:var(--vl-text-2)">−${Math.round(dminus)} m</div><div class="lbl">D−</div></div>
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val">${altMin} m</div><div class="lbl">Alt. min</div></div>
      <div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val">${altMax} m</div><div class="lbl">Alt. max</div></div>
      ${weather?.temp!=null?`<div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:${weather.temp>25?'var(--vl-ember)':weather.temp<5?'var(--vl-amber)':'var(--vl-growth)'}">${Math.round(weather.temp)}°C</div><div class="lbl">Météo</div></div>`:''}
      ${weather?.precip_prob!=null?`<div class="vl-strat-dstat" style="background:var(--vl-surf)"><div class="val" style="color:${weather.precip_prob>50?'var(--vl-ember)':'var(--vl-growth)'}">${weather.precip_prob}%</div><div class="lbl">Pluie</div></div>`:''}
    </div>

    <!-- Map + altimetry (fused card) -->
    <div class="card no-print" style="padding:0;overflow:hidden">
      <div style="padding:12px 14px 8px;display:flex;align-items:center;justify-content:space-between">
        <span class="clabel" style="margin:0">Tracé GPX + profil</span>
        <span class="mlabel" style="color:var(--vl-text-3)">${distKm.toFixed(2)} km</span>
      </div>
      <div id="raceMap"></div>
      <div class="gpx-chart-row" style="padding:0 14px 0;border-top:1px solid var(--vl-line)">
        <div class="chart-wrap" style="height:100px"><canvas id="gpxChart"></canvas></div>
      </div>
    </div>

    <!-- Projection V2 -->
    <div class="vl-proj-card">
      <div style="flex:1;min-width:0">
        <div class="mlabel" style="margin-bottom:6px">Projection Vorcelab</div>
        <div class="vl-proj-time">${fmtT(estTimeS)}</div>
        <div style="margin-top:5px;font-family:var(--vl-mono);font-size:11px;color:var(--vl-text-3)">${fmtT(timeMin)} – ${fmtT(timeMax)}</div>
        ${weatherNote?`<div class="mlabel" style="color:var(--vl-amber);margin-top:4px">${escapeHTML(weatherNote)}</div>`:''}
        <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;font-family:var(--vl-mono);letter-spacing:2px">${confDots}</span>
          <span class="mlabel" style="color:${confidenceColor}">${confidenceLabel}</span>
        </div>
        <div class="mlabel" style="color:var(--vl-text-3);margin-top:4px">${projSource||'Minetti 2002 · allure estimée'}</div>
      </div>
      ${VLState.currentRaceContext?.goal_time?`
      <div class="vl-proj-obj" style="text-align:right;flex-shrink:0">
        <div class="mlabel" style="margin-bottom:4px">Objectif</div>
        <div class="vl-proj-obj-time">${escapeHTML(VLState.currentRaceContext.goal_time)}</div>
        ${goalLabel?`<div class="mlabel" style="color:${goalCompareColor};margin-top:4px">${escapeHTML(goalLabel)}</div>`:''}
        ${goalCompareStr?`<div class="mlabel" style="color:var(--vl-text-3);margin-top:2px">${goalCompareStr}</div>`:''}
      </div>`:`
      <div style="text-align:right;flex-shrink:0">
        <div class="mlabel" style="margin-bottom:6px">Scénarios</div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          <div><span class="mlabel" style="color:var(--vl-text-3)">Prudent</span> <span style="font-family:var(--vl-mono);font-size:11px;color:var(--vl-text-2)">${fmtT(timeMax)}</span></div>
          <div><span class="mlabel" style="color:var(--vl-growth)">Agressif</span> <span style="font-family:var(--vl-mono);font-size:11px;color:var(--vl-text)">${fmtT(timeMin)}</span></div>
        </div>
      </div>`}
    </div>

    <!-- Facteurs personnels -->
    ${rp ? `
    <div class="card" style="padding:12px 14px;margin-top:0;border-top:none;border-radius:0 0 var(--vl-r-sm) var(--vl-r-sm);background:var(--vl-surf)">
      <div class="clabel" style="margin-bottom:8px">Facteurs personnels utilisés</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span class="mlabel">Montée</span>
          <span class="mlabel" style="color:${rp.climbProfile.source==='streams_calibrated'?'var(--vl-growth)':rp.climbProfile.source==='activity_estimated'?'var(--vl-amber)':'var(--vl-text-3)'}">
            ${climbSourceLabel(rp)}
          </span>
        </div>
        ${personalAdjustments.length>0 ? personalAdjustments.map(adj=>`
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <span class="mlabel" style="color:${adj.color};flex-shrink:0">${adj.label}</span>
          <span class="mlabel" style="color:var(--vl-text-3);text-align:right">${adj.detail}</span>
        </div>`).join('') : `
        <div class="mlabel" style="color:var(--vl-text-3)">Conditions extérieures : ${weather?'pénalités génériques (données personnelles insuffisantes)':'météo non intégrée'}</div>`}
        ${(rp.enduranceProfile.alerts||[]).map(a=>`<div class="mlabel" style="color:var(--vl-amber)">${icon('warning',11)} ${escapeHTML(a)}</div>`).join('')}
        <div class="mlabel" style="color:var(--vl-text-3);border-top:1px solid var(--vl-line);padding-top:5px;margin-top:2px">
          Projection basée sur GPX, terrain, météo et historique récent. Résultats indicatifs.
          <br>${rp.dataQuality.totalRuns} sorties · ${rp.dataQuality.totalTrails} trails · ${rp.dataQuality.activitiesWithWeather} avec météo · fraîcheur ${rp.dataQuality.freshness==='good'?'bonne':rp.dataQuality.freshness==='medium'?'correcte':'faible'}
        </div>
      </div>
    </div>` : `
    <div class="card" style="padding:10px 14px;margin-top:0;border-top:none;border-radius:0 0 var(--vl-r-sm) var(--vl-r-sm);background:var(--vl-surf)">
      <div class="mlabel" style="color:var(--vl-text-3)">Projection basée sur GPX, terrain et météo disponible. Connecte Strava pour une projection personnalisée.</div>
    </div>`}

    <!-- Sections -->
    <details open>
      <summary class="vl-details-summary">
        <span class="vl-details-title">Plan de course</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="mlabel">${sections.length} section${sections.length>1?'s':''}</span>
          <span style="font-family:var(--vl-mono);font-size:14px;color:var(--vl-text-3)">▾</span>
        </span>
      </summary>
      <div id="sectionsScroll" class="vl-sections-scroll">
        ${sections.map((s,i)=>renderDetailedSection(s,sectionTimes[i],i)).join('')}
      </div>
    </details>

    <!-- Nutrition -->
    <details style="margin-top:8px">
      <summary class="vl-details-summary">
        <span class="vl-details-title">Plan nutrition</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="mlabel">${dh<1.25?'< 75 min':dh<2.5?'75–150 min':'> 150 min'}</span>
          <span style="font-family:var(--vl-mono);font-size:14px;color:var(--vl-text-3)">▾</span>
        </span>
      </summary>
      <div style="border:1px solid var(--vl-line);border-top:none;border-radius:0 0 var(--vl-r-sm) var(--vl-r-sm);padding:14px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:9px;margin-bottom:1rem">
          <div class="s-stat"><div class="s-sv tc">${dh<1.25?'Eau only':dh<2.5?Math.round(30*(dh-0.5))+'g':Math.round(60*(dh-0.5))+'g'}</div><div class="s-sl">Glucides cibles</div></div>
          <div class="s-stat"><div class="s-sv tg">${Math.round(dh*400)} ml</div><div class="s-sl">Eau estimée</div></div>
          <div class="s-stat"><div class="s-sv ${dh<1.25?'tg':dh<2.5?'ty':'to'}">${dh<1.25?'< 75min':dh<2.5?'75–150min':'> 150min'}</div><div class="s-sl">Protocole</div></div>
        </div>
        ${dh<1.25?`<div style="background:color-mix(in oklab, var(--vl-growth) 8%, transparent);border:1px solid color-mix(in oklab, var(--vl-growth) 25%, transparent);border-radius:var(--vl-r-sm);padding:10px 14px;font-size:.8rem;margin-bottom:.75rem"><strong style="color:var(--vl-growth)">Effort &lt; 75 min — eau uniquement pendant la course.</strong><br><span class="mlabel" style="color:var(--vl-text-3)">Réserves glycogéniques endogènes suffisantes. Burke et al., 2011</span></div>`:''}
        <table class="nutr-table"><thead><tr><th>Moment</th><th>Action</th><th>Glucides</th><th>Justification</th></tr></thead><tbody>${genNutrition(totalDist,estTimeS)}</tbody></table>
        <div class="mlabel" style="margin-top:10px;color:var(--vl-text-3)">Burke 2011 · Jeukendrup 2004 · Currell &amp; Jeukendrup 2008 · Ivy 1998</div>
      </div>
    </details>

    <!-- Splits -->
    <details style="margin-top:8px">
      <summary class="vl-details-summary">
        <span class="vl-details-title">Splits km par km</span>
        <span style="font-family:var(--vl-mono);font-size:14px;color:var(--vl-text-3)">▾</span>
      </summary>
      <div style="overflow-x:auto;border:1px solid var(--vl-line);border-top:none;border-radius:0 0 var(--vl-r-sm) var(--vl-r-sm);padding:10px">
        <table class="splits-table"><thead><tr><th>Km</th><th>Type</th><th>Pente</th><th>D+</th><th>D-</th><th>Alt</th><th>Durée sect.</th><th>Temps cumulé</th><th>Conseil FC</th></tr></thead><tbody>${splits}</tbody></table>
      </div>
    </details>`;

  // ── Globals interactivité ──
  window._gpxPoints = points;
  window._gpxSamples = samples;
  window._gpxSections = sections;
  window._gpxDistKm = distKm;
  window._gpxCumDist = cumDist;
  window._gpxChart = null;
  window._activeSection = -1;
  window._sectionPolylines = [];
  window._hoverMarker = null;

  // Dark map
  setTimeout(()=>{
    if(VLState.leafletMap){VLState.leafletMap.remove();VLState.leafletMap=null;}
    VLState.leafletMap=L.map('raceMap',{zoomControl:true,scrollWheelZoom:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(VLState.leafletMap);

    // Tracé de fond sombre
    const allLL=points.filter((_,i)=>i%3===0).map(p=>[p.lat,p.lon]);
    L.polyline(allLL,{color:'rgba(243,239,228,.08)',weight:5,opacity:1}).addTo(VLState.leafletMap);

    // Polylines colorées par section + interactivité
    window._sectionPolylines = sections.map((s,idx)=>{
      // Use cumDist for accurate section boundaries (GPS points not uniformly spaced)
      const si=Math.max(0, cumDist.findIndex(d=>d>=s.startKm*1000));
      const eiRaw=cumDist.findIndex(d=>d>=s.endKm*1000);
      const ei=eiRaw<0?points.length-1:Math.min(eiRaw,points.length-1);
      // Adaptive decimation: max ~80 pts per section, always keep last point to avoid gaps
      const raw=points.slice(si,ei+1);
      const step=Math.max(1,Math.floor(raw.length/80));
      const ll=raw.filter((_,i)=>i%step===0||i===raw.length-1).map(p=>[p.lat,p.lon]);
      const col={up:'#E5562A',down:'#E8A23A',flat:'#10B981'}[s.type];
      const poly=L.polyline(ll,{color:col,weight:4,opacity:.85}).addTo(VLState.leafletMap);
      poly.on('click',()=>highlightSection(idx));
      poly.on('mouseover',()=>{if(window._activeSection!==idx)poly.setStyle({weight:6,opacity:1});});
      poly.on('mouseout',()=>{if(window._activeSection!==idx)poly.setStyle({weight:4,opacity:.85});});
      return {poly,col,s};
    });

    // Marqueur survol carte → profil alti
    window._hoverMarker = L.circleMarker([points[0].lat,points[0].lon],{radius:6,fillColor:'#E5562A',color:'#F3EFE4',weight:2,fillOpacity:1}).addTo(VLState.leafletMap);
    window._hoverMarker.setStyle({opacity:0,fillOpacity:0});

    VLState.leafletMap.on('mousemove',e=>{
      // Trouver le point GPX le plus proche du curseur
      let minDist=Infinity,closest=0;
      points.forEach((p,i)=>{
        const d=Math.pow(p.lat-e.latlng.lat,2)+Math.pow(p.lon-e.latlng.lng,2);
        if(d<minDist){minDist=d;closest=i;}
      });
      const km=(cumDist[closest]/1000);
      // Mettre à jour le marqueur
      window._hoverMarker.setLatLng([points[closest].lat,points[closest].lon]);
      window._hoverMarker.setStyle({opacity:1,fillOpacity:1});
      // Mettre à jour le profil alti via plugin annotation
      if(window._gpxChart){
        const si=samples.findIndex(s=>s.d>=km-0.05&&s.d<=km+0.15);
        if(si>=0){
          window._gpxChart.data.datasets[1]={label:'Pos',data:samples.map((_,i)=>i===si?samples[i].alt:null),borderColor:'#E5562A',backgroundColor:'#E5562A',pointRadius:samples.map((_,i)=>i===si?6:0),pointBackgroundColor:'#E5562A',fill:false,tension:0,showLine:false};
          window._gpxChart.update('none');
        }
      }
    });
    VLState.leafletMap.on('mouseout',()=>{
      window._hoverMarker.setStyle({opacity:0,fillOpacity:0});
      if(window._gpxChart){window._gpxChart.data.datasets[1]={label:'Pos',data:samples.map(()=>null),pointRadius:0};window._gpxChart.update('none');}
    });

    // Marqueurs départ / arrivée
    L.circleMarker([points[0].lat,points[0].lon],{radius:9,fillColor:'#10B981',color:'#0E0D0A',weight:2.5,fillOpacity:1}).bindPopup('<b>Départ</b>').addTo(VLState.leafletMap);
    L.circleMarker([points[points.length-1].lat,points[points.length-1].lon],{radius:9,fillColor:'#F3EFE4',color:'#0E0D0A',weight:2.5,fillOpacity:1}).bindPopup('<b>Arrivée</b>').addTo(VLState.leafletMap);

    // Fit bounds
    const polyAll=L.polyline(allLL);
    VLState.leafletMap.fitBounds(polyAll.getBounds(),{padding:[20,20]});
    VLState.leafletMap.invalidateSize();
    setTimeout(()=>VLState.leafletMap&&VLState.leafletMap.invalidateSize(),150);
  },300);

  // Alti chart avec interactivité
  if(window._gpxChart){window._gpxChart.destroy();window._gpxChart=null;}
  const chartCtx=document.getElementById('gpxChart');

  // Couleur par section sur le profil
  const sectionColors=samples.map(s=>{
    const km=s.d;
    const sec=sections.find(sec=>km>=sec.startKm&&km<=sec.endKm);
    if(!sec)return 'rgba(229,86,42,.08)';
    return {up:'rgba(229,86,42,.18)',down:'rgba(232,162,58,.18)',flat:'rgba(16,185,129,.14)'}[sec.type];
  });

  function syncMapFromChartIdx(idx){
    if(!VLState.leafletMap) return;
    const s=samples[idx];
    if(!s) return;
    const targetDist=s.d*1000;
    const cd=window._gpxCumDist||[];
    let closest=0,minD=Infinity;
    cd.forEach((d,i)=>{const diff=Math.abs(d-targetDist);if(diff<minD){minD=diff;closest=i;}});
    const pts=window._gpxPoints||[];
    if(window._hoverMarker&&pts[closest])window._hoverMarker.setLatLng([pts[closest].lat,pts[closest].lon]).setStyle({opacity:1,fillOpacity:1});
  }

  window._gpxChart=new Chart(chartCtx,{
    type:'line',
    data:{
      labels:samples.map(s=>s.d.toFixed(1)),
      datasets:[
        {label:'Alt',data:samples.map(s=>s.alt),borderColor:'#E5562A',backgroundColor:ctx=>{const g=ctx.chart.ctx.createLinearGradient(0,0,0,240);g.addColorStop(0,'rgba(229,86,42,.3)');g.addColorStop(1,'rgba(229,86,42,0)');return g;},fill:true,tension:.4,pointRadius:0,borderWidth:2,pointHoverRadius:0},
        {label:'Pos',data:samples.map(()=>null),borderColor:'#E5562A',backgroundColor:'#E5562A',pointRadius:0,pointBackgroundColor:'#E5562A',fill:false,tension:0,showLine:false}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            title:i=>`km ${i[0].label}`,
            label:c=>{
              const idx=c.dataIndex;
              const alt=Math.round(c.parsed.y);
              let slope='';
              if(idx>0&&samples[idx-1]?.alt&&samples[idx]?.alt){
                const dAlt=samples[idx].alt-samples[idx-1].alt;
                const dDist=(samples[idx].d-samples[idx-1].d)*1000;
                if(dDist>0){const pct=(dAlt/dDist*100).toFixed(1);slope=` · Pente: ${pct>0?'+':''}${pct}%`;}
              }
              return `Alt: ${alt}m${slope}`;
            }
          },
          mode:'index',intersect:false
        }
      },
      onHover:(e,els,chart)=>{
        if(els.length&&VLState.leafletMap){
          syncMapFromChartIdx(els[0].index);
        } else {
          if(window._hoverMarker)window._hoverMarker.setStyle({opacity:0,fillOpacity:0});
        }
      },
      scales:{
        x:{ticks:{maxTicksLimit:15,font:{size:9},callback:(v,i)=>Number.isInteger(parseFloat(samples[i]?.d))?samples[i].d+'km':''},grid:{color:'rgba(243,239,228,.04)'}},
        y:{min:Math.max(0,altMin-30),max:altMax+30,ticks:{callback:v=>v+'m',font:{size:9}},grid:{color:'rgba(243,239,228,.04)'}}
      }
    }
  });

  // Touch support: sync map marker on mobile swipe over chart
  chartCtx.addEventListener('touchmove',e=>{
    e.preventDefault();
    const touch=e.touches[0];
    const rect=chartCtx.getBoundingClientRect();
    const xRel=touch.clientX-rect.left;
    const chart=window._gpxChart;
    if(!chart)return;
    const area=chart.chartArea;
    if(!area)return;
    const ratio=Math.max(0,Math.min(1,(xRel-area.left)/(area.right-area.left)));
    const idx=Math.round(ratio*(samples.length-1));
    syncMapFromChartIdx(idx);
    if(window._gpxChart){
      window._gpxChart.data.datasets[1]={label:'Pos',data:samples.map((_,i)=>i===idx?samples[i].alt:null),borderColor:'#E5562A',backgroundColor:'#E5562A',pointRadius:samples.map((_,i)=>i===idx?6:0),pointBackgroundColor:'#E5562A',fill:false,tension:0,showLine:false};
      window._gpxChart.update('none');
    }
  },{passive:false});
  chartCtx.addEventListener('touchend',()=>{
    if(window._hoverMarker)window._hoverMarker.setStyle({opacity:0,fillOpacity:0});
    if(window._gpxChart){window._gpxChart.data.datasets[1]={label:'Pos',data:samples.map(()=>null),pointRadius:0};window._gpxChart.update('none');}
  });

  // Toujours stocker le GPX pour permettre la liaison ultérieure
  window._pendingGpxSave = points.filter((_,i)=>i%5===0).map(p=>({lat:p.lat,lon:p.lon,ele:p.ele}));

  // Auto-save to DB when in race event context — capture id/json before async to survive navigation
  if (VLState.currentRaceContext?.id) {
    const savedRaceId = VLState.currentRaceContext.id;
    const savedGpxJson = JSON.stringify(window._pendingGpxSave);
    sb.from('race_calendar')
      .update({gpx_data: savedGpxJson})
      .eq('id', savedRaceId)
      .then(({error}) => {
        if (!error) {
          const idx = VLState.races.findIndex(r=>r.id===savedRaceId);
          if(idx>=0) VLState.races[idx].gpx_data = savedGpxJson;
          if(VLState.currentRaceContext?.id===savedRaceId) VLState.currentRaceContext.gpx_data = savedGpxJson;
          const si = document.getElementById('raceMenuSaveGpx');
          if(si) si.style.display = 'none';
          showToast('GPX enregistré ✓', 'success');
        }
      });
  }
}

export function renderDetailedSection(s, secTimeS, idx=0){
  const trail = isTrailRace();
  const fcMax = VLState.userProfile.fc_max||205;
  const lthr = VLState.userProfile.lactate_threshold||Math.round(fcMax*.88);
  const z2top = VLState.userProfile.fc_z2_top || Math.round(fcMax*.70);
  const z3top = VLState.userProfile.fc_z3_top || Math.round(fcMax*.80);
  const z4top = lthr;

  const cols={up:'var(--vl-ember)',down:'var(--vl-amber)',flat:'var(--vl-growth)'};
  const icons={up:'↑',down:'↓',flat:'→'};
  const names={up:'Montée',down:'Descente',flat:'Plat / Liaison'};
  const distKm=(s.dist/1000).toFixed(2);
  const surfKey=window._gpxSectionSurfaces?.[idx]||null;
  const surf=surfKey?surfaceInfo(surfKey):null;
  const slip=surf?slipRisk(surfKey, window._gpxWeather, s.grade||0):null;
  let tags=[],advice='',rpeBadge='';

  if(s.type==='up'){
    const steep=Math.abs(s.grade)>10;
    const vam=s.dplus>0?Math.round(s.dplus/(secTimeS/3600)):0;

    if(trail){
      const rpe=steep?7:6;
      rpeBadge=`<span class="strat-tag" style="border-color:var(--vl-ember)40;color:var(--vl-ember);font-weight:700">RPE ${rpe}/10</span>`;
      tags=[
        {l:`${distKm} km`,c:'var(--vl-ember)'},
        {l:`+${s.dplus}m D+`,c:'var(--vl-ember)'},
        {l:`${Math.abs(s.grade).toFixed(1)}% pente`,c:'var(--vl-amber)'},
        {l:steep?'RPE 7 max — marche si > 8':'RPE 6-7 max',c:'var(--vl-text-2)'},
        {l:steep?'Marche active recommandée':'Courir régulier',c:'var(--vl-growth)'}
      ];
      if(surf) tags.push({l:`${surf.emoji} ${surf.fr}${slip?' · '+slip:''}`,c:surf.col});
      advice=steep
        ? `<strong>Montée raide (${Math.abs(s.grade).toFixed(1)}%)</strong> — passe en <strong>marche active</strong> dès que tu ne peux plus tenir une conversation (RPE 8+). La marche rapide est souvent plus efficace que courir en souffrant ici.<br><span class="mono t3" style="font-size:.6rem">FC indicative : si tu dépasses Z4 (≥${z4top} bpm) durablement, ralentis.</span>${vam>0?`<br>VAM requise ~${vam} m/h.`:''}`
        : `<strong>Montée modérée (${Math.abs(s.grade).toFixed(1)}%)</strong> — foulée courte et fréquente, appuis avant-pied, bras actifs. Vise RPE 6-7 : tu dois pouvoir dire 2-3 mots entre chaque respiration.<br><span class="mono t3" style="font-size:.6rem">FC indicative : Z4 (${z3top}-${z4top} bpm) acceptable, attention si ça dure.</span>${vam>0?`<br>VAM requise ~${vam} m/h.`:''}`;
    } else {
      // Route — basé sur FC structurée
      const fcCible=steep?Math.round(z4top*.96):Math.round(z4top*.92);
      tags=[
        {l:`${distKm} km`,c:'var(--vl-ember)'},
        {l:`+${s.dplus}m D+`,c:'var(--vl-ember)'},
        {l:`${Math.abs(s.grade).toFixed(1)}% pente`,c:'var(--vl-amber)'},
        {l:`FC < ${fcCible} bpm`,c:'var(--vl-text-2)'},
      ];
      advice=`<strong>Côte (${Math.abs(s.grade).toFixed(1)}%)</strong> — maintenir FC sous <strong>${fcCible} bpm</strong> (${steep?'96':'92'}% LTHR). Raccourcir la foulée, ne pas chercher à maintenir l'allure — la FC est ton gouverneur ici.`;
    }

  } else if(s.type==='down'){
    const technical=Math.abs(s.grade)>12;
    const highRiskTerrain=surf&&(surf.risk==='high'||surf.risk==='medium');
    if(trail){
      tags=[
        {l:`${distKm} km`,c:'var(--vl-amber)'},
        {l:`-${s.dminus}m D-`,c:'var(--vl-amber)'},
        {l:`${Math.abs(s.grade).toFixed(1)}% pente`,c:'var(--vl-text-2)'},
        {l:'RPE 3-4',c:'var(--vl-text-2)'},
        {l:'Récupération active',c:'var(--vl-growth)'}
      ];
      if(surf) tags.push({l:`${surf.emoji} ${surf.fr}${slip?' · '+slip:''}`,c:surf.col});
      const terrainNote=slip?`<br><span class="mono t3" style="font-size:.6rem;color:var(--vl-ember)">${icon('warning',14)} Sol ${slip} — réduis l'amplitude, priorise la sécurité sur le chrono.</span>`
        :(surf&&surf.risk!=='none'?`<br><span class="mono t3" style="font-size:.6rem">Revêtement : ${surf.fr} — adapte l'amplitude à l'adhérence.</span>`:'');
      advice=(technical||highRiskTerrain)
        ? `<strong>Descente technique (${Math.abs(s.grade).toFixed(1)}%${surf?` · ${surf.fr}`:''})</strong> — foulées très courtes et rapides, regard 2-3m devant, léger penché avant. Ne jamais freiner avec les talons (impact 3-4× ton poids). RPE 4 max.${terrainNote}<br><span class="mono t3" style="font-size:.6rem">FC : elle va naturellement redescendre ici, profite-en.</span>`
        : `<strong>Descente douce (${Math.abs(s.grade).toFixed(1)}%)</strong> — foulées courtes et rapides, laisse la FC descendre sous Z3 (${z2top}-${z3top} bpm). C'est ta fenêtre de récupération. RPE 3-4.${terrainNote}`;
    } else {
      tags=[
        {l:`${distKm} km`,c:'var(--vl-amber)'},
        {l:`-${s.dminus}m D-`,c:'var(--vl-amber)'},
        {l:'Récupération',c:'var(--vl-growth)'},
      ];
      advice=`<strong>Descente</strong> — allure légèrement accélérée, contrôlée. FC qui redescend sous ${z3top} bpm. Profite pour récupérer avant la prochaine côte.`;
    }

  } else {
    if(trail){
      tags=[
        {l:`${distKm} km`,c:'var(--vl-growth)'},
        {l:'RPE 4-5',c:'var(--vl-growth)'},
        {l:'Récupération active',c:'var(--vl-text-2)'}
      ];
      if(surf) tags.push({l:`${surf.emoji} ${surf.fr}${slip?' · '+slip:''}`,c:surf.col});
      advice=`<strong>Section plate / liaison</strong> — laisse la FC redescendre, reprends la respiration. RPE 4-5 : tu dois pouvoir parler en phrases courtes. Si tu as un ravito, c'est ici qu'on mange et qu'on boit.`;
    } else {
      tags=[
        {l:`${distKm} km`,c:'var(--vl-growth)'},
        {l:`FC cible ${Math.round(z4top*.9)}-${Math.round(z4top*.95)} bpm`,c:'var(--vl-growth)'},
      ];
      advice=`<strong>Section plate</strong> — allure cible, FC maintenue entre ${Math.round(z4top*.9)} et ${Math.round(z4top*.95)} bpm (90-95% LTHR). C'est ton allure de croisière sur route.`;
    }
  }

  return `<div class="vl-section-card" style="border-left-color:${cols[s.type]}" onclick="highlightSection(${idx})" data-idx="${idx}">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.3rem">
      <div class="strat-km">km ${s.startKm.toFixed(1)} → ${s.endKm.toFixed(1)}</div>
      <div class="mono t2" style="font-size:.6rem">${fmtT(secTimeS)} estimé</div>
    </div>
    <div class="strat-name" style="color:${cols[s.type]}">${icons[s.type]} ${names[s.type]}</div>
    <div class="strat-tags">${tags.map(t=>`<span class="strat-tag" style="border-color:${t.c}40;color:${t.c}">${t.l}</span>`).join('')}</div>
    <div class="strat-body">${advice}</div>
  </div>`;
}

export function buildSplitsTable(kmSecs, basePaceS){
  const fcMax=VLState.userProfile.fc_max||205;
  const pct88=Math.round(fcMax*.88),pct84=Math.round(fcMax*.84),pct79=Math.round(fcMax*.79);
  const _vam=VLState.userProfile.vam_avg||0,_cu=VLState.userProfile.coeff_uphill||0,_cd=VLState.userProfile.coeff_downhill||0,_cf=VLState.userProfile.coeff_flat||0;
  let cumTime=0,rows='';
  kmSecs.filter(s=>s!=null&&s.km!=null&&s.grade!=null).forEach(s=>{
    const distKm=(s.dist||0)/1000;
    const g=s.grade/100,type=s.grade>4?'up':s.grade<-4?'down':'flat';
    let pente;
    if(type==='up'&&_vam>0&&g>0.01){const vp=3_600_000*g/_vam;pente=Math.max(0,vp/basePaceS-1);}
    else if(type==='up'&&_cu>0){pente=minettiGradePenalty(g)*_cu;}
    else if(type==='down'&&_cd>0){pente=minettiGradePenalty(g)*_cd;}
    else if(type==='flat'&&_cf>0){pente=minettiGradePenalty(g)*_cf;}
    else{pente=minettiGradePenalty(g);}
    const secTime=basePaceS*(1+pente)*distKm;
    cumTime+=secTime;
    const fc={up:`< ${Math.abs(s.grade)>10?pct84:pct88} bpm`,down:'Libre',flat:`< ${pct79} bpm`}[type];
    const conseil={up:Math.abs(s.grade)>10?'Marche active':'Courir régulier',down:'Foulées courtes',flat:'Récup'}[type];
    rows+=`<tr class="section-${type}"><td class="mono">${(s.startKm??0).toFixed(1)}→${s.km.toFixed(1)}</td><td>${{up:'⛰️',down:'🎿',flat:'➡️'}[type]}</td><td class="mono" style="color:${{up:'var(--orange)',down:'var(--purple)',flat:'var(--cyan)'}[type]}">${s.grade>0?'+':''}${s.grade.toFixed(1)}%</td><td class="mono ${s.dplus>0?'to':''}">${s.dplus>0?`+${s.dplus}m`:'—'}</td><td class="mono ${s.dminus>0?'tp':''}">${s.dminus>0?`-${s.dminus}m`:'—'}</td><td class="mono t2">${s.altEnd||'—'}m</td><td class="mono">${fmtT(secTime)}</td><td class="mono tc">${fmtT(cumTime)}</td><td style="font-size:.68rem;color:var(--text2)">${conseil} · FC ${fc}</td></tr>`;
  });
  return rows;
}


let sectionMapInst = null;
let sectionAltiChartInst = null;

function highlightSection(idx) {
  window._activeSection = idx;
  document.querySelectorAll('.vl-section-card').forEach((el,i)=>{
    el.classList.toggle('active',i===idx);
  });
  // Open popup
  openSectionPopup(idx);
}

function openSectionPopup(idx) {
  const sections = window._gpxSections||[];
  const points = window._gpxPoints||[];
  const samples = window._gpxSamples||[];
  const distKm = window._gpxDistKm||1;
  if(!sections[idx]) return;

  const s = sections[idx];
  const total = sections.length;
  const fcMax = VLState.userProfile.fc_max||205;
  const pct88=Math.round(fcMax*.88),pct84=Math.round(fcMax*.84),pct79=Math.round(fcMax*.79);
  const cols={up:'var(--vl-ember)',down:'var(--vl-amber)',flat:'var(--vl-growth)'};
  const icons={up:'↑',down:'↓',flat:'→'};
  const names={up:'Montée',down:'Descente',flat:'Plat'};
  const distKmSec=(s.dist/1000).toFixed(2);

  // Title + counter
  document.getElementById('sectionPopupTitle').innerHTML=`<span style="color:${cols[s.type]}">${icons[s.type]} ${names[s.type]}</span> · km ${s.startKm.toFixed(1)}→${s.endKm.toFixed(1)}`;
  document.getElementById('sectionPopupCounter').textContent=`Section ${idx+1} / ${total}`;

  // Nav buttons
  document.getElementById('btnPrevSection').disabled = idx===0;
  document.getElementById('btnNextSection').disabled = idx===total-1;

  // Stats
  const statData = [
    {v:`${distKmSec} km`,l:'Distance'},
    s.type==='up'?{v:`+${s.dplus}m`,l:'D+',c:'var(--vl-ember)'}:null,
    s.type==='down'?{v:`-${s.dminus}m`,l:'D-',c:'var(--vl-amber)'}:null,
    {v:`${s.grade>0?'+':''}${s.grade.toFixed(1)}%`,l:'Pente moy',c:s.type==='up'?'var(--vl-ember)':s.type==='down'?'var(--vl-amber)':'var(--vl-growth)'},
    {v:`FC ${s.type==='up'?(Math.abs(s.grade)>10?`<${pct84}`:`<${pct88}`):s.type==='down'?'Libre':`<${pct79}`} bpm`,l:'FC cible'},
  ].filter(Boolean);
  document.getElementById('sectionPopupStats').innerHTML=statData.map(d=>`<div class="s-stat"><div class="s-sv" style="${d.c?`color:${d.c}`:''}">${d.v}</div><div class="s-sl">${d.l}</div></div>`).join('');

  // Advice
  const trail = isTrailRace();
  const lthr = VLState.userProfile.lactate_threshold || Math.round(fcMax*.88);
  const z3top = Math.round(fcMax*.80);
  const z4top = lthr;
  let advice='';
  if(s.type==='up'){
    const steep=Math.abs(s.grade)>10;
    if(trail){
      advice=steep
        ? `<strong>Montée raide (${Math.abs(s.grade).toFixed(1)}%)</strong> — RPE 7 max. Marche active si tu ne peux plus parler (RPE 8+). Cadence courte, appuis avant-pied, bras actifs.<br><span class="mono t3" style="font-size:.6rem">FC indicative : si tu dépasses Z4 (≥${z4top} bpm) durablement → ralentis.</span>`
        : `<strong>Montée modérée (${Math.abs(s.grade).toFixed(1)}%)</strong> — RPE 6-7. Tu dois pouvoir dire 2-3 mots entre chaque respiration.<br><span class="mono t3" style="font-size:.6rem">FC indicative : Z3-Z4 (${z3top}-${z4top} bpm) acceptable.</span>`;
    } else {
      const fcCible = steep ? Math.round(z4top*.96) : Math.round(z4top*.92);
      advice=`<strong>Côte (${Math.abs(s.grade).toFixed(1)}%)</strong> — maintenir FC sous <strong>${fcCible} bpm</strong> (${steep?'96':'92'}% LTHR). Raccourcir la foulée, ne pas chercher à maintenir l'allure.`;
    }
  } else if(s.type==='down'){
    const technical=Math.abs(s.grade)>12;
    if(trail){
      advice=technical
        ? `<strong>Descente technique (${Math.abs(s.grade).toFixed(1)}%)</strong> — RPE 4. Foulées très courtes, regard 2-3m devant. Ne pas freiner avec les talons. FC redescend naturellement.`
        : `<strong>Descente douce (${Math.abs(s.grade).toFixed(1)}%)</strong> — RPE 3-4. Foulées courtes rapides. Laisse la FC redescendre sous Z3 (${z3top} bpm).`;
    } else {
      advice=`<strong>Descente</strong> — allure légèrement accélérée. FC qui redescend sous ${z3top} bpm. Récupère avant la prochaine côte.`;
    }
  } else {
    if(trail){
      advice=`<strong>Liaison plate</strong> — RPE 4-5. Laisse la FC redescendre, reprends la respiration. Tu dois pouvoir parler en phrases courtes. Ravitaille ici si besoin.`;
    } else {
      advice=`<strong>Plat</strong> — allure cible, FC entre ${Math.round(z4top*.90)} et ${Math.round(z4top*.95)} bpm (90-95% LTHR).`;
    }
  }
  document.getElementById('sectionPopupAdvice').innerHTML=`<div class="clabel">Conseils</div><div style="font-size:.82rem;line-height:1.6;color:var(--text2)">${advice}</div>`;

  // Open overlay
  document.getElementById('sectionPopup').classList.add('open');
  document.body.style.overflow='hidden';

  // Section points for map
  const si=Math.round((s.startKm/distKm)*points.length);
  const ei=Math.min(Math.round((s.endKm/distKm)*points.length),points.length-1);
  const segPts=points.slice(si,ei+1);

  // Mini map
  setTimeout(()=>{
    if(sectionMapInst){sectionMapInst.remove();sectionMapInst=null;}
    sectionMapInst=L.map('sectionMap',{zoomControl:false,scrollWheelZoom:false,dragging:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(sectionMapInst);
    const col={up:'#E5562A',down:'#E8A23A',flat:'#10B981'}[s.type];
    const ll=segPts.filter((_,i)=>i%3===0).map(p=>[p.lat,p.lon]);
    const poly=L.polyline(ll,{color:col,weight:5,opacity:1}).addTo(sectionMapInst);
    L.circleMarker([segPts[0].lat,segPts[0].lon],{radius:8,fillColor:'#10B981',color:'#0E0D0A',weight:2,fillOpacity:1}).addTo(sectionMapInst);
    L.circleMarker([segPts[segPts.length-1].lat,segPts[segPts.length-1].lon],{radius:8,fillColor:'#F3EFE4',color:'#0E0D0A',weight:2,fillOpacity:1}).addTo(sectionMapInst);
    sectionMapInst.fitBounds(poly.getBounds(),{padding:[20,20]});
  },100);

  // Mini alti chart — section only
  if(sectionAltiChartInst){sectionAltiChartInst.destroy();sectionAltiChartInst=null;}
  const secSamples=samples.filter(s2=>s2.d>=s.startKm&&s2.d<=s.endKm+0.1);
  if(secSamples.length>1){
    const col={up:'#E5562A',down:'#E8A23A',flat:'#10B981'}[s.type];
    sectionAltiChartInst=new Chart(document.getElementById('sectionAltiChart'),{
      type:'line',
      data:{labels:secSamples.map(s=>s.d.toFixed(1)),datasets:[{data:secSamples.map(s=>s.alt),borderColor:col,backgroundColor:col+'28',fill:true,tension:.4,pointRadius:0,borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:i=>`km ${i[0].label}`,label:c=>`${Math.round(c.parsed.y)}m`}}},scales:{x:{ticks:{font:{size:8},maxTicksLimit:6,callback:(v,i)=>secSamples[i]?.d+'km'},grid:{display:false}},y:{ticks:{font:{size:8},callback:v=>v+'m'},grid:{color:'rgba(243,239,228,.04)'}}}}
    });
  }
}

export function navigateSection(dir) {
  const sections=window._gpxSections||[];
  const next=window._activeSection+dir;
  if(next>=0&&next<sections.length){
    window._activeSection=next;
    document.querySelectorAll('.vl-section-card').forEach((el,i)=>el.classList.toggle('active',i===next));
    openSectionPopup(next);
  }
}

export function closeSectionPopup() {
  document.getElementById('sectionPopup').classList.remove('open');
  document.body.style.overflow='';
  if(sectionMapInst){sectionMapInst.remove();sectionMapInst=null;}
  if(sectionAltiChartInst){sectionAltiChartInst.destroy();sectionAltiChartInst=null;}
  window._activeSection=-1;
  document.querySelectorAll('.vl-section-card').forEach(el=>el.classList.remove('active'));
}

export function resetStrategy(){
  document.getElementById('stratResult').style.display='none';
  document.getElementById('stratResult').innerHTML='';
  const drop=document.getElementById('gpxDrop');
  drop.style.display='block';
  drop.onclick=()=>document.getElementById('gpxFile').click();
  drop.innerHTML=`<div style="font-size:2.5rem;margin-bottom:.75rem">${icon('map',28)}</div><div style="font-family:var(--display);font-size:1.4rem;letter-spacing:.03em;margin-bottom:.4rem">Déposer le fichier GPX</div><div class="mono">Compatible OpenRunner · Strava · Garmin Connect</div>`;
  document.getElementById('gpxFile').value='';
  VLState.currentRaceContext=null;
  window._activeSection=-1;
  window._sectionPolylines=[];
  window._pendingGpxSave=null;
  if(VLState.leafletMap){VLState.leafletMap.remove();VLState.leafletMap=null;}
  if(window._gpxChart){window._gpxChart.destroy();window._gpxChart=null;}
}

export function linkGpxToRaceById(raceId) {
  if(!raceId) return;
  const race = VLState.races.find(r=>String(r.id)===String(raceId));
  if(!race) return;
  VLState.currentRaceContext = race;
  saveGpxToRace();
}

export function populateRaceSelector(){
  const container=document.getElementById('raceSelectorList');
  // raceSelector block is hidden in event view (the analyzeGPX output handles association)
  const sel=document.getElementById('raceSelector');
  if(!container||!sel) return;
  if(!VLState.races.length){sel.style.display='none';return;}
  // Only show if not in event view
  if(document.getElementById('eventView')?.style.display!=='none') return;
  sel.style.display='block';
  container.innerHTML=VLState.races.filter(r=>new Date(r.date)>=new Date()).map(r=>`<button class="race-sel-btn" onclick="selectRaceForStrategy(${JSON.stringify(r).replace(/"/g,'&quot;')})">${escapeHTML(r.name)} · ${new Date(r.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}</button>`).join('');
}

export function selectRaceForStrategy(race){
  document.querySelectorAll('.race-sel-btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  VLState.currentRaceContext=race;
  if(race.gpx_data){const pts=JSON.parse(race.gpx_data);analyzeGPX(pts,race.name);}
  else document.getElementById('gpxFile').click();
}
