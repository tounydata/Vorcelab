# Sentry — monitoring d'erreurs (web + Edge Functions)

> **État au 2026-07-03 : ACTIF.** Compte créé (projet `vorcelab-web`,
> plan Developer gratuit), DSN intégrée en dur comme fallback — la DSN est
> publique par conception (livrée dans le bundle navigateur). Les secrets
> `VITE_SENTRY_DSN` (GitHub) et `SENTRY_DSN` (Supabase) restent prioritaires
> s'ils sont définis un jour (rotation de clé sans commit). Ingestion validée
> par un événement de test accepté (HTTP 200).
>
> Le reste de ce document décrit la mise en place initiale — conservé pour
> référence (rotation de DSN, nouveau projet…).

## Ce que ça apporte

Aujourd'hui, si l'app plante chez un utilisateur (écran blanc, bouton qui ne
répond pas) ou si le webhook Stripe échoue à activer un abonnement PRO, on ne
le sait pas — sauf si la personne écrit. Avec Sentry, chaque erreur remonte
avec la stack trace, le navigateur, la page. Le plan gratuit (5 000
erreurs/mois) suffit largement.

## Étape 1 — Créer le compte et le projet (~5 min)

1. Va sur **https://sentry.io/signup/** → crée un compte (email ou GitHub).
2. Choisis le plan **Developer (gratuit)**.
3. « Create Project » → plateforme **React** → nomme-le `vorcelab-web` → Create.
4. Sentry affiche un bloc de code contenant une ligne `dsn: "https://xxxx@yyy.ingest.sentry.io/zzz"`.
   **Copie cette URL** (c'est la clé DSN — publique par nature, pas un secret
   critique, mais on la gère en secret pour pouvoir la changer sans commit).

## Étape 2 — Activer sur le web (~2 min)

1. Va sur **https://github.com/tounydata/Vorcelab/settings/secrets/actions**.
2. « New repository secret » → Name : `VITE_SENTRY_DSN` → Secret : colle la
   DSN → Add secret.
3. Relance un déploiement : https://github.com/tounydata/Vorcelab/actions/workflows/deploy-pages.yml
   → « Run workflow » → branche `main` → Run. (Ou attends le prochain merge.)

## Étape 3 — Activer sur les Edge Functions (~2 min)

1. Va sur **https://supabase.com/dashboard/project/wanzrkdgqmcctwvnbmuv/settings/functions**.
2. Section « Secrets » → « Add new secret » → Name : `SENTRY_DSN` → Value :
   colle la même DSN → Save. (Les fonctions redémarrent automatiquement et
   prennent le secret en compte.)

Fonctions instrumentées : `stripe-webhook` (échec d'activation PRO après
paiement = l'alerte la plus importante) et `stripe-portal`. Le helper commun
est dans `supabase/functions/_shared/sentry.ts` — l'ajouter à une autre
fonction = 1 import + `captureException(err, { function: 'nom' })`.

## Étape 4 — Vérifier

Dans Sentry → Issues : déclenche une erreur de test (par ex. ouvre la console
du navigateur sur vorcelab.app et tape `setTimeout(() => { throw new Error('test sentry') })`)
→ l'événement doit apparaître en ~30 s.

## Notes

- Côté web : erreurs uniquement, pas de tracing/replay → pas d'impact
  performance, quota préservé (`src/main.tsx`).
- Côté Edge Functions : envoi direct via l'API envelope, sans SDK
  (`_shared/sentry.ts`), jamais bloquant pour la fonction.
- `sendDefaultPii: false` : aucune donnée personnelle envoyée par défaut.
