import { VLState } from './app-state.js';
import {
  navigate, showPanel, login, signup, logout, switchTab,
  connectStrava, disconnectStrava, manualSync,
  setTheme, setAnnualMode,
  openProfil, closeProfil, saveProfile, changePassword, uploadAvatar,
  closeCropModal, confirmCrop, savePRs, deleteAccount,
  handleZipDrop, handleZipFile,
  onbNav, closeOnboarding, openCGU, closeCGU,
  switchProfilTab, showToast,
} from './app.js';
import {
  showAddRaceForm, saveRace, calNavMonth, openEventView, backToCalendar,
  toggleRaceMenu, toggleEditRaceForm, saveEditRace,
  raceMenuChangeGpx, saveGpxToRace, deleteGpxFromRace, deleteRace,
  importOrgGpx, linkActivityFromRace, confirmLinkActivity, prepareRace, goToEvent,
  loadRaces,
} from './race-calendar.js';
import { openAnalyse, closeAnalyse, raceMenuLinkActivity } from './activity-analysis.js';
import { handleGpxDrop, handleGpxFile, navigateSection, closeSectionPopup, resetStrategy } from './race-strategy.js';
import { saveNutritionProducts, filterNutrBrand } from './nutrition.js';
import { loadRenfoApp, preloadRenfoState,
  renderOnboardingStep, renfoNextStep, renfoObSelect, renfoToggleBand,
  finishRenfoOnboarding, renderRenfoHome, startRenfoSession,
  toggleExoDetail, toggleExoCheck, validateExoWithLoad,
  submitRenfoLog, openCompletionPicker, completeRenfoSession, showRenfoHistoryView,
  showRenfoSettings, saveRenfoSettings, resetRenfoOnboarding,
  showVariantPicker, applyVariant,
} from './renfo.js';

window.Vorcelab = {
  navigate, showPanel,
  login, signup, logout, switchTab,
  connectStrava, disconnectStrava, manualSync,
  setTheme, setAnnualMode,
  openProfil, closeProfil, saveProfile, changePassword, uploadAvatar,
  closeCropModal, confirmCrop, savePRs, deleteAccount,
  handleZipDrop, handleZipFile,
  onbNav, closeOnboarding, openCGU, closeCGU,
  switchProfilTab, showToast,
  showAddRaceForm, saveRace, calNavMonth, openEventView, backToCalendar,
  toggleRaceMenu, toggleEditRaceForm, saveEditRace,
  raceMenuChangeGpx, saveGpxToRace, deleteGpxFromRace, deleteRace,
  importOrgGpx, linkActivityFromRace, confirmLinkActivity, prepareRace, goToEvent,
  loadRaces,
  openAnalyse, closeAnalyse, raceMenuLinkActivity,
  handleGpxDrop, handleGpxFile, navigateSection, closeSectionPopup, resetStrategy,
  saveNutritionProducts, filterNutrBrand,
  loadRenfoApp, preloadRenfoState,
  renderOnboardingStep, renfoNextStep, renfoObSelect, renfoToggleBand,
  finishRenfoOnboarding, renderRenfoHome, startRenfoSession,
  toggleExoDetail, toggleExoCheck, validateExoWithLoad,
  submitRenfoLog, openCompletionPicker, completeRenfoSession, showRenfoHistoryView,
  showRenfoSettings, saveRenfoSettings, resetRenfoOnboarding,
  showVariantPicker, applyVariant,
};

// Expose as direct globals for inline onclick compatibility
// (some HTML onclicks use bare function names, not Vorcelab.xxx)
Object.assign(window, window.Vorcelab);

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.panel));
  });
});
