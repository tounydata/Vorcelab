// Future ES module exports:
// - NUTRITION_DB
// - getUserGels
// - getUserBoissons
// - genNutrition
// - renderNutritionProducts
// - filterNutrBrand
// - saveNutritionProducts

const NUTRITION_DB = {
  gels:[
    {id:'naak-ultra',brand:'Näak',name:'Ultra Energy Gel',carbs:27,caffeine:35,water:false,note:'Semi-liquide, sans eau requis'},
    {id:'naak-boost25',brand:'Näak',name:'Boost Gel 25',carbs:25,caffeine:0,water:false,note:'Sans eau requis'},
    {id:'naak-boost30',brand:'Näak',name:'Boost Gel 30',carbs:30,caffeine:0,water:false,note:'Sans eau requis'},
    {id:'naak-boost-caf',brand:'Näak',name:'Boost Gel Thé Pêche (caféine)',carbs:30,caffeine:100,water:false,note:'Sans eau, 100mg caféine'},
    {id:'ta-gel',brand:'TA Energy',name:'Énergie Gel',carbs:33,caffeine:0,water:true,note:'Avec eau obligatoire'},
    {id:'ta-gel-caf',brand:'TA Energy',name:'Énergie Gel Caféiné',carbs:33,caffeine:50,water:true,note:'Avec eau, 50mg caféine'},
    {id:'ta-gommes',brand:'TA Energy',name:'Gommes Énergie',carbs:24,caffeine:0,water:true,note:'3 gommes/sachet, avec eau'},
    {id:'ta-gommes-caf',brand:'TA Energy',name:'Gommes Énergie Caféinées',carbs:24,caffeine:50,water:true,note:'50mg caféine, avec eau'},
    {id:'maurten-100',brand:'Maurten',name:'Gel 100',carbs:25,caffeine:0,water:false,note:'Hydrogel, sans eau'},
    {id:'maurten-100-caf',brand:'Maurten',name:'Gel 100 Caf 100',carbs:25,caffeine:100,water:false,note:'Hydrogel, 100mg caféine'},
    {id:'maurten-160',brand:'Maurten',name:'Gel 160',carbs:40,caffeine:0,water:false,note:'Hydrogel haute énergie, sans eau'},
    {id:'deca-gel',brand:'Decathlon',name:'Energy Gel (<3h)',carbs:30,caffeine:0,water:true,note:'Avec eau obligatoire'},
    {id:'deca-gel-caf',brand:'Decathlon',name:'Energy Gel+ Caféiné',carbs:22,caffeine:20,water:true,note:'Avec eau, 20mg caféine'},
    {id:'nduranz-gel',brand:'Nduranz',name:'Nrgy Unit Gel',carbs:45,caffeine:0,water:false,note:'Isotonique, sans eau — très haute énergie'},
    {id:'baouw-gel',brand:'Baouw',name:'Gel Extra',carbs:30,caffeine:0,water:true,note:'Bio, avec eau'},
  ],
  barres:[
    {id:'naak-bar',brand:'Näak',name:'Ultra Energy Bar',carbs:29,caffeine:0,water:false,note:'50g, protéines végétales'},
    {id:'naak-bar-caf',brand:'Näak',name:'Ultra Energy Bar Caféine',carbs:27,caffeine:35,water:false,note:'50g, 35mg caféine'},
    {id:'ta-barre',brand:'TA Energy',name:'Barre Bio',carbs:20,caffeine:0,water:false,note:'38g, texture moelleuse'},
    {id:'nutripure-gel',brand:'Nutripure',name:'Gel Long Distance',carbs:30,caffeine:0,water:true,note:'SolidCarbs™, glucose+fructose — avec eau'},
    {id:'nutripure-barre-ld',brand:'Nutripure',name:'Barre Long Distance',carbs:30,caffeine:0,water:false,note:'42g, moelleuse, BCAA + vitamines'},
    {id:'nutripure-raw',brand:'Nutripure',name:'Raw Barre Bio',carbs:15,caffeine:0,water:false,note:'15g glucides + 8g protéines — avant effort ou ultra long'},
  ],
  boissons:[
    {id:'maurten-160d',brand:'Maurten',name:'Drink Mix 160',carbs:40,per:'500ml',water:true,note:'À diluer'},
    {id:'maurten-320d',brand:'Maurten',name:'Drink Mix 320',carbs:80,per:'500ml',water:true,note:'Haute énergie, à diluer'},
    {id:'deca-iso',brand:'Decathlon',name:'ISO (poudre)',carbs:33,per:'500ml',water:true,note:'À diluer'},
    {id:'deca-iso-plus',brand:'Decathlon',name:'ISO+ (poudre)',carbs:33,per:'500ml',water:true,note:'À diluer'},
    {id:'deca-iso-rtd',brand:'Decathlon',name:'ISO prête à boire',carbs:27,per:'500ml',water:false,note:'Prête à l\'emploi'},
    {id:'nutripure-drink',brand:'Nutripure',name:'Boisson Long Distance 30g',carbs:30,per:'400ml',water:true,note:'PureDigest™, BCAA + vitamines'},
    {id:'nutripure-drink60',brand:'Nutripure',name:'Boisson Expert Long Distance 60g',carbs:60,per:'500ml',water:true,note:'Version haute énergie — athlètes expérimentés'},
    {id:'nduranz-drink90',brand:'Nduranz',name:'Nrgy Drink 90',carbs:90,per:'500ml',water:true,note:'Haute énergie ultra distance'},
  ]
};

