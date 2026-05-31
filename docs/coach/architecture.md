# Coach Vorcelab — Schéma d'architecture du moteur

> Vue d'ensemble des modules, des **sources de vérité**, des flux de données et de **l'ordre d'évaluation**.
> Principe directeur : moteur **déterministe** (aucune IA), pures fonctions `src/lib`, **aucune dépendance aux signaux appareil** (cf. fonctions dormantes). Daté 2026-05-30.

> 🔄 **Consolidation (2026-05-31)** : le moteur s'appuie désormais sur l'engine existant **`src/lib/coach/`** (`workouts.ts` = catalogue source de vérité des séances, `planGenerator.ts` = phases/plan, source de vérité de la périodisation). Les modules redondants `periodization.ts` et `sessionCatalog.ts` ont été **retirés**. Mes apports uniques restent et se branchent dessus : `paceEngine` (allures), `structureWorkout` (template → blocs chiffrés), `sessionRecommender` (badges choix-first sur `WORKOUTS`), `safetyGuards`, `coachContent`.

---

## 1. Carte des modules par couche

```mermaid
flowchart TB
  subgraph SRC["📥 Sources de données — ACTIVES"]
    STRAVA["Strava<br/>FC · allure · GPS · D+ · streams"]
    MANUAL["Saisie manuelle<br/>profil · RPE · douleur · bien-être"]
  end

  subgraph DORMANT["🌙 Fonctions dormantes — PRÉVUES, NON consommées"]
    GARMIN["HRV · sommeil · stress<br/>readiness · Body Battery<br/><i>(pas d'API Garmin)</i>"]
  end

  subgraph L1["Couche 1 — Knowledge / mesure"]
    PACE["🟥 paceEngine.ts<br/><b>source de vérité ALLURES</b><br/>VDOT · VMA · zones FC"]
    LOAD["✅ trainingLoad.ts<br/>charge · ACWR · TSB · PMC"]
    SQ["✅ sessionQuality.ts<br/>classification séance"]
  end

  subgraph L2["Couche 2 — Intelligence"]
    PROFILE["🟡 runnerProfile.ts<br/>ability · buckets · dérive"]
  end

  subgraph L3["Couche 3 — Prédiction"]
    PROJ["✅ computeRaceProjection.ts<br/>projection · fraîcheur"]
    NUT["🟡 nutritionPlan · crewPlan"]
  end

  subgraph ENGINE["Orchestration"]
    PERIO["🟥 periodization.ts<br/><b>source de vérité PHASES</b><br/>base→spé→affûtage"]
    GEN["🟥 sessionGenerator.ts<br/>fabrique de séances"]
    RENFO["🟡 renfoUtils.ts<br/>DUP renfo"]
  end

  subgraph L4["Couche 4 — Comportemental / pédagogique"]
    CONTENT["🟥 coachContent.ts<br/>motivation · glossaire · débrief"]
  end

  subgraph SAFE["🛡️ Sécurité — PRIORITÉ ABSOLUE"]
    GUARDS["🟥 safetyGuards.ts<br/>douleur · surcharge · bien-être"]
  end

  STRAVA --> LOAD & SQ & PROFILE & PROJ
  MANUAL --> PACE & GUARDS & CONTENT
  GARMIN -. "🚫 non branché" .-> GUARDS

  PACE --> GEN & PERIO & PROJ
  PERIO --> GEN
  PERIO --> RENFO
  LOAD --> GUARDS & PERIO
  PROFILE --> GEN & PROJ
  GEN --> CONTENT
  GUARDS --> PERIO & GEN

  classDef new fill:#ffe0e0,stroke:#c0392b,stroke-width:2px;
  classDef done fill:#e0f5e0,stroke:#27ae60;
  classDef partial fill:#fff5e0,stroke:#e0a52a;
  classDef dormant fill:#eee,stroke:#999,stroke-dasharray:4 3;
  class PACE,PERIO,GEN,CONTENT,GUARDS new;
  class LOAD,SQ,PROJ done;
  class PROFILE,NUT,RENFO partial;
  class GARMIN dormant;
```

**Légende** : 🟥 nouveau module (épopées A-E) · ✅ bâti · 🟡 partiel · 🌙 dormant.

---

## 2. Ordre d'évaluation du moteur (un cycle de prescription)

```mermaid
flowchart LR
  START(["Jour J"]) --> SAFE{"🛡️ safetyGuards<br/>drapeau rouge ?"}
  SAFE -->|"OUI"| STOP["⛔ Arrêt + orientation pro<br/>(jamais de diagnostic)"]
  SAFE -->|"surcharge confirmée<br/>(≥2 signaux actifs)"| DELOAD["Décharge (C3)"]
  SAFE -->|"OK"| PHASE["periodization<br/>phase du jour"]
  PHASE --> BUILD["sessionGenerator<br/>+ paceEngine<br/>séance chiffrée"]
  BUILD --> WRAP["coachContent<br/>« pourquoi aujourd'hui » + niveau"]
  WRAP --> RUN(["Séance courue"])
  RUN --> FEED["Saisie RPE + douleur + ressenti<br/>(signaux ACTIFS)"]
  FEED --> LOOP["trainingLoad : sRPE → ACWR/forme"]
  LOOP -.->|"boucle d'adaptation"| SAFE
```

**Règle d'or** : `safetyGuards` s'évalue **avant** toute logique de performance. La boucle de feedback se nourrit **uniquement** de signaux actifs (Strava + auto-déclarés).

---

## 3. Sources de vérité (anti-duplication)

| Donnée | Source de vérité unique | Qui consomme |
|---|---|---|
| **Allures & zones** | `paceEngine.ts` | sessionGenerator, periodization, computeRaceProjection |
| **Phases & deload** | `periodization.ts` (`getCurrentPhase()`) | sessionGenerator, **renfoUtils** (remplace son `Date.now() % 4`) |
| **Charge / ACWR / forme** | `trainingLoad.ts` | safetyGuards, periodization |
| **Profil de terrain** | `runnerProfile.ts` | sessionGenerator (côtes), computeRaceProjection |

> Risque historique résolu par ce schéma : deux périodisations concurrentes (`renfoUtils` autonome vs plan course). `periodization.ts` devient l'unique horloge de phases.

---

## 4. Invariant — fonctions dormantes

Les signaux **appareil** (HRV, sommeil, stress, readiness, Body Battery) sont **modélisés** dans l'archi (interface `ReadinessSignal { source: 'manual' | 'device' }`, feature-flag `DEVICE_SIGNALS_ENABLED = false`) mais **jamais consommés** par le moteur tant qu'aucune API (Garmin ou autre) ne les fournit. Le jour où la source existe, on bascule le flag **sans réécrire** le moteur.
