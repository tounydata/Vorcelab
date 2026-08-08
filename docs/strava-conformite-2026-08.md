# Conformité Strava — écarts et plan de remise à niveau

Contexte : la demande d'augmentation de capacité (500 athlètes) a été refusée le
2026-08-03. Le refus est un formulaire type, sans retour individuel, listant quatre
motifs génériques. Ce document confronte le code au texte applicable pour identifier
ce qui doit être corrigé **avant** de resoumettre.

Référentiel : **API Policy (2026), en vigueur au 1er juin 2026** — texte vérifié sur
`https://www.strava.com/legal/api_policy`, et API Agreement (2026).

---

## 1. Ce qui est déjà conforme

Ces points sont des arguments à mettre en avant dans la resoumission.

| Exigence | État | Preuve |
|---|---|---|
| **5.3** — aucune utilisation IA/ML | ✅ | `supabase/functions/ai-analysis/index.ts` retourne `410` : « External analysis is disabled. Vorcelab uses local deterministic analysis only. » Aucun appel LLM dans `src/` ni `supabase/`. Le moteur est déterministe et physiologique. |
| **5.3** — mention explicite à l'utilisateur | ✅ | `src/pages/LegalPage.tsx:409` : aucune donnée d'activité transmise à un fournisseur d'IA. |
| **7.2** — OAuth, jamais d'identifiants | ✅ | `strava-oauth`, `strava-auth`. Confirmé dans la politique de confidentialité §7. |
| **7.4 (c)** — suppression de compte | ✅ | `delete-account` + `20260712000000_rgpd_cascade_fks.sql` : `ON DELETE CASCADE` vers `auth.users`, suppression transactionnelle complète. |
| **6.3** — suppression d'activité reflétée | ✅ | `strava-webhook` traite `aspect_type: 'delete'` (soft-delete `deleted_at`), bien en deçà des 48 h. |
| **4.2** — attribution | ✅ | « POWERED BY STRAVA » présent (`StravaConnection.tsx`, `StravaLinkPromptCard.tsx`). |
| **7.3** — politique de confidentialité | ✅ | `src/pages/LegalPage.tsx`, hébergement UE (Supabase Stockholm). |
| **RLS** | ✅ | Politiques `users_own_streams` etc. — chaque ligne est cloisonnée par propriétaire. |

---

## État au 2026-08-07

| # | Écart | État |
|---|---|---|
| 2.1 | Purge sur déconnexion | ✅ corrigé |
| 2.2 | Désautorisation via webhook non détectée | ✅ corrigé |
| 2.3 | Rétention au-delà de 7 jours | 🟡 **partiel** — payload brut purgé, résumés et streams ouverts |
| 2.4 | Banc agrégeant plusieurs athlètes | ✅ corrigé (restreint à un athlète) |
| 2.5 | Base commune de GPX | ⚠ à vérifier |
| 3 | Points annexes | ⚠ à traiter |

**§6.2 reste partiellement ouvert, et il conditionne l'honnêteté de la
resoumission.** Le payload brut (tracés, positions de départ/arrivée) est désormais
purgé à 7 jours ; les résumés d'activité et les streams ne le sont pas. Ne pas
envoyer de dossier affirmant une conformité totale sur ce point : le poser en
question, comme le fait `strava-resoumission-2026-08.md`.

---

## 2. Écarts bloquants

### 2.1 — Révocation d'autorisation : les données ne sont pas supprimées (§7.4 b) — ✅ CORRIGÉ

**Corrigé** par `20260807000000_strava_revocation_purge.sql` (fonction
`purge_strava_data`), appelée par `strava-disconnect`. La politique de
confidentialité §7 a été réécrite en conséquence et sa version incrémentée
(`2026-08-07`) pour déclencher un re-consentement.

Description d'origine ci-dessous.

**Le plus grave.** La Policy impose, lorsqu'un utilisateur révoque l'autorisation,
la suppression de *toutes* les Strava Data et Personal Data qui en dérivent, sous
30 jours.

`supabase/functions/strava-disconnect/index.ts:39-43` ne supprime que
`strava_tokens`. `strava_activities`, `activity_streams`, `activities_history`,
`race_calendar` et les profils dérivés restent en base indéfiniment.

Aggravant : la politique de confidentialité §7 **promet explicitement l'inverse** —
« l'utilisateur peut choisir de supprimer ou de conserver les activités déjà
importées. Aucune suppression de ces activités n'est effectuée sans accord
explicite. » Ce texte est directement contraire à §7.4 et il est public.

