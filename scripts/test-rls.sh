#!/usr/bin/env bash
# Exécute les tests SQL de sécurité RLS (profiles / admin) sur un PostgreSQL local
# éphémère. Aucune connexion à la prod. Sortie non nulle si un test échoue.
#
# Usage : scripts/test-rls.sh
# Requiert : un serveur PostgreSQL local accessible (PGHOST/PGUSER/PGPORT ou peer).
set -euo pipefail

DB="vorcelab_rls_test_$$"
PSQL=(psql -v ON_ERROR_STOP=1 --no-psqlrc)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cleanup() { dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ Création de la base de test $DB"
createdb "$DB"

echo "→ Exécution de supabase/tests/rls_profiles_admin.sql"
"${PSQL[@]}" -d "$DB" -f supabase/tests/rls_profiles_admin.sql

echo "✓ Tests RLS profiles/admin OK"
