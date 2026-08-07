# Resoumission Strava — demande d'augmentation de capacité

Brouillon des réponses à recopier dans le formulaire de demande. Rédigé pour être
**vérifiable** : chaque affirmation correspond à du code que Strava peut voir dans le
dépôt public. Ne rien y écrire qui ne soit constatable.

> ⚠ **À lire avant d'envoyer.** Le point §6.2 (rétention au-delà de 7 jours) n'est
> pas résolu. Le texte ci-dessous ne prétend donc **pas** à une conformité totale : il
> pose la question ouvertement. C'est délibéré. Affirmer une conformité qu'on n'a pas
> se retourne contre l'app au premier contrôle, et une fausse déclaration se sanctionne
> par la révocation de l'accès API, pas par un simple refus.

---

## Champ « What does your application do? »

Vorcelab is a running-performance application for a single athlete's own data. It
produces race-time projections and pacing strategies from the athlete's own training
history, and returns them only to that athlete.

The projection engine is a deterministic physiological model: gradient-adjusted pace
buckets, vertical ascent rate, cardiac drift, durability and critical speed. Every
coefficient is hand-written and versioned in the repository. There is no statistical
model fitted across users, and no model of any kind trained on Strava data.

The application is open source: https://github.com/tounydata/Vorcelab

## Champ « Why do you need increased athlete capacity? »

Vorcelab is past its testing phase and has reached the current athlete ceiling. The
increase is needed to onboard real users, not to collect data — each athlete's data is
used solely to serve projections back to that same athlete.

## Compliance statement

**No AI or ML use (§5.3).** Vorcelab does not send Strava data to any AI provider and
does not train, fine-tune, embed or ground any model on it. The application's only
external-analysis endpoint was deliberately disabled and now returns HTTP 410 with an
explicit message (`supabase/functions/ai-analysis/index.ts`). This is stated to users
in our privacy policy. All analysis is local and deterministic.

**No cross-athlete aggregation (§5.4).** Each athlete sees only their own data. Our
internal engine-accuracy measurement previously ran across several athletes'
historical races; we have restricted it to a **single athlete at a time**, enforced in
code — the script aborts if the loaded data covers more than one athlete
(`restrictToSingleAthlete` in `scripts/run-real-engine-backtest.ts`). We accepted the
resulting loss of statistical power rather than keep an aggregate analysis.

**Deletion on revocation (§7.4).** All Strava data and data derived from it is deleted
immediately, transactionally, through a single database function
(`purge_strava_data`). It is triggered by both revocation paths:

- the athlete disconnecting inside Vorcelab (`strava-disconnect`);
- the athlete revoking access from Strava's own settings — we handle the
  `object_type: athlete`, `updates.authorized: false` webhook event
  (`strava-webhook`). This path was previously unhandled and has been fixed.

Deleted on revocation: tokens, activities, streams, weather, stored projections, and
the derived runner profile. Retained: what the athlete typed into Vorcelab themselves
(max heart rate, body metrics, goals, manual test results, planned races). Content
that merely referenced a Strava activity is kept with the Strava link removed.

**Account deletion (§7.4 c).** Deleting a Vorcelab account removes everything in one
transaction via `ON DELETE CASCADE` down to `auth.users`.

**Activity deletions reflected (§6.3).** Handled by webhook, well within 48 hours.

**Authorization and privacy (§7.1–7.3).** OAuth only — we never ask for Strava
credentials. Row-level security scopes every row to its owner. Data is hosted in the
EU (Supabase, Stockholm). Our privacy policy is public and versioned; the change
described above triggered a new version and re-consent.

**Attribution (§4.2).** "Powered by Strava" is displayed on the connection surfaces.

## Question ouverte à poser à Strava (§6.2)

À inclure telle quelle. Mieux vaut poser la question que se faire prendre.

> We would like guidance on §6.2 (seven-day cache limit). Our projection engine needs
> roughly six months of the athlete's own training history to produce a meaningful
> race prediction — this is inherent to endurance modelling, not an implementation
> choice. We currently retain the athlete's activity summaries and streams for that
> window, under §6.4 (retention limited to the purpose for which the data was
> obtained), and delete everything on revocation as described above.
>
> We would rather ask than assume. If this exceeds what §6.2 permits, we will move to
> storing only derived per-athlete metrics — gradient-adjusted pace buckets, vertical
> ascent rate, drift and recovery — and purge the underlying raw activity payloads and
> streams within seven days. We would appreciate confirmation of which model you
> expect.

---

## Avant d'envoyer — checklist

- [ ] Trancher §6.2 : soit implémenter la séparation brut / dérivé, soit envoyer la
      question ci-dessus. Ne pas laisser le sujet muet.
- [ ] Vérifier que la base commune de GPX n'est alimentée par aucune trace
      reconstruite depuis `activity_streams` (§2.5 de l'audit).
- [ ] Ajouter la mention Usage Data à la politique de confidentialité (§6.5).
- [ ] Publier la liste des sous-traitants (§7.7) : Supabase, Sentry, Stripe, Cloudflare.
- [ ] Relire la formulation de l'offre payante : elle facture des fonctionnalités que
      Strava ne fournit pas, jamais l'accès aux données Strava (§5.8).
- [ ] Faire tourner la clé `service_role` si elle a circulé hors d'un coffre.

## Ce qu'il ne faut pas faire

Ne pas renommer, déplacer ou masquer le banc de validation pour qu'il passe inaperçu.
Le problème n'était pas son nom mais l'agrégation multi-athlètes, qui est corrigée. Un
camouflage transformerait la resoumission en fausse déclaration, avec un risque sans
commune mesure avec le refus lui-même : §3.7 et l'Agreement permettent à Strava de
bloquer l'accès, définitivement, ce qui arrête l'application entière.
