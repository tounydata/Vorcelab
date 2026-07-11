# Opérations manuelles — tutoriels pas à pas

Actions **impossibles depuis le code** (dashboards / comptes externes). Classées
par urgence. Coche au fur et à mesure.

Légende urgence : **P0** avant tout bêta-testeur · **P1** avant paiement public ·
**P2** avant App Store · **P3** croissance.

---

## P0 — Avant d'inviter le moindre bêta-testeur

### 1. (FAIT) Migration de sécurité appliquée en prod
La migration `secure_profiles_and_admin` + `secure_hardening_followup` ont été
appliquées et vérifiées sur le projet `runnerdata`. **Rien à faire**, sauf si tu
recrées un environnement : `supabase db push`.

### 2. Passer le dépôt GitHub en privé — 2 min
Le code propriétaire (moteurs, formules, migrations, logique de paiement) est
exposé publiquement.
1. https://github.com/tounydata/Vorcelab → **Settings**.
2. Tout en bas, **Danger Zone** → **Change repository visibility** → **Make private**.
3. Confirme en tapant `tounydata/Vorcelab`.

> Note : GitHub Pages (le site public) peut nécessiter un plan payant pour rester
> en ligne depuis un repo privé. Si le site doit rester public, envisage de
> déplacer *uniquement le build* (`dist/`) dans un repo public séparé, en gardant
> le code source privé. Voir §11.

### 3. Activer « Leaked password protection » (Supabase) — 1 min
1. Dashboard Supabase → projet **runnerdata** → **Authentication** → **Policies**
   (ou **Providers → Email**) → section **Password security**.
2. Active **Leaked password protection** (vérifie via HaveIBeenPwned).
3. Optionnel : impose une longueur mini (≥ 8) et la complexité.

### 4. Protéger la branche `main` — 3 min
1. **Settings → Branches → Add branch ruleset** (ou *Branch protection rules*).
2. Branche : `main`. Active :
   - **Require a pull request before merging** (+ **Require approvals** = 1).
   - **Require status checks to pass** → sélectionne `verify`, `rls-tests`,
     `supply-chain`, `e2e-smoke`, `mobile-typecheck`.
   - **Require branches to be up to date**.
   - **Do not allow bypassing the above settings**.
3. Active **Require squash merging** dans **Settings → General → Pull Requests**
   (coche *Allow squash merging*, décoche les autres).

### 5. Vérifier le dépôt secondaire `aplication-vorcelab` — 5 min
1. Cherche ce dépôt dans https://github.com/tounydata?tab=repositories.
2. S'il duplique le code : **archive-le** (*Settings → Archive*) ou supprime-le.
   S'il contient du code unique encore utile, note-le et fusionne plus tard.

---

## P1 — Avant d'accepter des paiements réels

### 6. Stripe — produits, prix et webhook — 20 min
Objectif : des abonnements récurrents fiables (pas seulement des Payment Links).
1. Dashboard Stripe → **Product catalog** → crée le produit **Vorcelab PRO** avec
   2 prix récurrents : **5 €/mois** et **50 €/an**. Note les `price_id`
   (`price_...`).
2. **Developers → Webhooks → Add endpoint** :
   - URL : `https://wanzrkdgqmcctwvnbmuv.supabase.co/functions/v1/stripe-webhook`
   - Événements (au minimum) : `checkout.session.completed`, `invoice.paid`,
     `invoice.payment_failed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `charge.refunded`.
   - Copie le **Signing secret** (`whsec_...`).
3. **Developers → API keys** : copie la **Secret key** (`sk_live_...` en prod,
   `sk_test_...` pour tester).
4. Enregistre ces secrets dans Supabase (voir §7). **Ne les mets jamais dans le
   dépôt** — le scan CI les bloquera de toute façon.
5. **Customer Portal** : **Settings → Billing → Customer portal** → active-le,
   autorise l'annulation et la mise à jour de moyen de paiement.

> ⚠️ La gestion serveur des entitlements et l'idempotence des webhooks Stripe
> (table `stripe_webhook_events`, source de vérité `user_entitlements`) sont
> **du ressort du code** (Phase 2, non encore livrée). Ne bascule pas en paiement
> public tant que ces éléments ne sont pas en place — voir la roadmap.

### 7. Secrets Supabase (Edge Functions) — 5 min
Dashboard Supabase → **Edge Functions → Secrets** (ou CLI `supabase secrets set`).
Renseigne :
- `STRIPE_SECRET_KEY` = `sk_live_...`
- `STRIPE_WEBHOOK_SECRET` = `whsec_...`
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN`,
  `STRAVA_WEBHOOK_SIGNING_SECRET`