function getUserGels(){
  const sel = userProfile.nutrition_products||[];
  const gels = NUTRITION_DB.gels.filter(g=>sel.includes(g.id));
  const barres = NUTRITION_DB.barres.filter(b=>sel.includes(b.id));
  return [...gels,...barres];
}
function getUserBoissons(){
  const sel = userProfile.nutrition_products||[];
  return NUTRITION_DB.boissons.filter(b=>sel.includes(b.id));
}

function genNutrition(distM, estTimeS){
  const dh = estTimeS/3600;
  const dk = distM/1000;
  const userGels = getUserGels();
  const userBoissons = getUserBoissons();
  const hasProducts = userGels.length>0 || userBoissons.length>0;
  const rows = [];

  // No pre-race food — chacun fait ce qui marche pour lui

  if(dh < 1.5){
    // < 1h30 : hydratation simple selon température
    rows.push(`<tr style="background:rgba(46,204,113,.05)"><td class="mono">Pendant</td><td><strong>Eau selon la soif</strong>${dh>0.75?' + électrolytes si >25°C':''}</td><td>0g glucides</td><td>< 1h30 : réserves glycogéniques suffisantes. Électrolytes si forte chaleur uniquement · Burke et al., 2011</td></tr>`);
    if(userBoissons.length){
      const b=userBoissons[0];
      rows.push(`<tr><td class="mono">Option chaleur</td><td>${b.brand} ${b.name} dilué ×2</td><td>~${Math.round(b.carbs/2)}g</td><td>Si T° > 25°C uniquement. Diluer pour réduire l'apport sucré.</td></tr>`);
    }
  } else {
    // ≥ 1h30 : protocole complet
    const targetCarbsPerH = dh < 2.5 ? 40 : 60;

    // Premier ravitaillement ~30-35min
    const t1km = Math.round(dk*0.30);
    if(hasProducts && userGels.length){
      const gel1 = userGels.find(g=>g.caffeine===0) || userGels[0];
      rows.push(`<tr><td class="mono">~${t1km} km<br><span style="font-size:.55rem;opacity:.7">${Math.round(t1km/dk*estTimeS/60)}min</span></td><td><strong>${gel1.brand} ${gel1.name}</strong>${gel1.water?' <span style="color:var(--cyan)">+ eau obligatoire</span>':''}</td><td>${gel1.carbs}g</td><td>Premier apport glucidique après 30min. Sans caféine — adrénaline déjà élevée au départ.</td></tr>`);
    } else {
      rows.push(`<tr><td class="mono">~${t1km} km</td><td>Gel sans caféine + eau</td><td>25-30g</td><td>Premier apport après 30min · Jeukendrup, 2004</td></tr>`);
    }

    // Boisson si disponible
    if(userBoissons.length && dh >= 1.75){
      const b=userBoissons[0];
      const t2km=Math.round(dk*0.50);
      rows.push(`<tr><td class="mono">~${t2km} km<br><span style="font-size:.55rem;opacity:.7">${Math.round(t2km/dk*estTimeS/60)}min</span></td><td><strong>${b.brand} ${b.name}</strong> 200ml</td><td>${Math.round(b.carbs*0.4)}g</td><td>Hydratation + glucides. ${b.water?'Dilué dans eau froide.':'Prêt à boire.'}</td></tr>`);
    }

    // Deuxième gel — caféiné si dispo, après 60-70% de la course
    const t3km = Math.round(dk*0.65);
    if(hasProducts && userGels.length){
      const gelCaf = userGels.find(g=>g.caffeine>0);
      const gel2 = gelCaf || (userGels.find(g=>g.caffeine===0) || userGels[0]);
      rows.push(`<tr><td class="mono">~${t3km} km<br><span style="font-size:.55rem;opacity:.7">${Math.round(t3km/dk*estTimeS/60)}min</span></td><td><strong>${gel2.brand} ${gel2.name}</strong>${gel2.water?' <span style="color:var(--cyan)">+ eau obligatoire</span>':''} ${gelCaf?'<span style="color:var(--yellow)">☕ Caféine</span>':''}</td><td>${gel2.carbs}g</td><td>${gelCaf?`${gel2.caffeine}mg caféine — pic d'effet 30-45min après. Timing idéal pour la dernière ligne droite ou montée finale.`:'Maintien glycémie sur derniers km.'}</td></tr>`);
    } else {
      rows.push(`<tr><td class="mono">~${t3km} km</td><td>Gel <strong>caféiné</strong> + eau</td><td>25-30g</td><td>Caféine : pic 30-45min après prise — timing pour fin de course.</td></tr>`);
    }

    // Ultra > 2h30
    if(dh >= 2.5){
      const t4km=Math.round(dk*0.80);
      if(userGels.find(g=>g.id.includes('barre')||g.note?.includes('Bar'))){
        const bar=userGels.find(g=>g.note?.includes('Bar')||g.id.includes('bar')||g.id.includes('barre'));
        rows.push(`<tr><td class="mono">~${t4km} km</td><td><strong>${bar.brand} ${bar.name}</strong> (solide)</td><td>${bar.carbs}g</td><td>Après 2h+ : le solide est mieux toléré que les gels en continu. Mâcher = stimulation cognitive (Ebersole et al.).</td></tr>`);
      } else {
        rows.push(`<tr><td class="mono">~${t4km} km</td><td>Solide (barre, datte, banane) + eau</td><td>25-35g</td><td>Après 2h+ : diversifier les sources. Le solide est mieux toléré. Mâcher aide cognitivement.</td></tr>`);
      }
    }

    // Conseil eau général
    if(userGels.filter(g=>g.water).length > 0){
      rows.push(`<tr style="background:rgba(0,212,255,.04)"><td class="mono t2" colspan="4">💧 <strong>Rappel eau :</strong> tes gels nécessitent de l'eau. Toujours 150-200ml d'eau avec chaque prise. Ne jamais prendre gel + boisson sucrée en même temps.</td></tr>`);
    }
  }

  // Post-course
  rows.push(`<tr style="background:rgba(46,204,113,.05)"><td class="mono tg">Post &lt;30min</td><td>Protéines + glucides rapides</td><td>60g + 20g prot</td><td>Fenêtre anabolique · resynthèse glycogène max · Ivy, 1998</td></tr>`);

  return rows.join('');
}


let _nutrActiveBrandGel = null;
let _nutrActiveBrandDrink = null;

function renderNutritionProducts() {
  const sel = userProfile.nutrition_products||[];
  const allGels = [...NUTRITION_DB.gels, ...NUTRITION_DB.barres];
  const allDrinks = NUTRITION_DB.boissons;

  const gelBrands = [...new Set(allGels.map(p=>p.brand))];
  const drinkBrands = [...new Set(allDrinks.map(p=>p.brand))];

  // Init active brand if not set
  if(!_nutrActiveBrandGel) _nutrActiveBrandGel = gelBrands[0];
  if(!_nutrActiveBrandDrink) _nutrActiveBrandDrink = drinkBrands[0];

  const mkBrandBtn = (brand, active, onclick) =>
    `<button onclick="${onclick}" style="padding:5px 12px;border-radius:20px;border:1px solid ${active?'var(--cyan)':'var(--border2)'};background:${active?'rgba(0,212,255,.12)':'var(--bg4)'};color:${active?'var(--cyan)':'var(--text2)'};font-family:var(--mono);font-size:.6rem;cursor:pointer;transition:all .2s">${brand}</button>`;

  const mkCard = (p) => {
    const checked = sel.includes(p.id);
    return `<label style="display:flex;align-items:flex-start;gap:10px;background:var(--bg4);border:1px solid ${checked?'var(--cyan)':'var(--border)'};border-radius:9px;padding:10px 12px;cursor:pointer;transition:border-color .2s">
      <input type="checkbox" data-nutr="${p.id}" ${checked?'checked':''} style="margin-top:2px;accent-color:var(--cyan)" onchange="this.closest('label').style.borderColor=this.checked?'var(--cyan)':'var(--border)'">
      <div>
        <div style="font-size:.78rem;font-weight:600">${p.name}</div>
        <div class="mono t2" style="font-size:.58rem">${p.carbs}g glucides${p.caffeine?` · ☕ ${p.caffeine}mg caféine`:''}</div>
        <div class="mono t3" style="font-size:.55rem">${p.note||''}</div>
      </div>
    </label>`;
  };

  // Gel brands
  const gelBrandEl = document.getElementById('nutrGelBrands');
  if(gelBrandEl) gelBrandEl.innerHTML = gelBrands.map(b=>mkBrandBtn(b,b===_nutrActiveBrandGel,`filterNutrBrand('gel','${b}')`)).join('');

  // Gel products filtered
  const gelListEl = document.getElementById('nutrGelList');
  if(gelListEl) gelListEl.innerHTML = allGels.filter(p=>p.brand===_nutrActiveBrandGel).map(mkCard).join('');

  // Drink brands
  const drinkBrandEl = document.getElementById('nutrDrinkBrands');
  if(drinkBrandEl) drinkBrandEl.innerHTML = drinkBrands.map(b=>mkBrandBtn(b,b===_nutrActiveBrandDrink,`filterNutrBrand('drink','${b}')`)).join('');

  // Drink products filtered
  const drinkListEl = document.getElementById('nutrDrinkList');
  if(drinkListEl) drinkListEl.innerHTML = allDrinks.filter(p=>p.brand===_nutrActiveBrandDrink).map(mkCard).join('');
}

function filterNutrBrand(type, brand) {
  // Save current checked state before re-rendering
  const checked = [...document.querySelectorAll('input[data-nutr]:checked')].map(i=>i.dataset.nutr);
  userProfile.nutrition_products = [...new Set([...(userProfile.nutrition_products||[]),...checked])];
  if(type==='gel') _nutrActiveBrandGel = brand;
  else _nutrActiveBrandDrink = brand;
  renderNutritionProducts();
}

async function saveNutritionProducts() {
  const checked = [...document.querySelectorAll('input[data-nutr]:checked')].map(i=>i.dataset.nutr);
  userProfile.nutrition_products = checked;
  const msg = document.getElementById('nutrSaveMsg');
  const {error} = await sb.from('profiles').upsert({id:currentUser.id, nutrition_products: checked});
  if(error){msg.textContent='❌ Erreur';msg.style.color='var(--red)';}
  else{msg.textContent=`✓ ${checked.length} produit(s) sauvegardé(s)`;msg.style.color='var(--green)';setTimeout(()=>msg.textContent='',3000);}
}

