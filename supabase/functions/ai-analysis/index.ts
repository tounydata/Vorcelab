import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { requireAuth, getServiceClient } from '../_shared/auth.ts'
import { errorResponse, json, ValidationError } from '../_shared/error.ts'
import { analysisRequestSchema } from 'https://esm.sh/@runner-os/shared@*'
import type { AnalysisResponse } from 'https://esm.sh/@runner-os/shared@*'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  const preflight = handleCors(req)
  if (preflight) return preflight

  try {
    const userId = await requireAuth(req)
    const body = (await req.json()) as unknown
    const parsed = analysisRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '))
    }

    const { activityId } = parsed.data
    const supabase = getServiceClient()

    // Fetch user's activities history and profile
    const [activitiesResult, profileResult] = await Promise.all([
      supabase
        .from('activities_history')
        .select('data')
        .eq('user_id', userId)
        .order('imported_at', { ascending: false })
        .limit(1)
        .single(),
      supabase.from('profiles').select('*').eq('id', userId).single(),
    ])

    const activities = (activitiesResult.data?.data as { id: number }[] | null) ?? []
    const activity = activities.find((a) => a.id === activityId)
    if (!activity) {
      throw new ValidationError(`Activity ${activityId} not found`)
    }

    const profile = profileResult.data

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('Anthropic API key not configured')

    const systemPrompt = buildSystemPrompt(profile)
    const userPrompt = buildUserPrompt(activity, profile)

    const claudeRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      throw new Error(`Claude API error: ${err}`)
    }

    const claudeData = (await claudeRes.json()) as {
      content: { type: string; text: string }[]
    }

    const rawText = claudeData.content.find((c) => c.type === 'text')?.text ?? ''
    const analysis = parseAnalysisResponse(rawText)

    return json(analysis, 200, cors)
  } catch (err) {
    return errorResponse(err, cors)
  }
})

function buildSystemPrompt(profile: Record<string, unknown> | null): string {
  return `Tu es un entraîneur expert en course à pied et trail running, spécialisé en analyse de performance.
Tu utilises des principes scientifiques (physiologie de l'effort, zones FC, GAP, nutrition sportive).
Pour les zones de fréquence cardiaque, utilise impérativement cette base: Z1 <60% FCmax, Z2 60-72% FCmax, Z3 73-82% FCmax, Z4 83-90% FCmax, Z5 >90% FCmax.
Réponds toujours en JSON valide avec la structure: { summary, insights[], recommendations[], physiological_notes, gap_adjusted_pace }.
Profil athlète: FC max ${profile?.fc_max ?? 'inconnu'} bpm, seuil lactique ${profile?.lactate_threshold ?? 'inconnu'} bpm, poids ${profile?.weight ?? 'inconnu'} kg.
Langue: français uniquement.`
}

function buildUserPrompt(
  activity: Record<string, unknown>,
  _profile: Record<string, unknown> | null
): string {
  return `Analyse cette activité running: ${JSON.stringify(activity, null, 2)}`
}

function parseAnalysisResponse(raw: string): AnalysisResponse {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    return JSON.parse(jsonMatch[0]) as AnalysisResponse
  } catch {
    // Graceful fallback if Claude returns unexpected format
    return {
      summary: raw,
      insights: [],
      recommendations: [],
      physiological_notes: null,
      gap_adjusted_pace: null,
    }
  }
}
