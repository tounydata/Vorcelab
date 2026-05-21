import { VLState, sb } from './app-state.js';

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

export async function loadRenfoWeekBlocks(weekStart) {
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
