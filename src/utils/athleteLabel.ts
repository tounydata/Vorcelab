interface AthleteProfile { name?: string | null }
interface AthleteUser { email?: string | null }
interface AthleteLabelOptions { mode?: 'private' | 'public' }

export function getAthleteLabel(
  profile: AthleteProfile | null | undefined,
  user: AthleteUser | null | undefined,
  options?: AthleteLabelOptions,
): string {
  const mode = options?.mode ?? 'private'
  const name = profile?.name?.trim()
  if (name) return name
  if (mode === 'private') {
    const local = user?.email?.split('@')[0]?.trim()
    if (local) return local
  }
  return "l'athlète"
}
