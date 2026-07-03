# Guide Stripe — il ne reste que 2 étapes (~10 min)

> État au 2026-07-02 : le compte Stripe **Vorcelab** est activé (identité vérifiée,
> IBAN enregistré, encaissements actifs) et presque tout a été fait via l'API :
>
> - ✅ Produit **Vorcelab PRO** + tarifs **5 €/mois** et **50 €/an** (mode live)
> - ✅ Lien de paiement mensuel : `https://buy.stripe.com/5kQ5kv9kS6wg35h6XC4ko00` (metadata `plan=monthly`)
> - ✅ Lien de paiement annuel : `https://buy.stripe.com/00w9ALeFcf2McFRgyc4ko01` (metadata `plan=annual`)
> - ✅ Redirection post-paiement vers `https://vorcelab.app/payment/success`
>   (Payment Links mis à jour via l'API le 2026-07-02 lors du passage à
>   BrowserRouter ; l'ancienne URL hash `/#/payment/success` reste couverte
>   par la réécriture au boot de l'app)
> - ✅ Liens branchés dans le build de prod (`deploy-pages.yml`) — aucun secret GitHub à créer
> - ✅ Fonction serveur `stripe-webhook` v2 déployée sur Supabase
>
> Il manque **le webhook** (Stripe ne permet pas de le créer par le connecteur —
> le secret de signature est trop sensible) : 2 étapes, uniquement des clics.

---

## Étape 1 — Créer le webhook dans Stripe (~5 min)

Le webhook, c'est Stripe qui « téléphone » à ton serveur pour dire « untel a payé ».

1. Va sur [dashboard.stripe.com](https://dashboard.stripe.com) (connecte-toi avec
   ton compte Vorcelab). Vérifie que tu n'es **pas** en « Mode test » (interrupteur
   en haut à droite — il doit être éteint : tout a été créé en mode réel).
2. Menu **Développeurs** (en bas à gauche, ou via la roue crantée) → **Webhooks**
   → **+ Ajouter une destination** (ou « Add endpoint »).
3. URL de l'endpoint — copie-colle exactement :
   ```
   https://wanzrkdgqmcctwvnbmuv.supabase.co/functions/v1/stripe-webhook
   ```
4. « Sélectionner les événements » → coche exactement ces trois-là :
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
5. Crée l'endpoint. Sur sa page, sous **Clé secrète de signature** (Signing
   secret), clique **Révéler** et **copie la valeur** (elle commence par `whsec_`).

## Étape 2 — Coller le secret dans Supabase (~3 min)

1. Va sur [supabase.com/dashboard](https://supabase.com/dashboard) → projet **runnerdata**.
2. Menu **Edge Functions** → onglet **Secrets**
   (ou **Project Settings → Edge Functions** selon la version du dashboard).
3. **Add new secret** :
   - Name : `STRIPE_WEBHOOK_SECRET`
   - Value : le `whsec_…` copié à l'étape 1.
4. Sauvegarde. C'est tout.

## Étape 3 — Vérifier que ça marche

⚠️ Tout est en **mode réel** : la carte de test 4242 ne fonctionne pas ici.
Le test le plus simple :

1. Demande à Claude de vérifier le branchement (il peut envoyer un événement de
   test signé et lire les logs du webhook).
2. Ou fais un **vrai achat à 5 €** avec ta propre carte depuis un compte non-PRO,
   vérifie que le compte passe PRO, puis demande un remboursement (Claude peut
   rembourser via l'API, ou Dashboard Stripe → Paiements → ⋯ → Rembourser).
   Coût du test : ~0,25 € de frais Stripe non remboursés.

## Bonus recommandé (2 min, dans le Dashboard Stripe)

- **Libellé bancaire** : Réglages → Informations publiques → « Libellé de
  relevé bancaire » — mets `VORCELAB` (actuellement c'est un libellé par défaut
  de ta banque, illisible pour tes clients).
- **E-mail de support** : au même endroit, renseigne `hello@vorcelab.com`.
- **Portail client** : Réglages → Facturation → Portail client → active-le,
  pour que tes abonnés puissent gérer/annuler seuls leur abonnement.
