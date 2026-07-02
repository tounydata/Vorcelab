import { useEffect } from 'react'
import { useUpgradeModal, type PerformanceTeaser } from './useUpgradeModal'

// Ouvre automatiquement la modal PRO quand un user gratuit atteint un contenu
// verrouillé (plan coach au-delà des 2 semaines, stratégie GPX au-delà de la
// gratuite). Déclenchée à CHAQUE visite de la page verrouillée (un déclenchement
// par montage tant que `active` est vrai) : le free ne peut pas accéder au
// contenu PRO sans voir l'offre. Petit délai pour que l'aperçu s'affiche d'abord.
export function useAutoUpgradeModal(
  active: boolean,
  featureKey: string,
  teaser?: Partial<PerformanceTeaser> | null,
) {
  const { openModal } = useUpgradeModal()

  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => openModal(teaser ?? null), 700)
    return () => clearTimeout(t)
    // teaser capturé au déclenchement ; on ne resuit que active/feature.
  }, [active, featureKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
