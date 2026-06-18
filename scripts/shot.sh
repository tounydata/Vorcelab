#!/usr/bin/env bash
# Capture autonome d'un écran *connecté*, du lancement de Vite au PNG.
# À lancer en UNE commande (les process en arrière-plan ne survivent pas entre
# les tours d'agent) :
#
#   ./scripts/shot.sh                       # dashboard → /tmp/shot.png
#   ./scripts/shot.sh '/#/activities' acts.png
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

ROUTE="${1:-/}"
OUT="${2:-/tmp/shot.png}"

# Pré-requis : deps + .env.local (dev).
[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1
bash scripts/dev-setup.sh >/dev/null

# Vite déjà up ? Sinon on le démarre le temps de la capture, puis on l'arrête.
STARTED=0
if ! curl -sf -o /dev/null http://127.0.0.1:5173/ 2>/dev/null; then
  nohup npm run dev >/tmp/vite.log 2>&1 &
  VPID=$!; STARTED=1
  for _ in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:5173/ 2>/dev/null && break; sleep 0.5; done
fi

node scripts/shot.mjs "$ROUTE" "$OUT"
RC=$?

# Si on a démarré Vite, on l'arrête (npm spawn un enfant : tuer le groupe).
if [ "$STARTED" = 1 ]; then
  kill "${VPID:-0}" 2>/dev/null
  pkill -P "${VPID:-0}" 2>/dev/null   # process enfant (vite/esbuild)
  fuser -k 5173/tcp 2>/dev/null       # filet de sécurité sur le port
fi
exit $RC
