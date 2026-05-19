// Applique un coefficient de difficulté terrain au temps estimé par section.
// Paramètres : clé de surface OSM, météo courante, pente en %, type de section (optionnel).
// Retourne un multiplicateur ≥ 1. Plafond à 1.35 pour rester prudent.
function terrainTimePenalty(surfaceKey, weather, grade = 0, sectionType = null) {
  if (!surfaceKey) return 1;

  const base = TERRAIN_TIME_FACTORS[surfaceKey] ?? 1.04;

  const wet = weather && (
    (weather.precip_prob ?? 0) > 20 ||
    (weather.precip_recent ?? weather.precip ?? 0) > 0.3
  );

  const veryWet = weather && (
    (weather.precip_prob ?? 0) > 50 ||
    (weather.precip_recent ?? weather.precip ?? 0) > 2
  );

  // Surfaces dures : bitume, béton, revêtement — pas de pénalité météo
  const hardSurfaces = ['asphalt', 'concrete', 'paved'];

  // Surfaces instables en descente raide
  const unstableSurfaces = ['gravel', 'fine_gravel', 'pebblestone', 'rock', 'rocks', 'scree', 'mud', 'grass', 'sand'];

  // Surfaces déformables en montée raide (pied qui s'enfonce)
  const deformableSurfaces = ['mud', 'sand', 'grass'];

  const steepDown = grade < -10;
  const steepUp = grade > 10;

  let factor = base;

  // Humide sur surface non dure : légère pénalité
  if (wet && !hardSurfaces.includes(surfaceKey)) factor += 0.02;

  // Très humide sur surface non dure : pénalité supplémentaire
  if (veryWet && !hardSurfaces.includes(surfaceKey)) factor += 0.03;

  // Descente raide + terrain instable : risque de glisse, freinage actif
  if (steepDown && unstableSurfaces.includes(surfaceKey)) factor += 0.05;

  // Montée raide + sol meuble : pied qui s'enfonce, effort accru
  if (steepUp && deformableSurfaces.includes(surfaceKey)) factor += 0.04;

  return Math.min(1.35, Math.max(1, factor));
}

// ════════════ TERRAIN SURFACES via OSM Overpass ════════════

// Facteurs terrain initiaux pour la projection chrono.
// Valeurs prudentes : elles traduisent une difficulté relative du terrain.
// Objectif : éviter de sous-estimer les sections meubles, instables ou techniques.
// Ces coefficients pourront être recalibrés avec l'historique réel de l'utilisateur.
const TERRAIN_TIME_FACTORS = {
  // Surfaces dures — référence neutre
  asphalt:     1.00,
  concrete:    1.00,
  paved:       1.00,
  // Piste compacte — très faible pénalité
  compacted:   1.02,
  track:       1.02,
  // Sentiers — faible pénalité
  path:        1.05,
  footway:     1.05,
  bridleway:   1.05,
  // Terre / sol naturel
  dirt:        1.06,
  ground:      1.06,
  grass:       1.07,
  // Granulats / pavés — pénalité moyenne
  gravel:      1.08,
  fine_gravel: 1.07,
  pebblestone: 1.09,
  cobblestone: 1.08,
  // Terrains instables / techniques — pénalité plus élevée
  sand:        1.15,
  mud:         1.18,
  rock:        1.12,
  rocks:       1.12,
  scree:       1.15,
};

const SURFACE_MAP={
  rock:{fr:'Rochers',emoji:'🪨',risk:'high',col:'var(--red)'},
  rocks:{fr:'Rochers',emoji:'🪨',risk:'high',col:'var(--red)'},
  scree:{fr:'Éboulis',emoji:'⛰️',risk:'high',col:'var(--red)'},
  mud:{fr:'Boue',emoji:'💧',risk:'high',col:'var(--red)'},
  sand:{fr:'Sable',emoji:'🏖️',risk:'high',col:'var(--orange)'},
  gravel:{fr:'Gravier',emoji:'🪨',risk:'medium',col:'var(--orange)'},
  fine_gravel:{fr:'Gravier fin',emoji:'🪨',risk:'medium',col:'var(--yellow)'},
  pebblestone:{fr:'Cailloux',emoji:'🪨',risk:'medium',col:'var(--orange)'},
  dirt:{fr:'Terre',emoji:'🌿',risk:'medium',col:'var(--yellow)'},
  ground:{fr:'Sol naturel',emoji:'🌿',risk:'medium',col:'var(--yellow)'},
  grass:{fr:'Herbe',emoji:'🌿',risk:'medium',col:'var(--yellow)'},
  cobblestone:{fr:'Pavés',emoji:'🧱',risk:'medium',col:'var(--orange)'},
  compacted:{fr:'Compacté',emoji:'🔵',risk:'low',col:'var(--cyan)'},
  paved:{fr:'Bitume',emoji:'🛣️',risk:'none',col:'var(--text3)'},
  asphalt:{fr:'Bitume',emoji:'🛣️',risk:'none',col:'var(--text3)'},
  concrete:{fr:'Béton',emoji:'🛣️',risk:'none',col:'var(--text3)'},
  path:{fr:'Sentier',emoji:'🥾',risk:'medium',col:'var(--yellow)'},
  track:{fr:'Chemin',emoji:'🥾',risk:'low',col:'var(--cyan)'},
  footway:{fr:'Sentier',emoji:'🥾',risk:'medium',col:'var(--yellow)'},
  bridleway:{fr:'Piste',emoji:'🥾',risk:'medium',col:'var(--yellow)'},
};
function surfaceInfo(k){return SURFACE_MAP[k]||{fr:escapeHTML(k),emoji:'🌍',risk:'medium',col:'var(--text2)'};}

