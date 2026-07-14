#!/usr/bin/env bash
# Exécute les tests SQL de sécurité RLS (profiles / admin) sur un PostgreSQL local
# éphémère. Aucune connexion à la prod. Sortie non nulle si un test échoue.
#
# Usage : scripts/test-rls.sh
# Requiert : un serveur PostgreSQL local accessible (PGHOST/PGUSER/PGPORT ou peer).
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 --no-psqlrc)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TESTS=(
  supabase/tests/rls_profiles_admin.sql
  supabase/tests/entitlements_stripe.sql
  supabase/tests/rgpd_deletion.sql
  supabase/tests/renfo_dedup.sql
)

CURRENT_DB=""
cleanup() { [ -n "$CURRENT_DB" ] && dropdb --if-exists "$CURRENT_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

for test_file in "${TESTS[@]}"; do
  CURRENT_DB="vorcelab_test_$$_$RANDOM"
  echo "→ [$test_file] base $CURRENT_DB"
  createdb "$CURRENT_DB"
  "${PSQL[@]}" -d "$CURRENT_DB" -f "$test_file"
  dropdb --if-exists "$CURRENT_DB" >/dev/null 2>&1 || true
  CURRENT_DB=""
  echo "✓ $test_file OK"
done

echo "✓ Tous les tests SQL de sécurité OK"
