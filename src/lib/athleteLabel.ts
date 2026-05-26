export function getAthleteLabel(
  profile: Record<string, unknown> | null,
  options?: { isPublic?: boolean },
): string {
  if (options?.isPublic) {
    return (profile?.name as string) || "l'athlète"
  }
  if (profile?.name) return profile.name as string
  if (profile?.email) return (profile.email as string).split('@')[0]
  return "l'athlète"
}
