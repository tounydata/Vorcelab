# Conformité API Strava — dossier de re-soumission

> État au 2026-08-21. Ce document répond, point par point, aux quatre motifs de refus
> énumérés par Strava dans sa réponse à la demande d'augmentation de quota. Chaque
> affirmation renvoie au fichier qui la porte : elle est vérifiable, pas déclarative.

Les quatre motifs génériques cités par Strava :

1. l'app n'offre pas d'expérience **complémentaire** aux utilisateurs Strava ;
2. l'usage de l'API **n'est pas optimisé** pour les requêtes effectuées ;
3. des préoccupations de **sécurité ou de vie privée** ;
4. non-conformité à l'**API Agreement** ou à l'**API Policy**.

---

## 1. Expérience complémentaire

Vorcelab n'est pas un second Strava : il ne rejoue pas le fil d'actualité, ne
reproduit pas les segments, ne remplace pas l'enregistrement d'activité. Il lit les
sorties déjà enregistrées sur Strava et en tire ce que Strava n'affiche pas — profil
de coureur par gradient (VAM, dérive cardiaque, durabilité), charge d'entraînement
(PMC / ACWR), plan de renforcement co-périodisé, stratégie de course sur GPX. Une
sortie reste une sortie Strava ; Vorcelab en est la lecture.

Concrètement, dans l'interface :

| Exigence des Brand Guidelines | Où | Fichier |
| --- | --- | --- |
| Bouton officiel « Connect with Strava », non modifié | Écran de connexion | `public/strava/btn_strava_connect_with_orange.svg` |
| Logo officiel « Powered by Strava » sur **chaque vue affichant des Strava Data** | Tableau de bord, liste d'activités, détail d'activité, profil coureur, coach, liste de courses, stratégie de course (y compris la page de partage publique), carte de connexion — web **et** mobile | `src/components/PoweredByStrava.tsx`, `mobile/src/components/StravaBrand.tsx` |
| Lien retour vers l'activité d'origine sur Strava | Chaque ligne de la liste, chaque sortie du tableau de bord, en-tête du détail | `src/components/ViewOnStrava.tsx`, `src/lib/stravaActivityUrl.ts` |
| Attribution de l'athlète (nom, avatar) | Carte de connexion Strava | `src/components/StravaConnection.tsx` |

Le logo est servi tel quel depuis `public/strava/`, jamais recoloré ni animé, et sa
largeur est bornée pour qu'il ne domine jamais l'identité Vorcelab — les deux
contraintes des guidelines.

L'attribution suit la donnée, pas seulement l'écran qui la liste : le profil coureur
(VAM, dérive cardiaque, durabilité), le plan du coach et les projections de course
sont **calculés à partir des Strava Data** et relèvent donc de la même exigence. Toute
vue qui en affiche porte le logo, y compris la page de partage publique d'une
stratégie — une projection partagée reste une donnée dérivée de Strava, même lue par
quelqu'un qui n'a pas de compte Vorcelab.

Le lien retour est le point le plus structurant : **toute donnée d'activité affichée
renvoie vers l'activité correspondante sur strava.com**. L'identifiant n'est jamais
converti en `number` (au-delà de 2^53 la conversion perdrait des chiffres et pointerait
vers l'activité d'un autre athlète) ; `tests/stravaActivityUrl.test.ts` verrouille ce
comportement.

## 2. Optimisation des appels d'API

Le principe : **une donnée immuable n'est demandée qu'une fois.** Les streams d'une
activité terminée ne changent plus ; les redemander est un appel gaspillé.

### Ingestion pilotée par webhook, jamais par sondage

Aucune boucle ne sonde `GET /athlete/activities` à intervalle régulier. Les nouvelles
sorties arrivent par webhook (`supabase/functions/strava-webhook/`) ; la pagination
complète n'a lieu qu'à la première connexion.

### Lecture des en-têtes de quota et arrêt préventif

`supabase/functions/_shared/stravaRateLimit.ts` lit `X-RateLimit-Limit/Usage` et
`X-ReadRateLimit-Limit/Usage` sur **chaque** réponse. Les traitements de fond s'arrêtent
à **90 %** du plafond (`BACKGROUND_BUDGET_RATIO`), laissant les 10 % restants aux appels
interactifs. Un 429 n'est pas géré : il n'est pas atteint. C'est la réponse directe à
« Check API response headers and throttle back requests when necessary » de la page
« Adjustment Requests » de Strava.

