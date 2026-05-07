// Types
export type { Profile, ProfileUpdate, PersonalRecords, NutritionProduct } from './types/profile.js'
export type {
  StravaActivity,
  ActivityType,
  Split,
  Lap,
  ActivitiesHistory,
  ZoneData,
  ActivityZones,
  HeartRateZone,
  PowerZone,
  ActivityStats,
} from './types/activity.js'
export type {
  Race,
  RaceInsert,
  RaceUpdate,
  RaceType,
  RaceAthleteProfile,
  RacePrediction,
} from './types/race.js'
export type {
  StravaPublicAthlete,
  StravaConnectionStatus,
  StravaOAuthResponse,
  StravaSyncResponse,
  StravaDisconnectResponse,
} from './types/strava.js'
export type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisInsight,
  GapData,
  GradePacePoint,
  RaceStrategyRequest,
  RaceStrategyResponse,
  RaceSection,
  NutritionEntry,
  TimeProjection,
} from './types/analysis.js'

// Schemas
export { stravaOAuthBodySchema, stravaSyncOptionsSchema } from './schemas/strava.schema.js'
export type { StravaOAuthBody, StravaSyncOptions } from './schemas/strava.schema.js'
export { raceInsertSchema, raceUpdateSchema } from './schemas/race.schema.js'
export {
  analysisRequestSchema,
  raceStrategyRequestSchema,
  analysisResponseSchema,
} from './schemas/analysis.schema.js'

// Utils
export { speedToPace, secondsToHms, hmsToSeconds, metresToKm, gapFactor } from './utils/pace.js'