- `ANTHROPIC_API_KEY` (si l'analyse IA est active)
Vérifie que `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont bien injectés
automatiquement (par défaut oui).

### 8. Secrets GitHub Actions (build web) — 3 min
**Settings → Secrets and variables → Actions → New repository secret** :
- `VITE_STRIPE_MONTHLY_URL`, `VITE_STRIPE_ANNUAL_URL` (liens de paiement, avec
  `metadata plan=monthly|annual`)
- `VITE_MAPTILER_KEY`, `VITE_SENTRY_DSN` (optionnels)
Ces valeurs sont injectées au build par `deploy-pages.yml`.

### 9. Rotation de secrets (si doute d'exposition) — variable
La clé **anon** est publique (aucune action). En revanche, si l'un de ces secrets
a pu fuiter (repo public, logs, capture) : **fais-le tourner**.
- `service_role` : Supabase → Settings → API → **Reset**. ⚠️ Casse les Edge
  Functions le temps de re-renseigner le secret.
- `STRIPE_SECRET_KEY` / `whsec_` : Stripe → roll key / roll signing secret.
- `STRAVA_CLIENT_SECRET` : Strava API settings → régénère.
- `ANTHROPIC_API_KEY` : console Anthropic → révoque + recrée.

### 10. Pages légales — informations obligatoires à fournir — 30 min
Le code contient des marqueurs « À compléter » (forme juridique, SIREN, adresse).
Fournis **de vraies valeurs** (ne pas inventer) :
- Identité de l'éditeur : nom/raison sociale, **forme juridique**, **SIREN/SIRET**
  si société, adresse postale, e-mail de contact, directeur de publication.
- Hébergeur : Supabase (AWS `eu-north-1`) + GitHub Pages — nom, adresse.
- **Médiateur de la consommation** (obligatoire pour la vente en ligne aux
  consommateurs en France) : nom + URL du médiateur adhéré.
- TVA : régime applicable (franchise en base ? n° TVA intracommunautaire ?).
- **Fais valider les CGU / la politique de confidentialité par un professionnel du
  droit** avant l'ouverture commerciale. Les textes actuels portent des mentions
  « à faire valider » — c'est un point juridique, pas technique.

---

## P2 — Avant publication sur l'App Store / Play Store

### 11. Hébergement du site depuis un repo privé — 15 min
Si tu passes le repo en privé (§2) et que GitHub Pages ne suit pas :
- Option A : héberger le **build** sur un repo public dédié (`vorcelab-web-dist`)
  poussé par la CI, code source restant privé.
- Option B : migrer vers **Cloudflare Pages** (voir `docs/cloudflare-migration.md`)
  ou Netlify/Vercel — build depuis le repo privé, secrets côté plateforme.

### 12. Comptes stores + achats intégrés — plusieurs heures
- **Apple Developer Program** (99 $/an) : crée l'app dans App Store Connect,
  bundle id, fiche, captures.
- **Google Play Console** (25 $ une fois).
- **RevenueCat** (recommandé) : crée le projet, connecte App Store Connect + Play
  Billing, définis les produits d'abonnement iOS/Android équivalents au web.
> ⚠️ Règle Apple : pas de lien Stripe d'achat de contenu numérique **dans l'app
> iOS**. L'architecture IAP (StoreKit/Play Billing via RevenueCat, webhook →
> `user_entitlements`) est **du code à écrire** (Phase 4, non livrée). Ne soumets
> pas à Apple avant.
- **EAS Build** : `eas build` pour iOS/Android, config `eas.json` (à créer).
  `app.json` est actuellement gitignored — il faudra le versionner proprement.

---

## P3 — Croissance / exploitation

### 13. Sauvegarde & reprise — 20 min
- Supabase → **Database → Backups** : vérifie que les backups quotidiens (PITR si
  plan Pro) sont actifs. Documente **RPO/RTO**.
- Teste une **restauration** sur un projet jetable au moins une fois.
- Vérifie qu'un environnement vierge se recrée **depuis le seul dépôt** :
  `supabase db reset` sur un projet neuf. ⚠️ Un **drift** existe (les migrations
  du repo ont des timestamps différents de la prod) → faire un `supabase db pull`
  pour rebaseliner l'historique (voir roadmap).

### 14. Monitoring & alertes — 15 min
- **Sentry** : crée les projets web + mobile + Edge Functions, renseigne les DSN.
- Configure des alertes : paiement accepté sans entitlement, file Strava bloquée,
  échec massif de refresh tokens, taux d'erreur élevé, suppression de compte
  échouée. (L'instrumentation applicative est en partie du code — Phase 4.)

---

## Récapitulatif « qui fait quoi »

| Action | Toi (manuel) | Code (fait / à faire) |
|--------|:---:|:---:|
| Migration sécurité prod | — | ✅ fait |
| Dépôt privé | ✅ | — |
| Leaked password protection | ✅ | — |
| Branch protection `main` | ✅ | config CI ✅ |
| Produits/prix/webhook Stripe | ✅ | idempotence & entitlements ⏳ Phase 2 |
| Secrets Supabase / GitHub | ✅ | — |
| Pages légales (SIREN, médiateur, validation juridique) | ✅ | mécanisme d'acceptation versionnée ⏳ Phase 4 |
| Comptes Apple/Google/RevenueCat | ✅ | architecture IAP ⏳ Phase 4 |
| Backups testés / RPO-RTO | ✅ | rebaseline migrations ⏳ Phase 3 |
| Sentry projets/DSN | ✅ | tags & alertes ⏳ Phase 4 |
