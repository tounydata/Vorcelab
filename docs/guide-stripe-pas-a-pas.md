# Guide pas-à-pas : brancher les paiements Stripe (niveau débutant)

> Objectif : à la fin de ce guide, un coureur qui clique « Passer à PRO » paie,
> et devient PRO automatiquement en quelques secondes. Durée : ~30 min.
> Aucun code à écrire — uniquement des clics dans 3 sites : Stripe, GitHub, Supabase.
>
> **Conseil** : fais tout d'abord en **mode test** Stripe (interrupteur « Mode test »
> en haut à droite du dashboard Stripe). Quand tout marche, tu refais les mêmes
> étapes en mode réel (« live »).

---

## Étape 1 — Créer les deux abonnements dans Stripe (~10 min)

1. Va sur [dashboard.stripe.com](https://dashboard.stripe.com) (crée un compte si besoin — il faudra un RIB et une pièce d'identité pour encaisser en réel, mais le mode test marche sans).
2. Active le **Mode test** (interrupteur en haut à droite).
3. Menu de gauche → **Catalogue de produits** → **+ Ajouter un produit** :
   - Nom : `Vorcelab PRO — Mensuel`
   - Tarif : le prix que tu veux (ex. 7,99 €), **Récurrent**, facturation **Mensuelle**
   - Enregistre.
4. Recommence pour l'annuel : `Vorcelab PRO — Annuel`, récurrent, facturation **Annuelle** (ex. 59,99 €).

## Étape 2 — Créer les deux Payment Links (~5 min)

Un Payment Link = une page de paiement hébergée par Stripe, zéro code.

1. Menu de gauche → **Liens de paiement** (Payment Links) → **+ Nouveau**.
2. Choisis le produit `Vorcelab PRO — Mensuel`.
3. **Important — après le paiement** : section « Page de confirmation » →
   choisis **« Ne pas afficher la page de confirmation »** et colle cette URL :
   ```
   https://vorcelab.app/#/payment/success
   ```
4. **Important — metadata** : ouvre les **options avancées** du lien → **Métadonnées**
   → ajoute une clé `plan` avec la valeur `monthly`.
   *(C'est ce qui dit au serveur si l'abonnement dure 1 ou 12 mois.)*
5. Crée le lien, puis **copie l'URL** (elle ressemble à `https://buy.stripe.com/test_xxxx`).
   Garde-la de côté : c'est ta `VITE_STRIPE_MONTHLY_URL`.
6. Recommence pour l'annuel avec metadata `plan` = `annual` et la même URL de
   redirection. Copie l'URL : c'est ta `VITE_STRIPE_ANNUAL_URL`.

## Étape 3 — Créer le webhook Stripe (~5 min)

Le webhook, c'est Stripe qui « téléphone » à ton serveur pour dire « untel a payé ».

1. Menu de gauche → **Développeurs** → **Webhooks** → **+ Ajouter un endpoint**.
2. URL de l'endpoint :
   ```
   https://wanzrkdgqmcctwvnbmuv.supabase.co/functions/v1/stripe-webhook
   ```
3. « Sélectionner les événements » → coche exactement ces trois-là :
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
4. Crée l'endpoint. Sur sa page, clique **« Révéler »** sous **Clé secrète de
   signature** (elle commence par `whsec_...`). **Copie-la** — c'est ton
   `STRIPE_WEBHOOK_SECRET`.

## Étape 4 — Donner le secret à Supabase (~3 min)

1. Va sur [supabase.com/dashboard](https://supabase.com/dashboard) → projet **runnerdata**.
2. Menu de gauche → **Edge Functions** → onglet **Secrets**
   (ou **Project Settings → Edge Functions** selon la version du dashboard).
3. **Add new secret** :
   - Name : `STRIPE_WEBHOOK_SECRET`
   - Value : la clé `whsec_...` copiée à l'étape 3.
4. Sauvegarde. C'est tout — la fonction `stripe-webhook` la lira automatiquement.

## Étape 5 — Donner les liens de paiement à GitHub (~3 min)

Pour que les boutons de l'app pointent vers tes pages de paiement.

1. Va sur [github.com/tounydata/Vorcelab](https://github.com/tounydata/Vorcelab)
   → onglet **Settings** (du repo) → menu de gauche **Secrets and variables** → **Actions**.
2. **New repository secret** :
   - Name : `VITE_STRIPE_MONTHLY_URL` · Secret : l'URL du lien mensuel (étape 2.5)
3. **New repository secret** à nouveau :
   - Name : `VITE_STRIPE_ANNUAL_URL` · Secret : l'URL du lien annuel (étape 2.6)
4. Pour que le site prenne en compte les liens : onglet **Actions** du repo →
   workflow **Deploy Pages** → bouton **Run workflow** (ou attends le prochain
   merge sur `main`, ça se fera tout seul).

## Étape 6 — Tester de bout en bout (~5 min)

1. Ouvre [vorcelab.app](https://vorcelab.app) avec un **compte non-PRO**.
2. Déclenche la modale « Passer à PRO » (ex. 2ᵉ stratégie GPX) → clique le CTA.
3. Sur la page Stripe, paie avec la **carte de test** :
   - Numéro : `4242 4242 4242 4242`
   - Date : n'importe quelle date future · CVC : `123` · Nom/adresse : ce que tu veux.
4. Tu dois être redirigé vers la page « Paiement confirmé » de Vorcelab,
   et **le compte doit être PRO** en revenant au dashboard.
5. Si ça ne marche pas : Stripe → Développeurs → Webhooks → ton endpoint →
   onglet « Tentatives » montre chaque appel et la réponse du serveur ;
   côté Supabase, Edge Functions → `stripe-webhook` → Logs.
   *(Demande à Claude de lire ces logs — il sait le faire.)*

## Passage en réel (quand le test marche)

Refais les étapes 1 → 5 avec le **Mode test désactivé** : les produits, liens,
webhook et secrets du mode test et du mode réel sont **séparés** chez Stripe.
Remplace les deux secrets GitHub par les URLs « live » et le secret Supabase
par le `whsec_...` du webhook « live », puis relance le déploiement.

> ⚠️ Avant d'encaisser de vrais paiements : il faut des **CGV/CGU et une politique
> de confidentialité** accessibles depuis l'app (obligation légale + exigence
> Stripe). C'est le dernier bloquant de la Phase A de l'audit.
