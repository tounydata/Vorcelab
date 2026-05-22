# Tests E2E — Vorcelab

Suite Playwright couvrant les parcours critiques du legacy et de l'app React.

## Prérequis

1. **Installer les browsers Playwright** (une seule fois) :
   ```bash
   npx playwright install chromium
   ```

2. **Avoir une build React valide** (pour les tests `react`) :
   ```bash
   npm run build
   ```
   Le serveur legacy utilise Node directement (pas de dépendance externe).

## Lancer les tests

### Tout lancer (build inclus)
```bash
npm run e2e:full
```

### Tests React seulement (requiert `npm run build` au préalable)
```bash
npm run e2e:react
```

### Tests Legacy seulement
```bash
npm run e2e:legacy
```

### Tous les tests (sans rebuild)
```bash
npm run e2e
```

### Interface graphique Playwright
```bash
npm run e2e:ui
```

### Rapport HTML après une run
```bash
npx playwright show-report
```

## Architecture

```
e2e/
  legacy-server.mjs     Serveur statique Node pour les fichiers legacy
  react/
    smoke.spec.ts       Test B  — React charge, LoginPage visible
    routing.spec.ts     Test C,D — AuthGuard sur toutes les routes
  legacy/
    smoke.spec.ts       Test A  — Legacy charge, form de connexion visible
    assets.spec.ts      Test E  — Aucun fichier local en 404
```

## Serveurs de test

| Projet  | Port | Commande                        | Sert                    |
|---------|------|---------------------------------|-------------------------|
| react   | 4173 | `npm run preview`               | `dist/` (React buildé)  |
| legacy  | 4174 | `node e2e/legacy-server.mjs`    | Racine du repo          |

## Tests couverts

| ID | Description                                              | Fichier                     |
|----|----------------------------------------------------------|-----------------------------|
| A  | Legacy smoke — page charge, VORCELAB visible, form auth  | `legacy/smoke.spec.ts`      |
| B  | React smoke — titre, LoginPage, champs visibles          | `react/smoke.spec.ts`       |
| C  | Auth guard — toutes les routes protégées → LoginPage     | `react/routing.spec.ts`     |
| D  | Navigation React — pas de crash sur routes inconnues     | `react/routing.spec.ts`     |
| E  | Legacy assets — pas de 404 sur fichiers JS/CSS locaux    | `legacy/assets.spec.ts`     |

## Tests volontairement non couverts

- **Login complet React** : magic link uniquement → impossible d'automatiser sans accès à la boîte mail.
- **Login Legacy avec credentials** : possible avec `VORCELAB_TEST_EMAIL` / `VORCELAB_TEST_PASSWORD`, non implémenté pour éviter toute modification Supabase en CI.
- **Dashboard / Activités / Stratégie** : nécessitent une session authentifiée. À ajouter avec `storageState` une fois l'auth automatisable.
- **Strava OAuth** : exclut tout appel OAuth réel.
- **Tests destructifs** : suppression de compte, de course, de données — hors périmètre.

## Limites actuelles

- Les tests legacy chargent les CDN (Supabase, Chart.js, jszip, Leaflet) : **internet requis**.
- Le formulaire de connexion legacy (`#loginForm`) peut prendre jusqu'à 12 s à apparaître (imports ES module + init Supabase).
- La React `LoginPage` est testée sans session réelle : Supabase anon key est live mais aucun appel authentifié.
- `pageerror` capture les erreurs JS non gérées ; les `console.error` de Supabase (ex : erreurs réseau transitoires) ne font pas échouer les tests.

## Prochaines étapes E2E

1. **Auth par storageState** : capturer une session Supabase via variables d'environnement, la stocker dans `playwright/.auth/user.json`, l'injecter dans les tests qui nécessitent un utilisateur connecté.
2. **Tests Dashboard** : vérifier que les widgets chargent sans erreur.
3. **Tests Stratégie** : uploader un GPX de test, vérifier que l'analyse tourne.
4. **Tests Renfo** : vérifier l'onboarding et l'affichage du programme.
5. **CI légère** : GitHub Actions déclenché sur PR avec `npm run e2e:full` (React seulement, sans legacy CDN).