function _ptSegDist(px,py,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
  if(!len) return Math.hypot(px-ax,py-ay);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len));
  return Math.hypot(px-ax-t*dx,py-ay-t*dy);
}

async function fetchTerrainSurfaces(points, sections) {
  try {
    const lats=points.map(p=>p.lat),lons=points.map(p=>p.lon);
    const S=Math.min(...lats).toFixed(5),N=Math.max(...lats).toFixed(5);
    const W=Math.min(...lons).toFixed(5),E=Math.max(...lons).toFixed(5);
    const q=`[out:json][timeout:25];(way(${S},${W},${N},${E})["surface"];way(${S},${W},${N},${E})["highway"~"^(path|track|footway|bridleway)$"];);out body geom;`;
    const ctrl=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(18000):undefined;
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q),signal:ctrl});
    if(!res.ok) return sections.map(()=>null);
    const {elements=[]}=await res.json();
    const ways=elements.filter(e=>e.geometry?.length>=2);

    const cumDist=[0];
    for(let i=1;i<points.length;i++) cumDist.push(cumDist[i-1]+hav(points[i-1],points[i]));

    return sections.map(s=>{
      const mid=((s.startKm+(s.endKm??s.km??s.startKm))/2)*1000;
      let ci=0,minD=Infinity;
      cumDist.forEach((d,i)=>{const dd=Math.abs(d-mid);if(dd<minD){minD=dd;ci=i;}});
      const pt=points[ci]; if(!pt) return null;
      let bestD=Infinity,bestSurf=null;
      for(const way of ways){
        const g=way.geometry;
        for(let i=0;i<g.length-1;i++){
          const d=_ptSegDist(pt.lat,pt.lon,g[i].lat,g[i].lon,g[i+1].lat,g[i+1].lon);
          if(d<bestD){bestD=d;bestSurf=way.tags?.surface||way.tags?.highway||null;}
        }
      }
      return bestD<0.0007?bestSurf:null;
    });
  } catch { return sections.map(()=>null); }
}

function slipRisk(surfKey, weather, grade=0) {
  if(!surfKey) return null;
  const info=SURFACE_MAP[surfKey]; if(!info||info.risk==='none') return null;
  // Normalise : weather peut venir du forecast (precip_prob+precip_recent) ou de l'archive (precip en mm)
  const prob  = weather?.precip_prob ?? (weather?.precip > 0 ? 70 : 0);
  const mm6h  = weather?.precip_recent ?? weather?.precip ?? 0;
  const wet   = prob > 20 || mm6h > 0.3;
  const vwet  = prob > 50 || mm6h > 2;
  const steep = Math.abs(grade) > 10;

  if(surfKey==='mud') return 'boue — très glissant';
  if(surfKey==='sand') return 'sable instable';

  // Herbe : glissante avec très peu de pluie (rosée suffit)
  if(surfKey==='grass') return wet?'glissant (herbe mouillée)':null;

  // Rochers / éboulis : technique sec, très glissant humide
  if(surfKey==='rock'||surfKey==='rocks'||surfKey==='scree')
    return wet?'très glissant (rochers humides)':'terrain rocheux technique';

  // Gravier/cailloux : instable en descente raide même sec (poussière + matériaux mobiles)
  if(surfKey==='gravel'||surfKey==='fine_gravel'||surfKey==='pebblestone'){
    if(vwet) return 'très glissant (graviers détrempés)';
    if(wet)  return 'glissant (graviers humides)';
    if(steep) return 'instable (graviers/poussière — descente raide)';
    return null;
  }

  // Terre / sol naturel : glissant dès les premières gouttes
  if(surfKey==='dirt'||surfKey==='ground')
    return wet?'glissant (terre détrempée)':null;

  // Pavés / cobblestone
  if(surfKey==='cobblestone') return wet?'glissant (pavés mouillés)':null;

  // Sentier générique
  if(info.risk==='high') return wet?'très glissant':'terrain technique';
  if(info.risk==='medium'&&vwet) return 'glissant (humide)';
  return null;
}

