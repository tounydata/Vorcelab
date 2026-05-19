function hav(p1,p2){const R=6371000,r=Math.PI/180,dLat=(p2.lat-p1.lat)*r,dLon=(p2.lon-p1.lon)*r,a=Math.sin(dLat/2)**2+Math.cos(p1.lat*r)*Math.cos(p2.lat*r)*Math.sin(dLon/2)**2;return R*2*Math.asin(Math.sqrt(a));}

// Minetti (2002) gradient penalty — uphill validated, downhill empirical trail model
function minettiGradePenalty(grade) {
  if(grade >= 0) {
    const i=Math.min(grade, 0.50);
    const c=280.5*i**5 - 58.7*i**4 - 76.8*i**3 + 51.9*i**2 + 19.6*i + 2.5;
    return c/2.5 - 1;
  } else {
    const g=Math.abs(grade);
    if(g<=0.12) return -g*0.5;
    if(g<=0.25) return -0.06+(g-0.12)*1.5;
    return 0.135+(g-0.25)*3.0;
  }
}

function buildDetailedSections(kmSecs){
  if(!kmSecs.length) return [];

  // Helper: get endKm from either field name (analyzeGPX uses 'km', comparison uses 'endKm')
  const endOf = s => s.km ?? s.endKm ?? s.startKm;

  // Build cumulative net altitude profile: cumAlt[i] = net gain from start to end of segment i
  const cumAlt = [0];
  for(const s of kmSecs) cumAlt.push(cumAlt[cumAlt.length-1] + s.dplus - (s.dminus||0));

  // No smoothing — use raw profile so short climbs are preserved
  const MIN_CHANGE = 12; // metres — minimum amplitude to create a section

  // Pass 1: collect all local extrema on raw cumAlt
  const extrema = [{idx:0, alt:cumAlt[0]}];
  for(let i=1;i<cumAlt.length-1;i++){
    const prev=cumAlt[i-1], cur=cumAlt[i], next=cumAlt[i+1];
    const isPeak = cur>=prev && cur>=next;
    const isVall = cur<=prev && cur<=next;
    if(isPeak||isVall){
      const last=extrema[extrema.length-1];
      if(Math.abs(cur-last.alt)>=MIN_CHANGE){
        extrema.push({idx:i, alt:cur});
      } else {
        // Extend in same direction (keep the more extreme value)
        const isGoingUp = cur > last.alt;
        if(isGoingUp && cur > last.alt) extrema[extrema.length-1] = {idx:i, alt:cur};
        else if(!isGoingUp && cur < last.alt) extrema[extrema.length-1] = {idx:i, alt:cur};
      }
    }
  }
  extrema.push({idx:cumAlt.length-1, alt:cumAlt[cumAlt.length-1]});

  // Pass 2: merge extrema that are too close in altitude (< MIN_CHANGE)
  const filtered=[extrema[0]];
  for(let i=1;i<extrema.length;i++){
    const last=filtered[filtered.length-1];
    const diff=extrema[i].alt-last.alt;
    if(Math.abs(diff)>=MIN_CHANGE){
      filtered.push(extrema[i]);
    } else {
      // Replace with whichever is more extreme relative to the point before last
      const prev2=filtered.length>=2?filtered[filtered.length-2]:null;
      if(!prev2){filtered[filtered.length-1]=extrema[i];}
      else if(extrema[i].alt>last.alt) filtered[filtered.length-1]={idx:extrema[i].idx,alt:Math.max(last.alt,extrema[i].alt)};
      else filtered[filtered.length-1]={idx:extrema[i].idx,alt:Math.min(last.alt,extrema[i].alt)};
    }
  }

  const out=[];
  for(let i=0;i<filtered.length-1;i++){
    const from=filtered[i], to=filtered[i+1];
    const fromIdx=Math.max(0,Math.min(from.idx,kmSecs.length-1));
    const toIdx=Math.max(0,Math.min(to.idx,kmSecs.length));
    const segs=kmSecs.slice(fromIdx,toIdx);
    if(!segs.length) continue;
    const dp=segs.reduce((a,s)=>a+s.dplus,0);
    const dm=segs.reduce((a,s)=>a+(s.dminus||0),0);
    const dist=segs.reduce((a,s)=>a+s.dist,0);
    const netAlt=to.alt-from.alt;
    const avgGrade=dist>0?netAlt/dist*100:0;
    const type=netAlt>=MIN_CHANGE?'up':netAlt<=-MIN_CHANGE?'down':'flat';
    const startKm=segs[0].startKm;
    const endKm=endOf(segs[segs.length-1]);
    out.push({type,startKm,endKm,dplus:Math.round(dp),dminus:Math.round(dm),dist,grade:+avgGrade.toFixed(1)});
  }

  // Merge consecutive flat sections
  const merged=[];
  for(const s of out){
    const last=merged[merged.length-1];
    if(last&&last.type==='flat'&&s.type==='flat'){
      last.endKm=s.endKm; last.dplus+=s.dplus; last.dminus+=s.dminus;
      last.dist+=s.dist; last.grade=last.dist>0?(last.dplus-last.dminus)/last.dist*100:0;
    } else merged.push({...s});
  }

  if(!merged.length){
    const dp=kmSecs.reduce((a,s)=>a+s.dplus,0);
    const dm=kmSecs.reduce((a,s)=>a+(s.dminus||0),0);
    const dist=kmSecs.reduce((a,s)=>a+s.dist,0);
    return [{type:'flat',startKm:kmSecs[0].startKm,endKm:endOf(kmSecs[kmSecs.length-1]),dplus:Math.round(dp),dminus:Math.round(dm),dist,grade:0}];
  }
  return merged;
}

function isTrailRace() {
  // Check currentRaceContext type or default to trail if GPX has significant D+
  if(currentRaceContext?.type) return ['Trail','TrailRun','trail'].includes(currentRaceContext.type);
  const pts = window._gpxPoints||[];
  if(!pts.length) return true;
  let dplus=0;
  for(let i=1;i<pts.length;i++){const d=pts[i].ele-pts[i-1].ele;if(d>0)dplus+=d;}
  const dist=(window._gpxDistKm||1);
  return dplus/dist > 20; // >20m D+/km = trail
}

// RPE Scale
const RPE_SCALE = [
  {rpe:1,label:'Très facile',desc:'Marche, échauffement — tu pourrais chanter'},
  {rpe:2,label:'Très facile',desc:'Footing très lent, conversation fluide sans effort'},
  {rpe:3,label:'Facile',desc:'Footing Z2, tu parles en phrases complètes, pourrait durer des heures'},
  {rpe:4,label:'Facile',desc:'Rythme confortable, phrases courtes aisées, respiration légèrement audible'},
  {rpe:5,label:'Modéré',desc:'Allure marathon, phrases courtes, respiration audible mais contrôlée'},
  {rpe:6,label:'Modéré-difficile',desc:'Allure semi, 2-3 mots entre respirations, rythme soutenu'},
  {rpe:7,label:'Difficile',desc:'Allure 10k/montée trail soutenue, 1-2 mots max, souffle court'},
  {rpe:8,label:'Très difficile',desc:'Limite à tenir, quasi impossible de parler, fort essoufflement'},
  {rpe:9,label:'Extrême',desc:'Sprint long, impossible de parler, insoutenable >2min'},
  {rpe:10,label:'Maximum',desc:'Effort total, insoutenable >30 secondes'},
];

