/**
 * Hand-maintained until `supabase gen types` is wired into CI.
 * Run: supabase gen types typescript --project-id wanzrkdgqmcctwvnbmuv > src/lib/database.types.ts
 *
 * Must conform to postgrest-js GenericSchema: each table needs Relationships[],
 * and the schema needs Views and Functions keys.
 */
export type Json = string | number | boolean | null | Record<string, unknown> | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string | null
          age: number | null
          sex: string | null
          birthdate: string | null
          weight: number | null
          height: number | null
          vo2max: number | null
          fc_max: number | null
          lactate_threshold: number | null
          lactate_pace: string | null
          mass_fat: number | null
          mass_muscle: number | null
          pain_zones: string[] | null
          goals: string | null
          prs: Record<string, string | undefined> | null
          nutrition_products: Json[] | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name?: string | null
          age?: number | null
          sex?: string | null
          birthdate?: string | null
          weight?: number | null
          height?: number | null
          vo2max?: number | null
          fc_max?: number | null
          lactate_threshold?: number | null
          lactate_pace?: string | null
          mass_fat?: number | null
          mass_muscle?: number | null
          pain_zones?: string[] | null
          goals?: string | null
          prs?: Record<string, string | undefined> | null
          nutrition_products?: unknown
          avatar_url?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string | null
          age?: number | null
          sex?: string | null
          birthdate?: string | null
          weight?: number | null
          height?: number | null
          vo2max?: number | null
          fc_max?: number | null
          lactate_threshold?: number | null
          lactate_pace?: string | null
          mass_fat?: number | null
          mass_muscle?: number | null
          pain_zones?: string[] | null
          goals?: string | null
          prs?: Record<string, string | undefined> | null
          nutrition_products?: unknown
          avatar_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      activities_history: {
        Row: {
          id: string
          user_id: string
          data: Json
          zone_data: Json
          imported_at: string
        }
        Insert: {
          user_id: string
          data: Json
          zone_data: Json
        }
        Update: {
          user_id?: string
          data?: Json
          zone_data?: Json
        }
        Relationships: []
      }
      race_calendar: {
        Row: {
          id: string
          user_id: string
          name: string
          date: string
          distance: number | null
          elevation: number | null
          type: string
          goal_time: string | null
          gpx_data: string | null
          strava_activity_id: number | null
          athlete_profile: Json | null
          created_at: string
        }
        Insert: {
          user_id: string
          name: string
          date: string
          distance?: number | null
          elevation?: number | null
          type: string
          goal_time?: string | null
          gpx_data?: string | null
          strava_activity_id?: number | null
          athlete_profile?: unknown
        }
        Update: {
          user_id?: string
          name?: string
          date?: string
          distance?: number | null
          elevation?: number | null
          type?: string
          goal_time?: string | null
          gpx_data?: string | null
          strava_activity_id?: number | null
          athlete_profile?: unknown
        }
        Relationships: []
      }
      strava_tokens: {
        Row: {
          user_id: string
          strava_athlete_id: number
          access_token: string
          refresh_token: string
          expires_at: number
          scope: string | null
          athlete_firstname: string | null
          athlete_lastname: string | null
          athlete_avatar: string | null
          last_sync_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          strava_athlete_id: number
          access_token: string
          refresh_token: string
          expires_at: number
          scope?: string | null
          athlete_firstname?: string | null
          athlete_lastname?: string | null
          athlete_avatar?: string | null
          last_sync_at?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          strava_athlete_id?: number
          access_token?: string
          refresh_token?: string
          expires_at?: number
          scope?: string | null
          athlete_firstname?: string | null
          athlete_lastname?: string | null
          athlete_avatar?: string | null
          last_sync_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      strava_activities: {
        Row: {
          id: string
          user_id: string
          strava_activity_id: number
          strava_athlete_id: number | null
          name: string | null
          type: string | null
          sport_type: string | null
          start_date: string | null
          start_date_local: string | null
          timezone: string | null
          distance: number | null
          moving_time: number | null
          elapsed_time: number | null
          total_elevation_gain: number | null
          average_speed: number | null
          max_speed: number | null
          average_heartrate: number | null
          max_heartrate: number | null
          average_cadence: number | null
          calories: number | null
          suffer_score: number | null
          raw_data: Json
          deleted_at: string | null
          synced_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          strava_activity_id: number
          strava_athlete_id?: number | null
          name?: string | null
          type?: string | null
          sport_type?: string | null
          start_date?: string | null
          start_date_local?: string | null
          timezone?: string | null
          distance?: number | null
          moving_time?: number | null
          elapsed_time?: number | null
          total_elevation_gain?: number | null
          average_speed?: number | null
          max_speed?: number | null
          average_heartrate?: number | null
          max_heartrate?: number | null
          average_cadence?: number | null
          calories?: number | null
          suffer_score?: number | null
          raw_data?: Json
          deleted_at?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          strava_activity_id?: number
          strava_athlete_id?: number | null
          name?: string | null
          type?: string | null
          sport_type?: string | null
          start_date?: string | null
          start_date_local?: string | null
          timezone?: string | null
          distance?: number | null
          moving_time?: number | null
          elapsed_time?: number | null
          total_elevation_gain?: number | null
          average_speed?: number | null
          max_speed?: number | null
          average_heartrate?: number | null
          max_heartrate?: number | null
          average_cadence?: number | null
          calories?: number | null
          suffer_score?: number | null
          raw_data?: Json
          deleted_at?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      strava_webhook_events: {
        Row: {
          id: string
          object_type: string
          object_id: number
          aspect_type: string
          owner_id: number
          subscription_id: number | null
          event_time: number | null
          payload: Json
          processed_at: string | null
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          object_type: string
          object_id: number
          aspect_type: string
          owner_id: number
          subscription_id?: number | null
          event_time?: number | null
          payload?: Json
          processed_at?: string | null
          error?: string | null
        }
        Update: {
          object_type?: string
          object_id?: number
          aspect_type?: string
          owner_id?: number
          subscription_id?: number | null
          event_time?: number | null
          payload?: Json
          processed_at?: string | null
          error?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