À faire :
- `strava-disconnect` supprime l'intégralité des données dérivées de Strava.
- Réécrire §7 de la politique de confidentialité en conséquence.

### 2.2 — La révocation côté Strava n'est jamais détectée (§7.4 b) — ✅ CORRIGÉ

**Corrigé** : `strava-webhook` traite désormais `object_type: 'athlete'` avec
`updates.authorized === 'false'` et déclenche la même purge que la déconnexion
manuelle (`handleDeauthorization`). Un seul chemin de suppression, partagé.

Description d'origine ci-dessous.


`supabase/functions/strava-webhook/index.ts:105` :

```ts
if (event.object_type !== 'activity') return
```

Strava notifie les désautorisations via `object_type: 'athlete'` avec
`updates: { authorized: 'false' }`. Cet événement est **ignoré**. Un utilisateur qui
révoque depuis les réglages Strava (le chemin normal) reste indéfiniment en base,
sans que Vorcelab l'apprenne jamais.

C'est un écart facile à constater pour un relecteur et il touche au cœur du
consentement.

À faire : traiter l'événement athlète et déclencher la même purge qu'en 2.1.

### 2.3 — Rétention au-delà du cache de 7 jours (§6.2, §5.5, §5.7) — 🟡 PARTIELLEMENT CORRIGÉ

**Fait.** `20260807010000_strava_raw_payload_retention.sql` +
`supabase/functions/purge-strava-raw` : au-delà de 7 jours, `strava_activities.raw_data`
est réduit aux quatre clés réellement consommées (`workout_type`, `average_temp`,
`exercise_sets`, `source`). Tout le reste du payload Strava est effacé — dont
`map.summary_polyline`, `start_latlng` et `end_latlng`, c'est-à-dire l'intégralité des
données de localisation visées par §5.7. La migration purge aussi l'existant.

Aucun changement fonctionnel : les quatre clés conservées sont exactement celles que
le code lit. Seul effet de bord, assumé : `fillMissingWeather` ne pourra plus rattraper
la météo d'une sortie de plus de 7 jours, faute de position de départ.

**Reste ouvert.** Les résumés d'activité (`strava_activities` : distance, temps, D+) et
`activity_streams` sont toujours conservés sans limite.

Pourquoi ce n'est pas fait ici : le moteur consomme 183 jours de résumés et 56 jours de
streams. Les purger à 7 jours suppose d'avoir d'abord extrait, **par activité**, les
grandeurs dérivées que le profil consomme (allures par tranche de pente, VAM, dérive
cardiaque, récupération, sinuosité des descentes, records) et de faire lire ces
contributions au constructeur de profil à la place des streams.

Or `buildRunnerProfile` construit ces grandeurs dans une boucle de ~340 lignes qui
écrit dans une dizaine d'accumulateurs partagés. Extraire une contribution pure par
activité est faisable mais c'est une refonte du cœur du moteur, à mener avec ses
propres tests de parité — pas un effet de bord d'un lot de conformité. La tenter à la
va-vite dégraderait silencieusement les projections.

Description d'origine ci-dessous.


§6.2 : « You may not retain Strava Data in your cache for longer than seven (7)
days. » §5.5 interdit d'accumuler les données en un corpus persistant ; §5.7
interdit de stocker les informations géographiques hors de ce que permet §6.2.

Or la base conserve tout, sans limite : le banc a chargé **4096 activités et 438
streams**, dont des courses de **2018**. Aucune tâche de purge n'existe (aucune
occurrence de purge/retention/TTL dans `supabase/`).

C'est l'écart le plus structurant, parce que le moteur a besoin de 183 jours
d'historique pour fonctionner. La lecture stricte de §6.2 et le besoin produit
s'opposent frontalement.