### Cache des tracés, côté serveur

`activity_streams` conserve les streams récupérés. Une activité sans tracé exploitable
(privée, 404, vide) reçoit un **marqueur `{}`** : elle n'est plus jamais redemandée.

`supabase/functions/strava-activity/` sert désormais **le cache d'abord**. Auparavant,
il appelait Strava à chaque ouverture d'une sortie : le cache n'était consulté que par
le navigateur, donc contourné dès qu'un autre client appelait (mobile, cache vidé,
rechargement dur). L'appel Strava n'a plus lieu qu'au premier accès à une activité, et
son résultat est écrit côté serveur — l'appel suivant, quel que soit le client, n'en
refait pas.

### Le webhook applique ce que Strava a déjà envoyé

Un événement `activity/update` porte le détail du changement dans `updates` (titre,
type, visibilité). Renommer une sortie déclenchait un `GET /activities/{id}` complet
pour ré-obtenir un objet dont on connaissait déjà le seul champ modifié. Le renommage —
l'événement `update` le plus fréquent — est maintenant appliqué en base **sans aucun
appel**. Un champ non couvert ou un `updates` vide provoque toujours une relecture :
l'exactitude prime. Voir `supabase/functions/_shared/stravaWebhook.ts` et
`tests/stravaWebhook.test.ts`.

### Idempotence des rejeux de webhook

Strava rejoue un événement tant qu'il n'a pas reçu de 200, et un 200 perdu en route
suffit à provoquer un rejeu. Sans clé d'idempotence, chaque rejeu refaisait l'appel. La
clé `(owner_id, object_id, aspect_type, event_time)` identifie l'événement de façon
stable ; un rejeu est ignoré avant tout appel.

### Synchronisation manuelle bridée

Le bouton « Synchroniser » relançait une pagination à chaque clic. Une synchronisation
incrémentale survenant moins de **5 minutes** après la précédente est désormais ignorée
côté serveur, sans toucher à l'API — les nouvelles sorties arrivent de toute façon par
webhook. La synchronisation *complète* (première connexion, réparation explicite) n'est
jamais bridée. Voir `supabase/functions/_shared/stravaSyncPolicy.ts`.

### Rattrapage de fond borné

`supabase/functions/backfill-streams/` complète le cache par lots : **80 appels maximum
par passage**, 250 ms entre deux appels, fenêtre glissante de 190 jours, arrêt sur
budget de quota. Les courses confirmées passent en premier — le quota est la ressource
rare, il sert d'abord ce qui ne se rattrape pas autrement.

### Rétention du payload brut

`supabase/functions/purge-strava-raw/` réduit `raw_data` aux seules clés consommées dès
qu'une activité dépasse **7 jours** (API Policy §6.2), ce qui efface notamment le tracé
encodé et les points de départ/arrivée que §5.7 interdit de conserver.

## 3. Sécurité et vie privée

| Point | Mise en œuvre |
| --- | --- |
| Jetons Strava | Stockés côté serveur uniquement, jamais renvoyés au navigateur. Toutes les opérations passent par des Edge Functions (`strava-*`). |
| Isolation des données | RLS activée sur toutes les tables utilisateur : un athlète ne lit que ses propres lignes. `strava-activity` filtre en plus sur `user_id` — présenter l'identifiant d'une activité tierce ne donne rien. |
| Unicité du lien | Un athlète Strava ne peut être lié qu'à un seul compte Vorcelab, et une réautorisation doit concerner le même athlète (`strava-oauth`). |
| Webhook non signé | Strava ne signe pas ses appels et l'URL est publique. Les événements dont le `subscription_id` ne correspond pas à `STRAVA_SUBSCRIPTION_ID` sont ignorés **avant** toute écriture et tout appel d'API — sans ce filtre, un tiers pouvait déclencher notre consommation de quota. |
| Activité passée en privé | Si l'autorisation ne couvre pas `activity:read_all`, l'activité et son tracé sont **supprimés** dès que le webhook signale le passage en privé. |
| Révocation | Purge intégrale et transactionnelle des Strava Data et des données dérivées, par les deux chemins : déconnexion depuis Vorcelab (`strava-disconnect`) et désautorisation depuis Strava (`strava-webhook`). Une seule définition de « tout supprimer » : `_shared/stravaPurge.ts` → `public.purge_strava_data`. |
| Suppression de compte | `supabase/functions/delete-account/`. |
| Endpoints de maintenance | Réservés au rôle service, vérifié par les **pouvoirs** de la clé et non par comparaison de chaîne. |

