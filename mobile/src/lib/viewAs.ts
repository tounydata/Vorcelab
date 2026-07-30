// Mode « Vue en tant que » (admin) — portage de `viewAs` du store web (`src/store/vlStore.ts`).
//
// Le web garde cet état dans Zustand ; le mobile n'embarque pas de store global, d'où ce
// petit émetteur maison — même contrat, même effet : `usePlanTier` résout le plan du
// profil simulé, donc TOUTE l'app (gating PRO inclus) se rend comme pour cet utilisateur.
//
// Ce mode ne lit AUCUNE donnée d'un autre compte : il ne simule que les champs de plan.
// Pour voir les vraies données d'un utilisateur, c'est la session d'assistance qui
// s'applique (`assistedSession.ts`), avec journalisation serveur.

export interface ViewAsUser {
  id: string
  email: string
  name: string | null
  plan_tier: string
  plan_expires_at: string | null
  is_admin: boolean
}

let current: ViewAsUser | null = null
const listeners = new Set<(v: ViewAsUser | null) => void>()

export function getViewAs(): ViewAsUser | null {
  return current
}

export function setViewAs(user: ViewAsUser | null): void {
  current = user
  for (const listener of listeners) listener(current)
}

/** S'abonne au mode simulation. Renvoie le désabonnement. */
export function subscribeViewAs(listener: (v: ViewAsUser | null) => void): () => void {
  listeners.add(listener)
  listener(current)
  return () => { listeners.delete(listener) }
}
