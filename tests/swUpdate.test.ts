import { describe, it, expect } from 'vitest'
import { shouldApplyUpdate, UPDATE_CHECK_INTERVAL_MS } from '../src/lib/swUpdate'
import { APP_VERSION } from '../src/lib/appVersion'

// Politique de mise à jour du service worker : « vérifier souvent, appliquer quand
// c'est invisible ». Le SW est en autoUpdate, mais `clientsClaim` ne remplace pas le
// JavaScript déjà en cours d'exécution — une page ouverte reste sur l'ancien bundle,
// donc sur une ancienne version du MOTEUR, jusqu'au prochain chargement complet.

describe('shouldApplyUpdate', () => {
  it('1. aucune mise à jour en attente → on ne recharge jamais', () => {
    expect(shouldApplyUpdate({ hasPendingUpdate: false, visibility: 'hidden', alreadyReloading: false })).toBe(false)
    expect(shouldApplyUpdate({ hasPendingUpdate: false, visibility: 'visible', alreadyReloading: false })).toBe(false)
  })

  it('2. onglet VISIBLE → on n’interrompt pas l’utilisateur', () => {
    // Recharger pendant qu'un athlète lit sa stratégie, la veille d'une course,
    // est le pire moment possible.
    expect(shouldApplyUpdate({ hasPendingUpdate: true, visibility: 'visible', alreadyReloading: false })).toBe(false)
  })

  it('3. onglet MASQUÉ avec mise à jour en attente → on applique', () => {
    expect(shouldApplyUpdate({ hasPendingUpdate: true, visibility: 'hidden', alreadyReloading: false })).toBe(true)
  })

  it('4. garde anti-boucle : un rechargement déjà lancé n’en déclenche pas un second', () => {
    expect(shouldApplyUpdate({ hasPendingUpdate: true, visibility: 'hidden', alreadyReloading: true })).toBe(false)
  })

  it('5. l’intervalle de vérification se compte en MINUTES, pas en heures', () => {
    // Le produit peut livrer plusieurs versions du moteur dans la même journée :
    // un intervalle de 24 h laisserait tourner un algorithme périmé toute une journée.
    expect(UPDATE_CHECK_INTERVAL_MS).toBeLessThanOrEqual(60 * 60 * 1000)
    expect(UPDATE_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(5 * 60 * 1000)
  })
})

describe('APP_VERSION', () => {
  it('6. toujours une chaîne non vide (repli « dev » hors build)', () => {
    expect(typeof APP_VERSION).toBe('string')
    expect(APP_VERSION.length).toBeGreaterThan(0)
  })
})