Piste de résolution — séparer strictement :
- **Strava Data brutes** (payloads d'activité, streams, coordonnées GPS) : cache
  transitoire ≤ 7 jours, purge automatique.
- **Métriques dérivées** nécessaires au service rendu à *cet* utilisateur (buckets
  d'allure par pente, VAM, dérive, records) : conservées au titre de §6.4
  (« only so long as necessary for the purpose for which it was originally
  obtained »), sans conserver la donnée brute sous-jacente.

Cette séparation doit être explicite dans le code **et** décrite dans la
resoumission — c'est très probablement le point que le relecteur regardera.

### 2.4 — Le banc de validation tombe sous §5.4 — ✅ CORRIGÉ

**Corrigé** : le banc est restreint à **un athlète à la fois**
(`restrictToSingleAthlete`, option `--athlete`). Si les données chargées couvrent
plusieurs athlètes sans sélection explicite, le script s'arrête. Vérifié sur la base
réelle : le lancement sans `--athlete` échoue désormais.

Le coût méthodologique est réel et documenté dans `engine-validation.md` :
échantillon plus petit, intervalles plus larges, bootstrap par athlète sans objet.

Description d'origine ci-dessous.


§5.4 : « You may not process or disclose Strava Data — even publicly viewable
Strava Data — including in an aggregated, de-identified, or anonymized manner, for
the purposes of analytics, analyses, customer insight generation, **or product or
service improvements**. You may not combine Strava Data with other customer data
for these or any other purposes. »

Le banc (`scripts/run-real-engine-backtest.ts`, `src/lib/realBacktest.ts`, workflow
`engine-backtest.yml`) agrège les données de **7 athlètes** pour mesurer et
améliorer le moteur. La pseudonymisation ne sauve pas : §5.4 vise explicitement les
formes « aggregated, de-identified, or anonymized ».

**Le dépôt est public.** `docs/engine-validation.md` décrit la démarche en détail et
`docs/examples/engine-backtest-example.md` en publie un rapport. Si un relecteur
Strava a regardé le dépôt, c'est visible immédiatement — et cela pourrait à soi seul
expliquer le motif « not compliant with our API Agreement or API Policy ».

À arbitrer (décision produit, pas technique) :
- soit le banc ne tourne plus que sur les données de l'exploitant lui-même, avec son
  propre consentement, et cesse d'agréger plusieurs athlètes ;
- soit il bascule sur un jeu de données hors Strava ;
- soit on sollicite un accord écrit de Strava avant de le relancer.

Tant que ce point n'est pas tranché, relancer le banc sur la base de production fait
courir un risque.

### 2.5 — Base commune de GPX (§5.10, §6.1)

Politique de confidentialité §9 : les traces GPX importées alimentent une base
mutualisée. §6.1 interdit d'exposer à un utilisateur les Strava Data d'un autre, et
§5.10 interdit tout transfert à des tiers.

Si cette base ne contient que des GPX de fichiers importés par l'utilisateur
(sources externes, organisateurs de course), c'est hors périmètre Strava. **Il faut
pouvoir le prouver** : une garantie technique qu'aucune trace reconstruite depuis
`activity_streams` n'y entre jamais.

À faire : vérifier le chemin d'alimentation, et le documenter.

---

## 3. Points à vérifier avant resoumission

- **§5.8 — pas de facturation de l'API.** L'offre payante (Stripe) doit facturer des
  fonctionnalités que Strava ne fournit pas, et non l'accès aux données. À formuler
  soigneusement dans la description de l'app.
- **§6.5** — la politique de confidentialité doit mentionner que Strava collecte des
  Usage Data. Absent aujourd'hui.
- **§7.7** — tenir à jour la liste des sous-traitants (Supabase, Sentry, Stripe,
  Cloudflare) et leurs lieux de traitement.
- **§3.7** — ne jamais contourner les quotas. Le backfill devra respecter les limites
  en vigueur, avec back-off explicite.

---

## 4. Ordre de traitement proposé

1. **2.2** — traiter la désautorisation par webhook (petit, isolé, démontrable).
2. **2.1** — purge complète à la déconnexion + réécriture de la politique §7.
3. **2.4** — trancher le sort du banc, et purger le dépôt public si nécessaire.
4. **2.3** — séparer données brutes (cache 7 j) et métriques dérivées. Le plus lourd.
5. **2.5**, puis section 3.
6. Resoumettre, en documentant chaque point corrigé.

Les points 1 à 3 sont ceux qu'un relecteur peut constater depuis l'extérieur. Le
point 4 est celui qui demande le plus de travail.

---

## 5. Ce que le refus ne dit pas

Le message reçu est un formulaire type. Strava indique explicitement ne pas fournir
de retour individuel, et §3.6 de la Policy précise que ces augmentations sont
discrétionnaires, sans délai garanti et sans garantie de résultat, y compris en
resoumission. Aucun des quatre motifs listés n'est désigné comme s'appliquant à
Vorcelab.

Ce document identifie donc des écarts **réels et vérifiables dans le code**, mais
rien ne permet d'affirmer que ce sont les motifs retenus par Strava.
