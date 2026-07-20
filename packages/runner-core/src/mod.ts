// Point d'entrée runner-core — GÉNÉRÉ par scripts/sync-runner-core.mjs (ne pas éditer).
export {
  buildRunnerProfileFromActivitiesAndStreams,
  assembleRunnerProfile,
  type BuildRunnerProfileCoreInput,
  type RunnerProfileContract,
} from './buildRunnerProfileCore.ts'
export { RUNNER_PROFILE_SCHEMA_VERSION, isRunnerProfileCompatible, buildProfileSchemaMeta } from './runnerProfileSchema.ts'
export { ENGINE_HISTORY_DAYS, RUNNER_PROFILE_WINDOW_DAYS } from './engineHistory.ts'
export type { RawStreamSet, ProfileActivityAtDate } from './runnerProfileAtDate.ts'