## 4. Conformité API Agreement / API Policy

- **Aucune IA sur les Strava Data.** L'analyse et le coaching sont 100 % locaux et
  déterministes. L'ancien endpoint `ai-analysis` répond `410 Gone` et le dit
  explicitement — il ne reste que pour que rien ne puisse le rappeler par mégarde.
- **Aucune agrégation inter-athlètes** dans le produit : pas de classement, pas de
  moyenne de peloton, pas de comparaison entre athlètes. Chaque analyse ne porte que
  sur les données de l'athlète connecté.
- **Aucune revente ni transmission** des Strava Data à un tiers.
- **L'abonnement PRO ne facture pas l'accès à Strava.** La synchronisation, les données
  Strava et toutes les fonctions fournies par Strava restent gratuites et accessibles
  sans abonnement — c'est écrit dans les CGV (`src/pages/LegalPage.tsx`).
- **Rétention** conforme à §6.2 / §5.7 (voir plus haut).
- **Suppression sur révocation** conforme à §7.4 (b), immédiate et non différée.

### Point signalé pour transparence

L'onglet d'administration comporte un inventaire des connexions Strava (nombre
d'activités, date de dernière sortie, par compte lié). Il n'est accessible qu'à
l'exploitant de l'application, en lecture seule, et sert une seule question
opérationnelle : quel jeton libérer quand le plafond d'athlètes imposé par Strava est
atteint. Toute action de révocation reste derrière un flux d'assistance journalisé et
consenti (`supabase/functions/admin-support/`).

---

## Variables d'environnement ajoutées

| Variable | Rôle |
| --- | --- |
| `STRAVA_SUBSCRIPTION_ID` | Identifiant de l'abonnement webhook (`GET /api/v3/push_subscriptions`). Les événements portant un autre identifiant sont ignorés. Tant qu'elle n'est pas renseignée, les événements sont acceptés et un avertissement est journalisé — **à provisionner avant la re-soumission**. |

## Vérifications

```bash
npm test        # tests unitaires, y compris quota, webhook, cooldown, lien profond
npm run lint
npm run build
```

---

## Resubmission summary (English)

*Copy-paste for the Strava application form.*

**Complementary experience.** Vorcelab does not duplicate Strava. It reads activities
already recorded on Strava and adds analysis Strava does not provide: gradient-based
runner profiling (VAM, cardiac drift, durability), training load (PMC / ACWR),
co-periodised strength programming, and GPX race strategy. Every view that displays
Strava data carries the official *Powered by Strava* logo, unmodified, and **every
activity we display links back to that activity on strava.com**. The connection flow
uses the official *Connect with Strava* button and shows the athlete's name and avatar.

**Optimised API usage.** Ingestion is webhook-driven; we never poll the activity list.
Rate-limit headers are read on every response and background work stops at 90 % of the
quota, reserving the remainder for interactive requests — we throttle before the limit
rather than absorbing 429s. Activity streams are immutable, so they are fetched once and
cached server-side; activities with no usable stream are marked and never requested
again. `activity/update` events are applied from the webhook payload itself (a rename
costs zero API calls); webhook replays are idempotent; manual sync is rate-limited to
one incremental pass per five minutes; the backfill job is capped at 80 calls per run
with 250 ms spacing.

**Security and privacy.** Strava tokens never reach the browser — all Strava calls run
in server-side Edge Functions. Row-level security isolates every athlete's data. One
Strava athlete maps to exactly one account. Webhook events are filtered by subscription
id, since the endpoint is public and unsigned. An activity switched to private is
deleted, along with its stream, when our grant does not include `activity:read_all`.
Deauthorisation — from Strava or from within Vorcelab — triggers a single transactional
purge of all Strava data and everything derived from it.

**Policy compliance.** No Strava data is ever sent to an AI or machine-learning
provider; all analysis is local and deterministic. No cross-athlete aggregation,
leaderboards, or comparisons. No resale or third-party transfer. Raw payloads are
reduced to the fields we use after seven days, dropping encoded polylines and
start/end coordinates. Our paid tier never charges for Strava access: synchronisation
and every Strava-powered feature remain free.
