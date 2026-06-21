// Estimation du 1RM (charge max sur 1 répétition) SANS tester un vrai 1RM brut —
// trop risqué hors haltéro. On part d'une série SOUS-MAXIMALE (3-6 reps propres) et
// on estime via les formules validées :
//   • Brzycki (≤6 reps, plus précis en bas) : 1RM = w × 36 / (37 − reps)
//   • Epley   (≥7 reps)                     : 1RM = w × (1 + reps/30)
// Précision ~±5 % quand reps ≤ ~10. Sources :
//   https://opensiuc.lib.siu.edu/cgi/viewcontent.cgi?article=1744&context=gs_rp (validation Brzycki/Epley)
//   https://maxcalculator.com/guides/test-1rm-safely (protocole sûr)
//   https://en.wikipedia.org/wiki/One-repetition_maximum

function round05(x: number): number {
  return Math.round(x * 2) / 2
}

/** Estime le 1RM (kg) depuis une série sous-maximale. reps borné 1..12. */
export function estimate1RM(weightKg: number, reps: number): number {
  if (!(weightKg > 0)) return 0
  const r = Math.max(1, Math.min(12, Math.round(reps)))
  if (r === 1) return round05(weightKg)
  const oneRM = r <= 6 ? (weightKg * 36) / (37 - r) : weightKg * (1 + r / 30)
  return round05(oneRM)
}

/** Charge de travail (kg) pour un % de 1RM, arrondie à 2.5 kg. */
export function workingLoad(oneRM: number, pct: number): number {
  return Math.max(0, Math.round((oneRM * pct) / 2.5) * 2.5)
}

/** Échauffement en rampe avant le test (sécurité — on ne teste jamais à froid). */
export const ONE_RM_WARMUP: { pctLabel: string; reps: string }[] = [
  { pctLabel: '~40 %', reps: '8-10 reps' },
  { pctLabel: '~60 %', reps: '5 reps' },
  { pctLabel: '~75 %', reps: '3 reps' },
  { pctLabel: '~85 %', reps: '1-2 reps' },
]

/** Schéma force-max dérivé du 1RM (ce qui développe l'économie de course, pas l'hypertrophie). */
export const FORCE_MAX_SCHEME: { label: string; pct: number; sets: number; reps: number }[] = [
  { label: 'Force max', pct: 0.87, sets: 4, reps: 4 },
  { label: 'Lourd', pct: 0.82, sets: 5, reps: 5 },
  { label: 'Adaptation (base)', pct: 0.68, sets: 3, reps: 10 },
]
