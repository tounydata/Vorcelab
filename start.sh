#!/usr/bin/env bash
set -e

TUNNEL_URL_FILE="/tmp/vorcelab-tunnel-url.txt"
EXPO_PID_FILE="/tmp/vorcelab-expo.pid"

# ─── Cloudflared ─────────────────────────────────────────────────────────────
install_cloudflared() {
  echo "⬇️  Installation de cloudflared..."
  local tmp=$(mktemp)
  if curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o "$tmp"; then
    chmod +x "$tmp"
    # Try sudo, fall back to ~/.local/bin
    if sudo install "$tmp" /usr/local/bin/cloudflared 2>/dev/null; then
      echo "✅ cloudflared installé dans /usr/local/bin"
    else
      mkdir -p "$HOME/.local/bin"
      cp "$tmp" "$HOME/.local/bin/cloudflared"
      export PATH="$HOME/.local/bin:$PATH"
      echo "✅ cloudflared installé dans ~/.local/bin"
    fi
  else
    echo "❌ Impossible de télécharger cloudflared — vérifie ta connexion"
    exit 1
  fi
  rm -f "$tmp"
}

if ! command -v cloudflared &>/dev/null; then
  install_cloudflared
else
  echo "✅ cloudflared déjà installé ($(cloudflared --version 2>&1 | head -1))"
fi

# ─── Dépendances ─────────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "📦 Installation des dépendances..."
  npm install --legacy-peer-deps
fi

# ─── Cleanup à l'arrêt ───────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "🛑 Arrêt..."
  kill "$EXPO_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
  rm -f "$TUNNEL_URL_FILE" "$EXPO_PID_FILE"
  exit 0
}
trap cleanup INT TERM

# ─── Démarrage Expo ──────────────────────────────────────────────────────────
echo ""
echo "🚀 Démarrage d'Expo (port 8081)..."
npx expo start --port 8081 --no-dev-client 2>&1 &
EXPO_PID=$!
echo "$EXPO_PID" > "$EXPO_PID_FILE"

# Attente que le serveur Metro soit prêt
echo "⏳ Attente du serveur Metro..."
for i in $(seq 1 30); do
  if curl -s http://localhost:8081/status 2>/dev/null | grep -q "packager-status:running"; then
    echo "✅ Metro prêt"
    break
  fi
  sleep 2
done

# ─── Tunnel Cloudflare ───────────────────────────────────────────────────────
echo "🌐 Ouverture du tunnel Cloudflare..."
cloudflared tunnel --url http://localhost:8081 --no-autoupdate 2>&1 | tee /tmp/cloudflared.log &
TUNNEL_PID=$!

# Extraction de l'URL du tunnel
echo "⏳ Attente de l'URL du tunnel..."
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Tunnel non démarré après 60s — vérifie /tmp/cloudflared.log"
  cleanup
fi

# Conversion https → exp pour Expo Go
EXPO_URL=$(echo "$TUNNEL_URL" | sed 's|https://|exp://|')
echo "$EXPO_URL" > "$TUNNEL_URL_FILE"

# ─── Affichage URL ───────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  VORCELAB - Serveur de dev actif"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  URL Expo Go (iPhone) :"
echo "  $EXPO_URL"
echo ""
echo "  → Ouvre Expo Go, tape 'e' ou va dans l'onglet"
echo "    'Enter URL manually' et colle l'URL ci-dessus"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Pour revoir l'URL : cat $TUNNEL_URL_FILE"
echo "  Pour arrêter      : Ctrl+C"
echo ""

# ─── Surveillance et redémarrage automatique ─────────────────────────────────
while true; do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "⚠️  Tunnel tombé — redémarrage..."
    rm -f /tmp/cloudflared.log
    cloudflared tunnel --url http://localhost:8081 --no-autoupdate 2>&1 | tee /tmp/cloudflared.log &
    TUNNEL_PID=$!

    TUNNEL_URL=""
    for i in $(seq 1 30); do
      TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -1)
      [ -n "$TUNNEL_URL" ] && break
      sleep 2
    done

    if [ -n "$TUNNEL_URL" ]; then
      EXPO_URL=$(echo "$TUNNEL_URL" | sed 's|https://|exp://|')
      echo "$EXPO_URL" > "$TUNNEL_URL_FILE"
      echo ""
      echo "✅ Nouveau tunnel — nouvelle URL :"
      echo "   $EXPO_URL"
      echo ""
    fi
  fi

  if ! kill -0 "$EXPO_PID" 2>/dev/null; then
    echo "⚠️  Expo tombé — redémarrage..."
    npx expo start --port 8081 --no-dev-client 2>&1 &
    EXPO_PID=$!
  fi

  sleep 10
done
