#!/usr/bin/env python3
"""
ingest-kaggle-media.py
Ingestion du dataset Kaggle CC0 "fitness-exercises-with-animations" dans Vorcelab.

Usage:
  1. Télécharger le dataset Kaggle :
       kaggle datasets download -d <slug> --unzip -p ./kaggle-raw/
  2. Lancer ce script :
       python3 scripts/ingest-kaggle-media.py --source ./kaggle-raw/
  3. Optionnel — uploader directement dans Supabase Storage :
       SUPABASE_SERVICE_ROLE_KEY=<key> python3 scripts/ingest-kaggle-media.py --source ./kaggle-raw/ --upload

Options:
  --source      Dossier contenant le dataset Kaggle décompressé
  --upload      Uploader les GIFs dans Supabase Storage (bucket exercise-media)
  --dry-run     Affiche les matches sans copier/uploader les fichiers
  --min-conf    Confidence minimum pour traiter (high|medium|low, défaut: medium)
"""

import argparse
import json
import os
import sys
from difflib import SequenceMatcher
from pathlib import Path

SUPABASE_PROJECT_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
SUPABASE_BUCKET = 'exercise-media'

# Mapping Vorcelab → nom Kaggle attendu (copie de exercise-media.js)
KAGGLE_NAMES = {
    "squat_lourd":              "Barbell Squat",
    "rdl":                      "Romanian Deadlift",
    "bulgare":                  "Bulgarian Split Squat",
    "mollets_lourds":           "Standing Calf Raise",
    "hip_thrust":               "Hip Thrust",
    "lunge_marcheur":           "Walking Lunge",
    "pogo_jumps":               "Pogo Jumps",
    "bondissements":            "Broad Jump",
    "drop_jumps":               "Depth Jump",
    "skips":                    "High Knees",
    "lateral_bound":            "Lateral Bound",
    "box_jump":                 "Box Jump",
    "step_down":                "Step Down",
    "nordic":                   "Nordic Curl",
    "mollet_excentrique":       "Eccentric Calf Raise",
    "single_leg_rdl":           "Single Leg Romanian Deadlift",
    "tibialis_raise":           "Tibialis Raise",
    "reverse_nordic":           "Reverse Nordic Curl",
    "single_leg_glute_bridge":  "Single Leg Glute Bridge",
    "wall_sit":                 "Wall Sit",
    "pallof_press":             "Pallof Press",
    "side_plank_hipdrop":       "Side Plank Hip Drop",
    "dead_bug":                 "Dead Bug",
    "bird_dog":                 "Bird Dog",
    "suitcase_carry":           "Farmer's Walk",
    "copenhagen_plank":         "Copenhagen Plank",
    "core_rotation":            "Russian Twist",
    "tractions_or_row":         "Pull-Up",
    "pompes":                   "Push-Up",
    "face_pull":                "Face Pull",
    "ytw_prone":                "YTW Raise",
    "hip_9090":                 "90/90 Hip Rotation",
    "pigeon_actif":             "Pigeon Pose",
    "knee_to_wall":             "Knee to Wall",
    "open_book":                "Open Book",
    "monster_walk":             "Monster Walk",
    "hip_abduction":            "Hip Abduction",
    "cossack_squat":            "Cossack Squat",
}

CONF_THRESHOLD = {"high": 0.85, "medium": 0.70, "low": 0.0}


def similarity(a, b):
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def find_best_match(target_name, exercises):
    best_score, best_ex = 0, None
    for ex in exercises:
        s = similarity(target_name, ex.get("name", ""))
        if s > best_score:
            best_score, best_ex = s, ex
    return best_ex, best_score


def find_gif_file(ex_id, source_dir):
    """Look for GIF by exercise ID or name in various dataset layouts."""
    source = Path(source_dir)
    candidates = [
        source / f"{ex_id}.gif",
        source / "images" / f"{ex_id}.gif",
        source / "gifs" / f"{ex_id}.gif",
        source / ex_id / "0.gif",
        source / ex_id / "demo.gif",
    ]
    for c in candidates:
        if c.exists():
            return c
    # Fallback: glob any gif matching start of id
    for gif in source.rglob("*.gif"):
        if ex_id.lower()[:6] in gif.stem.lower():
            return gif
    return None


