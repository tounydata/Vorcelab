import { VLState, FC_MAX_DEFAULT } from './app-state.js';
import { renderRaces } from './race-calendar.js';
import { showDashContent, showOnboarding } from './ui.js';
import { renderKPIs } from './dashboard-kpis.js';
import { renderBar7j, renderChargeChart, loadRenfoChargeData, renderAnnualChart, setAnnualMode } from './dashboard-charts.js';
import { renderLastActivity, renderActivities, loadAerobicStat } from './dashboard-activities.js';
import { loadRenfoWeekBlocks } from './dashboard-renfo.js';
import { handleZipDrop, handleZipFile, loadHistoryFromDB } from './history-import.js';

export { setAnnualMode, renderLastActivity, renderActivities, handleZipDrop, handleZipFile, loadHistoryFromDB };

export function renderDashboard() {
  if (!VLState.allActivities.length) { showOnboarding(); return; }
  showDashContent();
  renderRaces();

  const now = new Date();
  const { weekStart } = renderKPIs(now);
  const fcMax = VLState.userProfile.fc_max || FC_MAX_DEFAULT;

  if (document.getElementById('annualChart')) renderAnnualChart();

  renderActivities();
  renderBar7j(VLState.allActivities, now);

  renderChargeChart(VLState.allActivities, fcMax, []);
  loadRenfoChargeData().then(renfoLoads => renderChargeChart(VLState.allActivities, fcMax, renfoLoads));

  loadRenfoWeekBlocks(weekStart);

  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const last7Days = VLState.allActivities.filter(a => new Date(a.start_date) >= sevenDaysAgo);
  const efActs = last7Days.length > 0 ? last7Days : VLState.allActivities.slice(0, 5);
  loadAerobicStat(efActs, fcMax, last7Days.length === 0);
}
