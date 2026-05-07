import { z } from 'zod'

export const stravaOAuthBodySchema = z.object({
  code: z.string().min(1),
  scope: z.string(),
  state: z.string().optional(),
})

export const stravaSyncOptionsSchema = z.object({
  full: z.boolean().optional().default(false),
})

export type StravaOAuthBody = z.infer<typeof stravaOAuthBodySchema>
export type StravaSyncOptions = z.infer<typeof stravaSyncOptionsSchema>
