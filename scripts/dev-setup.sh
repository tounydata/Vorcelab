#!/usr/bin/env bash
# Prépare l'environnement (conteneur éphémère) pour faire du dev/design sur le
# projet Supabase *dev* (runnerprofil). Idempotent, rapide, jamais bloquant.
# Lancé au démarrage de session (hook SessionStart) ET par scripts/shot.sh.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0

# .env.local (gitignored) → l'app locale tape sur le projet dev, pas la prod.
# C'est une clé *anon* (publishable), protégée par RLS : safe côté client par
# design — au même titre que la clé anon prod, déjà dans src/lib/supabase.ts.
if [ ! -f .env.local ]; then
  cat > .env.local <<'EOF'
VITE_SUPABASE_URL=https://ibzwikugnsrcjvmonblm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imliendpa3VnbnNyY2p2bW9uYmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDA0ODUsImV4cCI6MjA5MzAxNjQ4NX0.QoFc0W7y-wlVy_kmdJ7ECoxS_-MmnPnEWmGjDChrjTk
EOF
  echo "dev-setup: .env.local créé (→ projet dev runnerprofil)"
fi

echo "dev-setup: ok"
