// Central mutable state — shared across all ES modules.
// Cross-module vars that were previously global in app.js.
// VLState is a live object; all modules import the same reference.

export const SUPA_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co';
export const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhbnpya2RncW1jY3R3dm5ibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjYyNjksImV4cCI6MjA5MzAwMjI2OX0.sSjZ956YRpSpCFxDrYDntTvIGHnmVEbe3JDsjTJsze4';
export const CLIENT_ID = '161609';
export const FC_MAX_DEFAULT = 205;
export const RUNNING_TYPES = ['Run', 'TrailRun', 'Trail Run', 'Running'];

// Supabase client — window.supabase is injected by the CDN script in <head>
const { createClient } = window.supabase;
export const sb = createClient(SUPA_URL, SUPA_KEY);

export const VLState = {
  currentUser: null,
  userProfile: { pain_zones: [] },
  allActivities: [],
  historyActivities: [],
  races: [],
  currentRaceContext: null,
  stravaConnected: null,
  stravaStreamsAvailable: null,
  runnerProfile: null,
  leafletMap: null,
  _prevPanel: null,
  // renfo state — updated by renfo.js after loadRenfoApp()
  renfoProgram: null,
  renfoSessionLogs: [],
  RENFO_FOCUS_COLORS: {},
  // Calibration post-course : historique prédictions vs résultats réels
  // Structure : { raceId, predictedTimeS, actualTimeS, errorPct, distanceKm,
  //   elevationM, terrainSummary, weather, confidence, createdAt, ... }
  predictionHistory: [],
};
