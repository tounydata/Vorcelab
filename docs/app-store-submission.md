# App Store — kit de soumission (jour J en 10 secondes)

État au 2026-07-21 : tout ce qui pouvait être câblé côté code **l'est déjà**.
Il reste des actions de COMPTE (Apple/Supabase/Stripe, une seule fois), puis le
jour J se résume à deux commandes EAS.

## Déjà câblé dans le dépôt (rien à refaire)

| Élément | Où | État |
| --- | --- | --- |
| Sign in with Apple natif (feuille système iOS) | `mobile/src/lib/socialAuth.ts` → `signInWithAppleMobile` (id_token Supabase), fallback OAuth navigateur | ✅ |
| Flag d'activation | `EXPO_PUBLIC_APPLE_ENABLED=true` dans les profils EAS `preview` et `production` (`mobile/eas.json`) — rien à flipper | ✅ |
| Config iOS | `mobile/app.json` : `usesAppleSignIn`, `buildNumber`, `ITSAppUsesNonExemptEncryption=false` (pas de chiffrement propriétaire → pas de doc export) | ✅ |
| Suppression de compte in-app (Guideline 5.1.1(v)) | `DeleteAccount.tsx` + Edge Function `delete-account` (CASCADE vérifié) | ✅ |
| Politique de confidentialité publique | https://vorcelab.app/#/legal/confidentialite | ✅ |
| CGU publiques | https://vorcelab.app/#/legal/cgu | ✅ |
| Abonnement invisible sur iOS (Guideline 3.1.1) | Carte ABONNEMENT absente du mobile, aucun lien d'achat externe — modèle multiplateforme 3.1.3(b) | ✅ |
| Idempotence paiements + `user_entitlements` (`source` accepte déjà `apple` pour l'IAP futur) | `stripe-webhook` v13 déployée | ✅ |
| Icônes / splash / dark mode / OTA updates | `mobile/app.json`, `expo-updates` | ✅ |

## Actions de compte — UNE FOIS, à faire cette semaine

1. **Apple Developer Program** (99 $/an) : inscription sur developer.apple.com.
   Dès l'acceptation, demander le **Small Business Program** (commission 15 %
   au lieu de 30 % — utile dès que l'IAP arrivera).
2. **App Store Connect** : créer l'app (bundle id `app.vorcelab.mobile`,
   SKU libre, nom « Vorcelab »).
3. **Supabase Auth → Apple provider** : dans le dashboard Supabase
   (Authentication → Providers → Apple), ajouter en *Client IDs* le bundle id
   `app.vorcelab.mobile` (requis pour `signInWithIdToken` natif). Pour le
   fallback navigateur/web, créer aussi un *Services ID* + clé `.p8` sur le
   portail Apple et les renseigner.
4. **EAS** : `eas credentials` (génération automatique des certificats de
   distribution — répondre oui à tout), puis vérifier
   `eas build --profile preview --platform ios` une première fois.
5. **Supabase Auth → Leaked password protection** : activer (Authentication →
   Settings). 2 minutes, dernier WARN sécurité des advisors.
6. **Stripe Dashboard → Webhooks** : sur l'endpoint
   `…/functions/v1/stripe-webhook`, ajouter les événements
   `customer.subscription.created`, `customer.subscription.updated`,
   `invoice.payment_failed` (la fonction v13 les gère déjà ; sans eux elle
   fonctionne comme avant, ils affinent juste le statut).
7. **TestFlight** : inviter 10–20 coureurs (emails) dès le premier build.

## Jour J — la soumission (les « 10 secondes »)

```bash
cd mobile
eas build --profile production --platform ios --auto-submit
```

C'est tout : `autoIncrement` gère le build number, `--auto-submit` pousse sur
App Store Connect. Ensuite, dans App Store Connect (déjà pré-rempli en amont,
voir ci-dessous) : bouton **Submit for Review**.

## Fiche App Store Connect — à pré-remplir pendant TestFlight

### App Privacy (questionnaire) — réponses préparées

| Donnée | Collectée ? | Liée à l'identité | Tracking | Usage |
| --- | --- | --- | --- | --- |
| Santé et fitness (activités sportives, FC) | Oui | Oui | Non | Fonctionnalité de l'app (analyse d'entraînement) |
| Localisation précise (traces GPS des activités importées) | Oui | Oui | Non | Fonctionnalité de l'app (cartes, profils d'altitude) |
| Coordonnées (email) | Oui | Oui | Non | Fonctionnalité de l'app (compte) |
| Identifiants (user ID) | Oui | Oui | Non | Fonctionnalité de l'app |
| Diagnostic (crashs — Sentry) | Oui | Non | Non | Fonctionnalités de diagnostic |
| Achats | Non (aucun achat in-app en v1) | — | — | — |

« Do you or your third-party partners use data for tracking? » → **Non**
(aucune pub, aucun broker, Sentry = diagnostic uniquement).

### Métadonnées

- **Sous-titre** (30 car.) : « Le laboratoire du coureur trail »
- **Catégorie** : Forme et santé (secondaire : Sports)
- **URL confidentialité** : https://vorcelab.app/#/legal/confidentialite
- **URL support** : https://vorcelab.app (ou email de support)
- **Âge** : 4+ (aucun contenu sensible)

### Notes pour l'App Review (champ « Review Notes »)

> Vorcelab analyses running/trail activities. A demo account is provided:
> email `<compte démo>` / password `<mdp démo>` — it contains sample activities
> so every screen (dashboard, coach, race strategy) is populated.
> The app does not sell anything in-app; the companion website offers an
> optional subscription, never referenced inside the app (Guideline 3.1.3(b)
> multiplatform services). Sign in with Apple is offered alongside Google.
> Account deletion is available in Profile → Settings.

⚠ Créer ce **compte démo** avec des activités d'exemple AVANT la soumission —
un reviewer qui tombe sur des écrans vides est la 1ʳᵉ cause de rejet évitable.

### Screenshots (obligatoires : 6,7" et 6,5" ; l'iPad peut réutiliser)

Écrans qui vendent : Dashboard (PMC + course cible), Stratégie de course
(carte 3D + profil), Coach (semaine), Détail d'activité (profil altitude + FC),
Renfo. Capturer sur simulateur iPhone 15 Pro Max (`npx expo start` → ⌘S).

## Rejets probables & parades (préparées)

| Risque | Parade |
| --- | --- |
| 2.1 « app crashes / blank » | Compte démo peuplé + TestFlight au préalable |
| 3.1.1 achat contourné | Aucune mention d'abonnement/prix/lien dans l'app iOS — vérifié |
| 4.2 « minimal functionality » | Non applicable (app riche) — montrer la projection dans les notes |
| 5.1.1 permissions | Aucune permission sensible demandée (pas de GPS live en v1) |
| Sign in with Apple absent | Câblé, activé par les profils EAS |

## Après l'acceptation

1. Basculer la page d'accueil web « Télécharger sur l'App Store ».
2. Lancer le lot IAP (RevenueCat/StoreKit, `user_entitlements.source='apple'`)
   pour la v1.1 — voir `docs/roadmap-restante.md` (P2).
3. Surveiller Sentry (tag `runtime:supabase-edge` + mobile) la première semaine.
