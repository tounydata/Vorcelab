// Future ES module exports: all Vorcelab API methods
// Passe 3 will replace this object with ES module imports.
// Load order: after all JS modules, before dom-bindings.js.

window.Vorcelab = {

  // ── Navigation & panels (app.js) ─────────────────────────
  navigate,
  showPanel,

  // ── Auth (app.js) ────────────────────────────────────────
  login,
  signup,
  logout,
  switchTab,

  // ── Strava (app.js) ──────────────────────────────────────
  connectStrava,
  disconnectStrava,
  manualSync,

  // ── Theme & chart mode (app.js) ──────────────────────────
  setTheme,
  setAnnualMode,

  // ── Profil (app.js) ──────────────────────────────────────
  openProfil,
  closeProfil,
  saveProfile,
  changePassword,
  uploadAvatar,
  closeCropModal,
  confirmCrop,
  savePRs,

  // ── ZIP history import (app.js) ──────────────────────────
  handleZipDrop,
  handleZipFile,

  // ── Onboarding & CGU (app.js) ────────────────────────────
  onbNav,
  closeOnboarding,
  openCGU,
  closeCGU,

  // ── Race calendar (race-calendar.js) ─────────────────────
  showAddRaceForm,
  saveRace,
  calNavMonth,
  openEventView,
  backToCalendar,
  toggleRaceMenu,
  toggleEditRaceForm,
  saveEditRace,
  raceMenuChangeGpx,
  saveGpxToRace,
  deleteGpxFromRace,
  deleteRace,
  importOrgGpx,
  linkActivityFromRace,
  confirmLinkActivity,
  prepareRace,
  goToEvent,

  // ── Activity analysis (activity-analysis.js) ─────────────
  openAnalyse,
  closeAnalyse,
  raceMenuLinkActivity,

  // ── GPX strategy (race-strategy.js) ──────────────────────
  handleGpxDrop,
  handleGpxFile,
  navigateSection,
  closeSectionPopup,
  resetStrategy,

  // ── Nutrition (nutrition.js) ─────────────────────────────
  saveNutritionProducts,
  filterNutrBrand,

  // ── Renfo (renfo.js) ─────────────────────────────────────
  loadRenfoApp,
};
