// Analyse de séance — bandes de connaissance PURES partagées.
// Source de vérité unique des bandes VAM (T2) et de dérive/durabilité (A1),
// pour que le débrief de course ET le débrief d'activité lisent la même grille.
// Le découplage GAP:FC & la durabilité par tiers vivent dans `lib/durability.ts`.
// Cf. docs/coach/session-analysis.md. 100 % déterministe.

// ── Bandes de niveau VAM (knowledge T2) ──────────────────────────────────────
export type VamBand = 'elite' | 'strong' | 'fair' | 'weak'

/** Élite ≥900 · bon ≥700 · correct ≥500 · faible <500 (m/h). */
export function vamBand(vam: number): VamBand {
  return vam >= 900 ? 'elite' : vam >= 700 ? 'strong' : vam >= 500 ? 'fair' : 'weak'
}
export const VAM_BAND_LABEL: Record<VamBand, string> = {
  elite: 'niveau élite', strong: 'bon niveau', fair: 'niveau amateur correct', weak: 'à renforcer',
}
/** Couleur (design-token) par bande, pour un style graphique cohérent dans l'app. */
export const VAM_BAND_COLOR: Record<VamBand, string> = {
  elite: 'var(--vl-growth)', strong: 'var(--vl-growth)', fair: 'var(--vl-amber)', weak: 'var(--vl-ember)',
}

// ── Bandes de dérive cardiaque / durabilité (knowledge A1) ───────────────────
export type DriftBand = 'stable' | 'moderate' | 'marked'

/** Stable ≤5 % · modérée ≤10 % · marquée >10 % (aligné runnerProfile.computeDriftStatus). */
export function driftBand(pct: number): DriftBand {
  return pct <= 5 ? 'stable' : pct <= 10 ? 'moderate' : 'marked'
}
