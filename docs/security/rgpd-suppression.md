# Suppression de compte & RGPD

## Ce qui est supprimé (transactionnel, par CASCADE)

Depuis la migration `20260712000000_rgpd_cascade_fks.sql` (appliquée en prod), toutes
les FK de données utilisateur vers `auth.users` sont `ON DELETE CASCADE`. Supprimer
le compte Auth (`auth.admin.deleteUser`) efface **en une seule transaction** :

profil, activités (`activities_history`, `strava_activities`), streams
(`activity_streams`), météo (`activity_weather`), courses & GPX & stratégies
partagées (`race_calendar` — GPX et `share_token` sont des colonnes de cette table),
journaux de séance (`session_log`), renforcement (`renfo_*`), analytics
(`user_events`), tokens Strava (`strava_tokens`), entitlements
(`user_entitlements`), et les grants de l'utilisateur (`plan_grants.user_id`).

`plan_grants.granted_by` passe en `SET NULL` : si un administrateur qui a accordé un
accès est supprimé, le grant de l'AUTRE utilisateur est conservé mais anonymisé
(granter mis à NULL) — on ne détruit pas l'historique d'un tiers.

Vérifié par le test d'intégration `supabase/tests/rgpd_deletion.sql` (crée un
utilisateur avec des données dans 16 tables, supprime, vérifie qu'il ne reste rien).

## Best-effort (tracé dans Sentry, non bloquant)

- **Révocation Strava** (`oauth/deauthorize`) : son échec est désormais **tracé**
  (plus de `catch` vide).
- **Événements webhook Strava** (`strava_webhook_events`, clé = `owner_id`/athlete,
  sans FK vers `auth.users`) : supprimés par athlete id.
- **Avatars de stockage** (bucket `avatars`) : supprimés best-effort.

## Conservation légale — Stripe (à faire valider par un juriste)

La suppression du compte **n'efface pas** les enregistrements détenus par **Stripe**
(transactions, factures, remboursements). Stripe conserve ces données au titre d'une
**obligation légale** (comptabilité, lutte anti-fraude, obligations fiscales), ce qui
constitue une base légale distincte du consentement au sens du RGPD (art. 17.3.b :
l'effacement ne s'applique pas quand le traitement est nécessaire au respect d'une
obligation légale). Concrètement :

- Nos tables `user_entitlements` / `stripe_webhook_events` (qui contiennent des
  identifiants `stripe_customer_id` / `stripe_subscription_id` / `event_id`) sont
  supprimées avec le compte (cascade / lié à l'utilisateur).
- Les données côté **Stripe** restent soumises à la politique de conservation de
  Stripe et aux durées légales (souvent ~10 ans pour les pièces comptables en France).
- La politique de confidentialité doit **mentionner** cette conservation par le
  sous-traitant de paiement et sa base légale. **À faire valider par un professionnel.**

## Étapes de déploiement

- Migration `20260712000000` : **appliquée en prod** le 2026-07-12.
- Edge Function `delete-account` réécrite pour s'appuyer sur la cascade : se déploie
  automatiquement au merge via `deploy-functions.yml`. **À vérifier après déploiement**
  avec un compte de test (créer des données, supprimer, contrôler qu'il ne reste rien
  et que la révocation Strava est effective).
