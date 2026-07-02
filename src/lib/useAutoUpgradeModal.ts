import { useEffect } from 'react'
import { useUpgradeModal, type PerformanceTeaser } from './useUpgradeModal'

// Ouvre automatiquement la modal PRO quand un user gratuit atteint un contenu
// verrouillé (plan coach au-delà des 2 semaines, stratégie GPX au-delà de la
// gratuite). Déclenchée UNE fois par session et par feature — on prompt sans
// harceler. Petit délai : l'aperçu s'affiche d'abord derrière la modal, ce qui
// donne envie (« aperçu puis popup »).
export function useAutoUpgradeModal(
  active: boolean,
  featureKey: string,
  teaser?: Partial<PerformanceTeaser> | null,
) {
  const { openModal } = useUpgradeModal()

  useEffect(() => {
    if (!active) return
    const key = `vl-auto-modal-${featureKey}`
    if (sessionStorage.getItem(key) === '1') return
    sessionStorage.setItem(key, '1')
    const t = setTimeout(() => openModal(teaser ?? null), 900)
    return () => clearTimeout(t)
    // teaser capturé au moment du déclenchement ; on ne resuit que active/feature.
  }, [active, featureKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