def upload_to_supabase(gif_path, exo_id, service_role_key, dry_run=False):
    """Upload a GIF to Supabase Storage bucket exercise-media/{exo_id}/demo.gif."""
    try:
        import urllib.request
        url = f"{SUPABASE_PROJECT_URL}/storage/v1/object/{SUPABASE_BUCKET}/{exo_id}/demo.gif"
        with open(gif_path, 'rb') as f:
            data = f.read()
        req = urllib.request.Request(
            url, data=data, method='POST',
            headers={
                'Authorization': f'Bearer {service_role_key}',
                'Content-Type': 'image/gif',
                'x-upsert': 'true',
            },
        )
        if dry_run:
            print(f"  DRY-UPLOAD {exo_id:30s} → {url}")
            return True
        with urllib.request.urlopen(req) as resp:
            ok = resp.status in (200, 201)
            if ok:
                print(f"  ↑ {exo_id:30s} → Supabase Storage (HTTP {resp.status})")
            else:
                print(f"  ✗ {exo_id:30s} HTTP {resp.status}", file=sys.stderr)
            return ok
    except Exception as e:
        print(f"  ✗ {exo_id:30s} upload error: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Ingest Kaggle CC0 exercise GIFs into Vorcelab")
    parser.add_argument("--source", default="./kaggle-raw/", help="Kaggle dataset unzip dir")
    parser.add_argument("--meta", default=None, help="exercises.json / metadata path")
    parser.add_argument("--upload", action="store_true", help="Upload GIFs to Supabase Storage")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--min-conf", default="medium", choices=["high", "medium", "low"])
    args = parser.parse_args()

    source_dir = Path(args.source)
    if not source_dir.exists():
        print(f"ERROR: source dir not found: {source_dir}", file=sys.stderr)
        print("  → Run: kaggle datasets download <slug> --unzip -p ./kaggle-raw/")
        sys.exit(1)

    service_role_key = None
    if args.upload:
        service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not service_role_key:
            print("ERROR: SUPABASE_SERVICE_ROLE_KEY env var required for --upload", file=sys.stderr)
            sys.exit(1)

    # Load metadata JSON if provided, otherwise discover GIFs directly
    exercises = []
    meta_path = args.meta or next(
        (str(p) for ext in ["*.json", "*.csv"] for p in source_dir.rglob(ext)), None
    )
    if meta_path and Path(meta_path).exists():
        with open(meta_path) as f:
            raw = json.load(f) if meta_path.endswith(".json") else []
        exercises = raw if isinstance(raw, list) else raw.get("exercises", [])
        print(f"Loaded {len(exercises)} exercises from metadata: {meta_path}")
    else:
        for gif in source_dir.rglob("*.gif"):
            exercises.append({"id": gif.stem, "name": gif.stem.replace("_", " ").replace("-", " ")})
        print(f"No metadata found — discovered {len(exercises)} GIFs by filename")

    min_score = CONF_THRESHOLD[args.min_conf]
    report = {"matched": [], "low_conf": [], "no_match": []}

    for exo_id, target_name in KAGGLE_NAMES.items():
        best_ex, score = find_best_match(target_name, exercises)

        if score < min_score:
            report["no_match"].append({
                "exo_id": exo_id, "target": target_name, "score": round(score, 2)
            })
            continue

        ex_id = best_ex.get("id", best_ex.get("name", ""))
        gif_path = find_gif_file(ex_id, source_dir)
        entry = {
            "exo_id": exo_id, "target": target_name,
            "matched": best_ex.get("name", ex_id), "score": round(score, 2),
            "gif": str(gif_path) if gif_path else None,
        }

        if score < 0.75:
            report["low_conf"].append(entry)
        else:
            report["matched"].append(entry)

        if gif_path:
            if args.upload:
                upload_to_supabase(gif_path, exo_id, service_role_key, dry_run=args.dry_run)
            elif not args.dry_run:
                print(f"  ✓ {exo_id:30s} ← {gif_path.name} (score={score:.2f})")
            else:
                print(f"  DRY {exo_id:30s} ← {gif_path.name} (score={score:.2f})")
        else:
            print(f"  ⚠ {exo_id:30s}   match={best_ex.get('name','?')} but no GIF file found")

    print(f"\n{'='*60}")
    print(f"MATCHED (score ≥ {min_score}): {len(report['matched'])}")
    print(f"LOW CONFIDENCE:                 {len(report['low_conf'])}")
    print(f"NO MATCH:                       {len(report['no_match'])}")
    if report["no_match"]:
        print("\nNo match:")
        for e in report["no_match"]:
            print(f"  {e['exo_id']:30s} → '{e['target']}' (best score={e['score']})")

    report_path = Path("./scripts/ingest-report.json")
    report_path.parent.mkdir(exist_ok=True)
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nReport saved to {report_path}")


if __name__ == "__main__":
    main()
