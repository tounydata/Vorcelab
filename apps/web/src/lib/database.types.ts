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
          nutrition_products?: Json[] | null
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
          nutrition_products?: Json[] | null
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
          athlete_profile?: Json | null
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
          athlete_profile?: Json | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
