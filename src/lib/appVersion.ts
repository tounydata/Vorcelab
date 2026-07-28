// Version APPLICATIVE (bundle livré), distincte d'`ENGINE_VERSION` (formule de
// projection). Les deux bougent indépendamment : un correctif d'interface change la
// version d'app sans toucher au moteur, et inversement.
//
// Source unique : `package.json`, injectée à la compilation par `vite.config.ts`
// (`define: { __APP_VERSION__ }`). Aucune valeur en dur à tenir à jour à la main.
//
// À quoi ça sert concrètement : le service worker peut laisser un utilisateur sur un
// ancien bundle (cf. `swUpdate.ts`). Afficher la version rend ce décalage VISIBLE —
// comparer deux écrans suffit à savoir qui est à jour, au lieu de deviner.

/** Version du bundle actuellement exécuté (ex. « 1.0.0 »). */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.length > 0 ? __APP_VERSION__ : 'dev'
