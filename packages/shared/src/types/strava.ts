// Public-safe Strava types — no tokens ever exposed here

export interface StravaPublicAthlete {
  id: number
  firstname: string
  lastname: string
  avatar: string | null
}

export interface StravaConnectionStatus {
  connected: boolean
  athlete: StravaPublicAthlete | null
  scope: string | null
  last_sync_at: string | null
}

export interface StravaOAuthResponse {
  connected: true
  athlete: StravaPublicAthlete
  scope: string
}

export interface StravaSyncResponse {
  connected: true
  synced: number
  last_sync_at: string
}

export interface StravaDisconnectResponse {
  disconnected: true
}
