# Roadmap consolidée — audits du 21–22 juillet 2026

> Consolidation des trois audits :
> 1. **Audit produit & maturité commerciale** (rapport DOCX, 22/07/2026, commit `0a1dfe5`) — note globale 6,9/10.
> 2. **Audit design · UX · features mobile** (« Vorcelab mobile », 21/07/2026).
> 3. **Recréation pixel-perfect des écrans** (base visuelle de l'audit design).
>
> **Exclusion décidée par le propriétaire** : le redesign « planning hebdomadaire »
> de la page Coach mobile (maquette 2c, timeline agenda L→D) n'est PAS retenu.

---

## Avis sur les audits

Les trois documents convergent et se recoupent avec l'état réel du code — ils sont
fiables sur l'essentiel :

- **Le diagnostic central est juste** : le fond (moteur, coach, renfo, profil) est
  au-dessus du marché, et le frein n'est plus « construire davantage » mais rendre
  l'existant **fiable, lisible, juridiquement exploitable et défendable**.
- **Les P0 du rapport commercial sont les bons** : démos incohérentes, quotas PRO
  décidés uniquement côté client, policy `renfo_focus_log` sans `WITH CHECK`,
  loader sans issue en cas d'erreur de session — tout est vérifié dans le code.
- **L'audit design a raison sur le ROI** : les fontes de marque absentes du mobile
  (`theme.ts` : `font.* = undefined`) sont le plus gros levier visuel pour un
  effort minime ; le gating PRO absent du mobile est le vrai risque n°1 de la v1
  (habituer les premiers utilisateurs au tout-gratuit puis leur retirer).
- **Nuances** : (a) le « risque 3.1.3(b) App Store » est réel mais la lecture
  reader-app vs cross-platform mérite un avis à jour au moment de la soumission ;
  (b) la migration Expo 54→57 est à faire par paliers mais n'est pas bloquante
  pour la bêta web ; (c) certains items sont **non-code** (SIREN/médiateur,
  compte Apple, secrets Stripe) et ne peuvent pas être fermés par le dépôt seul.

## Ce qui est appliqué dans cette PR (code)

### P0 — confiance, sécurité, revenu
| Item | Source audit | Contenu |
|---|---|---|
| Sécurité RLS | DOCX §3.4, P0.2 | `WITH CHECK` rétabli sur la policy UPDATE de `renfo_focus_log` (+ verrou `user_id`) |
| SECURITY DEFINER | DOCX §3.4, P0.2 | `search_path` épinglé, `EXECUTE` des RPC admin retiré à `authenticated` quand la RPC est réservée |
| Quota PRO serveur | DOCX §4.4, P0.4 | Le quota gratuit (1 stratégie GPX) est décidé en base via trigger sur `race_calendar` + journalisation des refus dans `user_events` |
| Démo cohérente | DOCX §4.3, P0.5 | Les chiffres affichés (distance, D+, VDOT) sont dérivés du calcul réel — plus aucune valeur en dur contradictoire |
| CTA démo | DOCX §4.3, P0.5 | Les CTA de la page démo mènent à `/login` (inscription), plus à la racine |
| Loader | DOCX §3.3, P0.5 | `getSession` : timeout + catch + écran de récupération (bouton réessayer) |
| Env prod par défaut | DOCX §3.4 | Le fallback silencieux vers la prod est signalé en dev (garde-fou explicite) |

### P1 — qualité web
| Item | Source | Contenu |
|---|---|---|
| Lint 0 warning | DOCX backlog ingénierie | `exhaustive-deps` Dashboard + `no-explicit-any` renfoProgram corrigés |
| Contraste AA | DOCX §5.3 / design transverse | Token `--vl-text-3` remonté ≥ 4,5:1 sur les surfaces sombres |
| Sémantique | DOCX §5.3 | `Link > button` remplacé par un lien stylé unique sur la landing |
| MapLibre | DOCX §3.3, P2.3 | Chargement du chunk carto confiné aux routes qui l'utilisent |

### Mobile (audit design)
| Item | Source | Contenu |
|---|---|---|
| Fontes de marque | CRITIQUE §1 | Big Shoulders Display + JetBrains Mono chargées via expo-font, câblées dans `theme.ts` |
| Hiérarchie chromatique | IMPORTANT §1 | Bleu hors-thème `#3B82F6` → ton du thème ; règle 4 accents (ember=action/course, growth=validé, amber=vigilance, violet=renfo) |
| Emojis → SVG | MINEUR §1 | 💾 ⚙️ ✏ ⛰ ⇅ ▲▼ remplacés par le jeu SVG existant |
| Gating PRO v1 | Funnel 01 | `usePlanTier` + `ProGate` portés (1 stratégie GPX gratuite, plan coach 2 semaines), **sans prix ni lien d'achat** (3.1.3b) |
| Login complet | Écran 1a | Création de compte + reset mot de passe + Sign in with Apple activé ; promesse produit avant le compte |
| Accessibilité | Transverse | Cibles tactiles ≥ 44 pt (chips A/B/C, sous-onglets, ▲▼, Recalculer) ; textes informatifs text3→text2 |
| Lint mobile | DOCX §3.2, P1.2 | Config ESLint Expo réparée (les fichiers `mobile/src` sont réellement lintés) |
| Funnel instrumenté | Funnel 05 | Events `progate_view` / activation portés sur mobile |

**Exclu (décision propriétaire)** : timeline hebdo de la page Coach (maquette 2c).

## Ce qui reste HORS de cette PR (non-code ou dépendant de comptes/secrets)

### Bloquants commerciaux à fermer à la main
- **P0.1 Juridique** : SIREN/SIRET, forme juridique, adresse, directeur de
  publication, médiateur — à compléter dans `src/lib/legalVersions.ts` /
  `LegalPage` puis passer `LEGAL_INFO_COMPLETE` à vrai. Relecture juriste.
- **P0.3 Stripe E2E** : rejouer en test-mode checkout, renouvellement, impayé,
  annulation, remboursement, replay du même event (le registre
  `stripe_webhook_events` doit cesser d'être vide). Nécessite les secrets.
- **Protection mots de passe compromis** : réglage Dashboard Supabase
  (Auth → Passwords → « Leaked password protection ») — pas pilotable en SQL.
- **P0.6 App Store** : décision IAP (RevenueCat) vs périmètre gratuit v1, avec
  lecture à jour de 3.1.3(b).

### Semaines 3–6 (P1 audit commercial)
- Staging Supabase séparé + rebaseline migrations (fonction orpheline
  `smooth-processor` à documenter ou supprimer).
- Migration Expo 54 → 55 → 56 → 57 par paliers, build release EAS interne,
  qualification des 56 advisories npm.
- E2E authentifiés stables + smoke mobile de release en CI.
- Onboarding « aha < 10 min » : démo GPX sans compte sur mobile, funnel mesuré.
- Design primitives (12–15 composants) et migration opportuniste des styles inline.

### Semaines 7–12 (P2)
- Extraction des 67 modules identiques web/mobile vers `packages/` + test de parité étendu au mobile.
- Découpage des modules > 900 lignes.
- Bêta fermée 30–50 coureurs ; ≥ 100 projections prospectives évaluées,
  holdout par athlète → seulement ensuite, claims publics de précision.
- Features signature (audit design §4) : mode Jour J offline, story post-course
  auto, widget iOS + Live Activity, bilan d'affûtage, comparaison de courses,
  mode plein soleil ; direction « ligne de crête » sur Dashboard/Coach/détail course.

## Portes de lancement (rappel DOCX §10)
- **Bêta fermée web** : GO dès P0.2 + P0.3 + P0.5 fermés.
- **Vente web publique** : NO-GO tant que tous les P0 (dont juridique) ne sont pas fermés.
- **App Store** : NO-GO avant TestFlight réel + stratégie IAP confirmée.
- **Claims de précision** : NO-GO tant que le jeu prospectif évalué est vide.
