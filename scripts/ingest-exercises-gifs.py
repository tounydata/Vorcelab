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
# 30 exercices matchés / 38 ; 8 sans équivalent dans ce dataset (None)
# Absents : tibialis_raise, pogo_jumps, pigeon_actif, knee_to_wall,
#           bird_dog, copenhagen_plank, open_book, ytw_prone
MAPPING = {
    # ── FORCE LOURDE ──────────────────────────────────────────────────────
    "squat_lourd":              "0043",   # barbell full squat
    "rdl":                      "0085",   # barbell romanian deadlift
    "bulgare":                  "0098",   # barbell side split squat
    "mollets_lourds":           "1375",   # cable standing calf raise
    "hip_thrust":               "3236",   # resistance band hip thrusts on knees
    "lunge_marcheur":           "1460",   # walking lunge ✓

    # ── PLIOMÉTRIE ────────────────────────────────────────────────────────
    "pogo_jumps":               None,     # absent du dataset
    "bondissements":            "1472",   # forward jump
    "drop_jumps":               "3543",   # bodyweight drop jump squat
    "skips":                    "3636",   # high knee against wall
    "lateral_bound":            "3361",   # skater hops
    "box_jump":                 "1374",   # box jump down with one leg stabilization

    # ── EXCENTRIQUE ───────────────────────────────────────────────────────
    "step_down":                "3672",   # back and forth step
    "nordic":                   "0496",   # inverse leg curl (bench support)
    "mollet_excentrique":       "0727",   # single leg calf raise (on a dumbbell)
    "single_leg_rdl":           "1757",   # dumbbell single leg deadlift
    "tibialis_raise":           None,     # absent du dataset
    "reverse_nordic":           "1489",   # sissy squat (même travail excentrique quad)
    "single_leg_glute_bridge":  "3561",   # glute bridge march
    "wall_sit":                 "0624",   # march sit (wall)

    # ── TRONC ─────────────────────────────────────────────────────────────
    "pallof_press":             "0979",   # band horizontal pallof press
    "side_plank_hipdrop":       "1775",   # side plank hip adduction
    "dead_bug":                 "0276",   # dead bug ✓
    "bird_dog":                 None,     # absent du dataset
    "suitcase_carry":           "2133",   # farmers walk ✓
    "copenhagen_plank":         None,     # absent du dataset
    "core_rotation":            "0687",   # russian twist ✓

    # ── HAUT DU CORPS ─────────────────────────────────────────────────────
    "tractions_or_row":         "0652",   # pull-up ✓
    "pompes":                   "0662",   # push-up ✓
    "face_pull":                "0203",   # cable rear delt row (with rope)
    "ytw_prone":                None,     # absent du dataset

    # ── MOBILITÉ ──────────────────────────────────────────────────────────
    "hip_9090":                 "0996",   # band seated hip internal rotation
    "pigeon_actif":             None,     # absent du dataset
    "knee_to_wall":             None,     # absent du dataset
    "open_book":                None,     # absent du dataset
    "monster_walk":             "0628",   # monster walk ✓
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
