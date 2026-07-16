# Exemple (anonymisé) de rapport du banc réel

Ce fichier est un **exemple de FORMAT** avec des chiffres **fictifs**. Le vrai rapport
(`artifacts/engine-backtest/report.md`) est généré depuis les données réelles et n'est
**jamais committé** (dossier `artifacts/engine-backtest/` gitignoré) car il porte des
résultats de courses personnels.

Aucune coordonnée GPS, aucun nom, aucun UUID brut n'apparaît : les athlètes sont `A1`,
`A2`… et les courses `R01`, `R02`… (pseudonymes déterministes, non réversibles en nom).

Reproduire le vrai rapport :

```bash
# Chemin officiel (une commande) — lecture seule, service role key via l'env :
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run backtest:real

# ou depuis une fixture locale déterministe (gitignorée) :
npm run backtest:real -- --fixture ./data.backtest-fixture.json
```

---

# Banc de validation réel du moteur Vorcelab

> Généré le 2026-07-16T00:00:00.000Z · moteur `2026.07-1` · profil `atDate-2026.07-1`

## Périmètre

- Courses candidates : **29**
- Confirmées : **18**
- Exclues : **7**
- Réellement testées : **11**

### Validation des candidats

- Confirmées : **18** · rejetées : **7** · en attente : **4**
- Raisons de rejet : `name_not_a_race` ×2, `distance_too_short` ×1
- Raisons d'attente : `time_to_confirm` ×2, `large_stops` ×1

## Métriques globales

| Métrique | Valeur |
|---|--:|
| MAE (erreur absolue moyenne) | 6:12 (372 s) |
| MAPE | 8.4 % |
| Biais moyen signé (prévu − réel) | +2:05 |
| Erreur médiane | 5:01 |
| P75 | 8:30 |
| P90 | 12:40 |
| Couverture de l'intervalle | 63.6 % |
| Projections optimistes (trop rapides) | 45 % |
| Projections pessimistes (trop lentes) | 55 % |

## Ventilations par catégorie

### Route vs Trail

| Catégorie | n | MAE | MAPE | Biais | Médiane | P75 | P90 | Couv. | Optim. | Pessim. |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| road | 2 | 3:10 | 4.1 % | +1:00 | 3:10 | 4:00 | 4:00 | 100.0 % | 50 % | 50 % |
| trail | 9 | 6:55 | 9.4 % | +2:20 | 6:00 | 9:00 | 12:40 | 55.6 % | 44 % | 56 % |

## Détail par course

| Course | Athlète | Date | Sport | Dist (km) | D+ (m) | Réel | Prévu | Erreur | % | Interv. | Conf. | Hist. | Fallback |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:--:|:--:|--:|:--:|
| R01 | A1 | 2026-03-29 | road | 21.1 | 66 | 1h45:02 | 1h47:10 | +2:08 | +2.0 % | ✓ | medium | 26 | non |
| R05 | A2 | 2026-05-14 | trail | 18.1 | 569 | 1h54:52 | 1h49:40 | -5:12 | -4.5 % | ✓ | medium | 36 | non |

_Les chiffres ci-dessus sont fictifs — seul le vrai rapport reflète les données réelles._
