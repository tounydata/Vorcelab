# Roadmap restante & décision — état au 2026-07-15

Récapitulatif de l'audit « produit commercial sécurisé ». Ce qui est fait, ce qui
reste, et la décision go/no-go, avec les preuves.

## Fait & vérifié EN PRODUCTION (base `runnerdata`)

| Domaine | Livré | Preuve |
|--------|-------|--------|
| Sécurité P0 (escalade PRO/admin) | Trigger colonnes sensibles + durcissement RPC admin | Attaque simulée en rôle `authenticated` **rejetée** ; advisors propres |
| Entitlements & idempotence Stripe | `user_entitlements` (server-only) + `stripe_webhook_events` | RLS vérifiée (écriture client bloquée) ; 10 assertions SQL |
| RGPD | Suppression transactionnelle par CASCADE | Test 16 tables → 0 résidu ; FK CASCADE vérifiées en prod |
| Renfo | Dédup par id d'activité Strava | 10 tests unit + 4 SQL ; index vérifiés en prod |
| Légal | Acceptation versionnée + page mentions | 5 SQL + unit ; table appliquée en prod |
| Cache PWA / SecureStore mobile | Purge caches auth + tokens Keychain/Keystore | tests unit |
| Analytics / Pricing | Taxonomie + doc métriques ; prix centralisés | tests |
| Moteur | Banc de validation sans fuite temporelle + **versionnement/​explicabilité** | `engineBacktest` (8) + `engineVersion` (9) |
| CI / hébergement | Réparation deps Dependabot ; split build/deploy Pages | CI verte ; site `vorcelab.app` **200** |

## Reste — autonome (prochains lots, testés)

### P1 — avant paiement public
- **Webhook Stripe 2C** : câbler `stripe-webhook` sur `stripeEntitlement.ts` (idempotence
  via le ledger + écriture `user_entitlements` + événements `plan_*`/`checkout_completed`
  serveur), basculer la vérité de plan, contrôles premium serveur. **Bloqué** : nécessite
  les **secrets Stripe dans Supabase** pour tester en test-mode avant déploiement
  (le déploiement Edge Function est automatique au merge). Fondations + logique pure
  déjà en place et testées.
- **Câbler le versionnement moteur** (`engineVersion.stampProjection`) dans
  `computeRaceProjection` et persister dans `race_calendar.last_projection` (engine/profile
  version + explicabilité + intervalle), pour alimenter le banc de validation avec le réel.

### P2 — avant App Store
- **IAP mobile** (RevenueCat/StoreKit + webhook → `user_entitlements`). **Bloqué** :
  comptes Apple/Google/RevenueCat. Le champ `source` de `user_entitlements` accepte déjà
  `apple`/`google`.

### P3 — architecture & qualité
- **Monorepo `packages/core`** : extraire les libs pures dupliquées web/mobile (moteur,
  renfo, profil…). **Gros refactor à faire lot par lot** (hash-identiques d'abord, tests
  partagés à chaque extraction) — délibérément hors PR de clôture pour ne pas pousser un
  changement massif non vérifié.
- **Rebaseline des migrations** (drift repo↔prod : les migrations du dépôt ont des
  timestamps différents de la prod). `supabase db pull` pour garantir la recréation d'un
  environnement vierge depuis le seul dépôt.
- **Accessibilité** : audit focus/contrastes/labels/tailles tactiles des écrans clés.
- **Legacy** : conversion TS stricte des modules actifs, archivage du monolithe legacy.

## Actions MANUELLES (hors code) — voir `docs/security/operations-manuelles.md`
- **Avant bêta** : *Leaked password protection* (Supabase Auth), **branch protection `main`**
  (le dépôt privé a été testé ; il est actuellement public — décision de visibilité à toi).
- **Avant paiement** : produits/prix/webhook Stripe + Customer Portal, secrets Supabase &
  GitHub, **validation juridique** des CGU/confidentialité + mentions (SIREN, forme
  juridique, adresse, médiateur — listés dans `/legal/mentions`).

## Décision go/no-go (fondée sur les preuves ci-dessus)

- **Bêta-testeurs (gratuit)** : ✅ **OUI**, une fois *leaked password protection* +
  branch protection activés. La faille critique est fermée en prod, RGPD et cache/​tokens OK.
- **Accepter des paiements** : ❌ **Pas encore** — le webhook Stripe doit être câblé sur les
  entitlements serveur et testé (lot 2C, bloqué sur secrets Stripe), + validation juridique.
- **Lancement public large** : ❌ — dépend du paiement fiabilisé + légal validé.
- **iOS / stores** : ❌ — IAP à implémenter (comptes Apple/Google/RevenueCat).
- **Investir en acquisition** : ❌ tant que la conversion payante n'est pas fiabilisée et
  mesurée (le teaser est désormais honnête, l'analytics est prête, mais le paiement serveur
  manque).

En résumé : **prêt pour une bêta gratuite** après 2 réglages manuels ; **pas encore** pour
encaisser — le dernier verrou technique est le webhook Stripe 2C, en attente des secrets.
