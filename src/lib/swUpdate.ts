// Mise à jour du service worker — politique « vérifier souvent, appliquer au bon moment ».
//
// Problème constaté : le SW est en `autoUpdate` (skipWaiting + clientsClaim), mais
// `clientsClaim` change le CONTRÔLEUR, il ne remplace pas le JavaScript déjà en cours
// d'exécution. Une page ouverte continue donc de tourner sur l'ancien bundle jusqu'au
// prochain chargement complet. Et le `registerSW.js` auto-injecté ne vérifie les mises
// à jour qu'à l'enregistrement : sur une PWA installée qu'on REPREND au lieu de
// relancer, un ancien bundle peut tenir des jours. Concrètement, un utilisateur peut
// afficher des projections calculées par une version du moteur vieille de plusieurs
// versions, sans aucun signe visible.
//
// Politique retenue :
//   • VÉRIFIER souvent — au chargement, à chaque retour au premier plan, et toutes les
//     `UPDATE_CHECK_INTERVAL_MS`. Une vérification est une requête conditionnelle sur
//     `sw.js` : négligeable. Un intervalle en heures serait absurde pour un produit qui
//     peut livrer plusieurs versions du moteur dans la même journée.
//   • APPLIQUER quand c'est invisible — le rechargement n'a lieu que si l'onglet est
//     MASQUÉ. Recharger sous les yeux de l'athlète pendant qu'il lit sa stratégie de
//     course, la veille d'un dossard, est le pire moment possible. En usage mobile
//     l'app passe en arrière-plan en permanence : la mise à jour s'applique donc vite,
//     et toujours sans interrompre.

/** Intervalle entre deux vérifications de mise à jour (ms). */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 min

export interface ReloadDecisionInput {
  /** Une nouvelle version a pris le contrôle et attend d'être appliquée. */
  hasPendingUpdate: boolean
  /** Visibilité courante du document. */
  visibility: 'visible' | 'hidden'
  /** Un rechargement est déjà en cours (garde anti-boucle). */
  alreadyReloading: boolean
}

/**
 * Décide si l'on recharge MAINTENANT. Fonction PURE — c'est toute la politique, donc
 * elle est testable sans navigateur.
 *
 * On ne recharge que masqué : jamais d'interruption visible. Sans mise à jour en
 * attente, ou si un rechargement est déjà lancé, on ne fait rien.
 */
export function shouldApplyUpdate(input: ReloadDecisionInput): boolean {
  if (!input.hasPendingUpdate) return false
  if (input.alreadyReloading) return false
  return input.visibility === 'hidden'
}

/**
 * Branche la stratégie de mise à jour. Sans effet hors navigateur ou sans support des
 * service workers (rendu serveur, tests, navigateurs anciens) : l'app fonctionne
 * simplement sans mise à jour automatique.
 */
export function setupServiceWorkerUpdates(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  let hasPendingUpdate = false
  let alreadyReloading = false

  const applyIfPossible = () => {
    if (!shouldApplyUpdate({
      hasPendingUpdate,
      visibility: document.visibilityState === 'hidden' ? 'hidden' : 'visible',
      alreadyReloading,
    })) return
    alreadyReloading = true
    window.location.reload()
  }

  // Le nouveau SW a pris le contrôle : le bundle servi a changé, mais le code qui
  // tourne est encore l'ancien. On note la mise à jour et on attend un moment discret.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    hasPendingUpdate = true
    applyIfPossible()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Passage en arrière-plan : moment idéal pour appliquer sans être vu.
      applyIfPossible()
      return
    }
    // Retour au premier plan : on vérifie s'il y a du nouveau.
    void checkForUpdate()
  })

  let registration: ServiceWorkerRegistration | null = null
  const checkForUpdate = async () => {
    try { await registration?.update() } catch { /* réseau indisponible : sans gravité */ }
  }

  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, r) {
          registration = r ?? null
          if (!registration) return
          window.setInterval(() => { void checkForUpdate() }, UPDATE_CHECK_INTERVAL_MS)
        },
      })
    })
    .catch(() => { /* build sans PWA (dev) : rien à faire */ })
}
