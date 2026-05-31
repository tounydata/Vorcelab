import { VLState, sb } from './app-state.js';
import { escapeHTML } from './security.js';
import { renderAnnualChart } from './dashboard-charts.js';

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
