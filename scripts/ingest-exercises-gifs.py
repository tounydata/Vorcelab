#!/usr/bin/env python3
"""
ingest-exercises-gifs.py
Upload des GIFs depuis omercotkd/exercises-gifs vers Supabase Storage.

Pas besoin de compte Kaggle. Les GIFs sont téléchargés directement depuis GitHub.

Usage:
  SUPABASE_SERVICE_ROLE_KEY=<key> python3 scripts/ingest-exercises-gifs.py --upload
  python3 scripts/ingest-exercises-gifs.py --dry-run   # voir sans uploader
"""

import os
import sys
import json
import time
import urllib.request
from pathlib import Path

SUPABASE_PROJECT_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
SUPABASE_BUCKET = 'exercise-media'
GITHUB_RAW = 'https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets'

# ── Mapping Vorcelab ID → exercises-gifs ID ────────────────────────────────
# Source : github.com/omercotkd/exercises-gifs (open source)
# 34 exercices matchés / 38 ; 4 placeholder (pas de bon équivalent)
# Placeholder : tibialis_raise, pogo_jumps, bird_dog, ytw_prone
#
# Confidence des matchs approximatifs :
#   high   : copenhagen_plank → side plank hip adduction
#   medium : reverse_nordic → sissy squat
#   medium : wall_sit → march sit (wall)
#   medium : pigeon_actif → seated piriformis stretch
#   medium : knee_to_wall → calf push stretch with hands against wall
#   medium : open_book → spine twist
MAPPING = {
    # ── FORCE LOURDE ──────────────────────────────────────────────────────
    "squat_lourd":              "0043",   # barbell full squat
    "rdl":                      None,     # retiré — GIF incorrect (soulevé de terre standard)
    "bulgare":                  None,     # retiré — GIF incorrect
    "mollets_lourds":           "1375",   # cable standing calf raise
    "hip_thrust":               None,     # retiré — GIF incorrect (résistance band on knees)
    "lunge_marcheur":           "1460",   # walking lunge ✓

    # ── PLIOMÉTRIE ────────────────────────────────────────────────────────
    "pogo_jumps":               None,     # placeholder — pas de vrai pogo dans le dataset
    "bondissements":            "1472",   # forward jump
    "drop_jumps":               "3543",   # bodyweight drop jump squat
    "skips":                    "3636",   # high knee against wall
    "lateral_bound":            "3361",   # skater hops
    "box_jump":                 None,     # retiré — GIF incorrect (single leg stabilization)

    # ── EXCENTRIQUE ───────────────────────────────────────────────────────
    "step_down":                None,     # retiré — GIF incorrect (back and forth step)
    "nordic":                   "0496",   # inverse leg curl (bench support)
    "mollet_excentrique":       "0727",   # single leg calf raise (on a dumbbell)
    "single_leg_rdl":           "1757",   # dumbbell single leg deadlift
    "tibialis_raise":           None,     # placeholder — pas de tibialis raise dans le dataset
    "reverse_nordic":           None,     # retiré — GIF incorrect (sissy squat ≠ reverse nordic)
    "single_leg_glute_bridge":  "3561",   # glute bridge march
    "wall_sit":                 "0624",   # [medium] march sit (wall)

    # ── TRONC ─────────────────────────────────────────────────────────────
    "pallof_press":             "0979",   # band horizontal pallof press
    "side_plank_hipdrop":       None,     # retiré — GIF incorrect
    "dead_bug":                 "0276",   # dead bug ✓
    "bird_dog":                 None,     # placeholder — pas de vrai bird dog dans le dataset
    "suitcase_carry":           None,     # retiré — GIF incorrect
    "copenhagen_plank":         "1775",   # [high] side plank hip adduction
    "core_rotation":            None,     # retiré — GIF incorrect (russian twist ≠ rotation de tronc)

    # ── HAUT DU CORPS ─────────────────────────────────────────────────────
    "tractions_or_row":         "0652",   # pull-up ✓
    "pompes":                   "0662",   # push-up ✓
    "face_pull":                None,     # retiré — GIF incorrect
    "ytw_prone":                None,     # placeholder — raises dispo ne montrent pas le YTW complet

    # ── MOBILITÉ ──────────────────────────────────────────────────────────
    "hip_9090":                 None,     # retiré — GIF incorrect
    "pigeon_actif":             "2567",   # [medium] seated piriformis stretch
    "knee_to_wall":             None,     # retiré — GIF incorrect
    "open_book":                None,     # retiré — GIF incorrect
    "monster_walk":             None,     # retiré — GIF incorrect
    "hip_abduction":            "0710",   # side hip abduction ✓
    "cossack_squat":            "3643",   # weighted cossack squats ✓
}


