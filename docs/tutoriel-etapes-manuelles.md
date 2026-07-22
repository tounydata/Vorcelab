# Tutoriel — les étapes que Claude ne peut pas faire à ta place

> Ces étapes demandent **tes comptes, tes accès ou des personnes réelles**.
> Rédigé pour un profil non-technique. Chaque bloc = quoi, pourquoi, comment.
> Réf. roadmap « objectif 9/10 » — parties non réalisables en code.

---

## 1. Déployer les migrations de sécurité en production (Phase 1)

**Pourquoi** : les 2 correctifs de sécurité/revenu vivent dans des fichiers du
dépôt, mais tant qu'ils ne sont pas **appliqués à ta base Supabase de prod**, ils
ne protègent rien.

**Comment** : suis pas à pas [`docs/deploiement-migrations.md`](./deploiement-migrations.md).
En 3 lignes : `supabase link` → `supabase db push` → vérifier avec les requêtes SQL du §3.

**Fait quand** : les 4 vérifications du §3 de ce doc renvoient le résultat attendu.

---

## 2. Protection « mots de passe compromis » — ⏭️ ABANDONNÉE

L'option Supabase « Leaked password protection » (comparaison HaveIBeenPwned)
**n'est disponible que sur les offres payantes**. Décision : on l'oublie tant
qu'on reste sur le plan gratuit. Rien à faire.

---

## 3. Tester le paiement Stripe de bout en bout (Phase 1)

**Pourquoi** : le code de paiement est en place mais le registre Stripe est vide —
aucun vrai événement ne l'a encore exercé. Avant de vendre, il faut prouver que
l'argent circule sans double-débit.

**Comment** (en mode **test**, aucune vraie carte débitée) :
1. Dans le Dashboard Stripe, bascule en **Test mode** (interrupteur en haut).
2. Récupère les **clés de test** (`sk_test_…`, `whsec_…`) et mets-les dans les
   secrets Supabase (Dashboard → Edge Functions → Secrets).
3. Fais un achat de test avec la carte `4242 4242 4242 4242` (date future, CVC quelconque).
4. Vérifie dans Stripe → Events que le webhook `checkout.session.completed` est reçu.
5. Rejoue le **même** événement (Stripe → Events → « Resend ») → l'utilisateur ne
   doit **pas** être passé PRO deux fois (idempotence).
6. Teste aussi : renouvellement, impayé, annulation, remboursement.

**Fait quand** : la table `stripe_webhook_events` contient des lignes et un rejeu
ne double pas les droits.

---

## 4. Créer un environnement de staging (Phase 3)

**Pourquoi** : aujourd'hui, dev et prod partagent la même base — un test peut
écrire en prod par erreur. Le staging est une copie « bac à sable ».

**Comment** :
1. Supabase → New project → nomme-le `vorcelab-staging`.
2. Applique **toutes** les migrations dessus : `supabase link --project-ref <ref-staging>` puis `supabase db push`.
3. Crée un fichier `mobile/.env.local` et un `.env.local` web avec l'URL + la clé
   **anon** du projet staging (pour viser staging au lieu de prod en local).
4. Ajoute quelques données de test anonymes (pas de vraies données perso).

**Fait quand** : tu peux reconstruire une base vide sans manipulation manuelle, et
tester connexion/import/analyse/quota/suppression sur staging.

---

## 5. Générer un build installable de l'app (EAS) et tester sur téléphone (Phase 3)

**Pourquoi** : le typage et le lint sont verts, mais rien ne vaut l'app réelle sur
un vrai iPhone/Android pour repérer crashs et décalages.

**Comment** :
1. Crée un compte **Expo** (expo.dev) et un compte **Apple Developer** (99 $/an,
   nécessaire pour iOS).
2. `npm i -g eas-cli` puis `eas login`.
3. Dans `mobile/` : `eas build --profile preview --platform ios` (et/ou `android`).
4. Installe le build sur 3 appareils/tailles d'écran différents.
5. Teste les parcours critiques : inscription, connexion Strava, ajout de course,
   lecture de stratégie, abonnement. Et en conditions dégradées : réseau lent,
   coupure, reprise de session.

**Fait quand** : un nouveau testeur installe l'app sans environnement de dev, et
aucun crash bloquant sur les parcours critiques.

> Note : les fontes de marque et le gating PRO sont déjà en place côté code — ce
> build les embarque automatiquement.

---

## 6. Lancer la bêta et écouter les utilisateurs (Phase 5)

**Pourquoi** : c'est ce qui transforme « bonne ingénierie » en « valeur prouvée ».

**Comment** :
1. Recrute **15 à 20 coureurs** correspondant à 2-3 profils précis (ex. traileur
   avec course dans 8-24 semaines, déjà sur Strava).
2. Distribue le build (TestFlight iOS / lien interne Android).
3. **Observe** les premières utilisations sans les guider (partage d'écran ou visio).
4. Mène **8 entretiens** de 20-30 min : où bloquent-ils ? qu'ont-ils compris ?
5. Classe les problèmes par fréquence × gravité. Corrige les **3 principaux** chaque
   semaine, sans ouvrir de nouveau grand chantier.
6. Quand les parcours sont stables : élargis à 30-50 coureurs, compare activation
   et rétention par profil.

**Fait quand** : tu as ≥ 100 projections évaluées, ≥ 20 athlètes, et une liste
priorisée d'améliorations issue des vrais usages.

---

## Récap — qui fait quoi

| Étape | Qui | Bloqué par |
|---|---|---|
| Migrations en prod | Toi (5 min) | rien — juste les lancer |
| Mots de passe compromis | — | payant, abandonné |
| Stripe E2E | Toi + tech | secrets Stripe |
| Staging | Toi | créer un 2ᵉ projet Supabase |
| Build EAS + tests device | Toi | comptes Expo + Apple |
| Bêta + entretiens | Toi | recruter des coureurs |

Le **code** de tout ce qui précède est déjà prêt dans le dépôt. Ces étapes ne sont
« que » de l'exécution / des comptes / des personnes — mais ce sont elles qui font
passer de 8/10 à 9/10.
