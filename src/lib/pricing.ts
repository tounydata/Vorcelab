// Source de vérité UNIQUE des tarifs affichés + identifiants Stripe.
// Évite les prix codés en dur dispersés (modal, landing, cartes, CGU) qui
// divergent. Toute valeur dérivée (équivalent mensuel, % d'économie) est calculée
// ici. Architecture prête pour plusieurs tarifs (fondateur, ponctuel, coach/club) :
// ajouter une entrée dans PRICING + son lien Stripe.

export type BillingPeriod = 'monthly' | 'annual'

export interface PricingPlan {
  id: BillingPeriod
  /** Montant facturé pour la période (en euros). */
  amountEur: number
  periodMonths: number
  /** Payment Link Stripe (injecté au build). Vide si non configuré. */
  stripeUrl: string
}

const MONTHLY_URL: string = import.meta.env.VITE_STRIPE_MONTHLY_URL ?? ''
const ANNUAL_URL: string = import.meta.env.VITE_STRIPE_ANNUAL_URL ?? ''

export const PRICING: Record<BillingPeriod, PricingPlan> = {
  monthly: { id: 'monthly', amountEur: 5, periodMonths: 1, stripeUrl: MONTHLY_URL },
  annual: { id: 'annual', amountEur: 50, periodMonths: 12, stripeUrl: ANNUAL_URL },
}

/** Formatte un montant en euros : « 5€ », « 4,17€ » (virgule décimale FR). */
export function fmtEur(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',')
  return `${s}€`
}

/** Coût mensuel équivalent d'un plan (annuel ramené au mois). */
export function monthlyEquivalentEur(plan: PricingPlan): number {
  return plan.amountEur / plan.periodMonths
}

/** % d'économie de l'annuel par rapport au mensuel (arrondi entier). */
export function annualSavingsPct(): number {
  const monthly = PRICING.monthly.amountEur
  const annualPerMonth = monthlyEquivalentEur(PRICING.annual)
  if (monthly <= 0) return 0
  return Math.round((1 - annualPerMonth / monthly) * 100)
}

/** Libellés prêts à afficher. */
export const priceLabels = {
  monthly: () => `${fmtEur(PRICING.monthly.amountEur)}/mois`,
  annual: () => `${fmtEur(PRICING.annual.amountEur)}/an`,
  annualPerMonth: () => `${fmtEur(monthlyEquivalentEur(PRICING.annual))}/mois`,
}