def download_gif(gif_id):
    url = f"{GITHUB_RAW}/{gif_id}.gif"
    req = urllib.request.Request(url, headers={"User-Agent": "Vorcelab-ingest/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def upload_gif(data, exo_id, service_role_key):
    url = f"{SUPABASE_PROJECT_URL}/storage/v1/object/{SUPABASE_BUCKET}/{exo_id}/demo.gif"
    req = urllib.request.Request(
        url, data=data, method='POST',
        headers={
            'Authorization': f'Bearer {service_role_key}',
            'Content-Type': 'image/gif',
            'x-upsert': 'true',
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Upload exercise GIFs to Supabase Storage")
    parser.add_argument("--upload", action="store_true", help="Upload vers Supabase Storage")
    parser.add_argument("--dry-run", action="store_true", help="Affiche sans télécharger/uploader")
    args = parser.parse_args()

    service_role_key = None
    if args.upload and not args.dry_run:
        service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not service_role_key:
            print("ERREUR : SUPABASE_SERVICE_ROLE_KEY manquant", file=sys.stderr)
            print("  → export SUPABASE_SERVICE_ROLE_KEY=ta_clé_ici")
            sys.exit(1)

    mapped = {k: v for k, v in MAPPING.items() if v is not None}
    missing = [k for k, v in MAPPING.items() if v is None]

    print(f"Exercices mappés   : {len(mapped)}/38")
    print(f"Exercices absents  : {len(missing)} ({', '.join(missing)})")
    print()

    ok, errors = [], []
    for exo_id, gif_id in mapped.items():
        gif_url = f"{GITHUB_RAW}/{gif_id}.gif"
        if args.dry_run:
            print(f"  DRY  {exo_id:30s} ← [{gif_id}] {gif_url}")
            continue

        try:
            data = download_gif(gif_id)
            if args.upload:
                status = upload_gif(data, exo_id, service_role_key)
                print(f"  ↑ {exo_id:30s} [{gif_id}] → HTTP {status}")
            else:
                # Sauvegarde locale (mode sans --upload)
                out = Path(f"./assets/exercises/{exo_id}/demo.gif")
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(data)
                print(f"  ✓ {exo_id:30s} ← [{gif_id}] ({len(data)//1024} KB)")
            ok.append(exo_id)
            time.sleep(0.1)
        except Exception as e:
            print(f"  ✗ {exo_id:30s} ERREUR : {e}", file=sys.stderr)
            errors.append(exo_id)

    if not args.dry_run:
        print(f"\n{'='*55}")
        print(f"Succès  : {len(ok)}")
        print(f"Erreurs : {len(errors)}" + (f" ({', '.join(errors)})" if errors else ""))
        print(f"Absents : {len(missing)}")

        report_path = Path("./scripts/ingest-report.json")
        report_path.parent.mkdir(exist_ok=True)
        with open(report_path, "w") as f:
            json.dump({"ok": ok, "errors": errors, "missing": missing}, f, indent=2)
        print(f"\nRapport : {report_path}")


if __name__ == "__main__":
    main()
