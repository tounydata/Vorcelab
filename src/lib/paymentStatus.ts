// Dérivation pure de l'état de la page de succès de paiement.
// La confirmation PRO doit venir du SERVEUR (le webhook Stripe écrit le plan en
// base) et non du simple fait d'avoir ouvert l'URL /payment/success. On modélise
// donc explicitement les états, y compris « paiement encore en traitement ».

export type PaymentState =
  | 'loading' // première vérification en cours
  | 'confirmed' // entitlement PRO actif confirmé côté serveur
  | 'processing' // pas encore PRO, mais dans la fenêtre d'attente (webhook en vol)
  | 'not_found' // toujours pas PRO après le délai → à vérifier
  | 'not_logged_in' // pas de session : on ne peut rien confirmer
  | 'error' // échec de lecture serveur

export interface PaymentStateInput {
  hasUser: boolean
  isLoading: boolean
  isError: boolean
  /** Plan PRO actif confirmé par lecture serveur (RLS), jamais par le client. */
  planIsPro: boolean
  elapsedMs: number
  timeoutMs: number
}

export function derivePaymentState(i: PaymentStateInput): PaymentState {
  if (!i.hasUser) return 'not_logged_in'
  if (i.planIsPro) return 'confirmed'
  if (i.isError) return 'error'
  if (i.isLoading) return 'loading'
  if (i.elapsedMs < i.timeoutMs) return 'processing'
  return 'not_found'
}

/** Vrai uniquement quand le serveur a confirmé l'accès PRO. */
export function isConfirmed(state: PaymentState): boolean {
  return state === 'confirmed'
}
