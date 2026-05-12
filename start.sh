#!/usr/bin/env bash
set -e

# Install cloudflared if missing (no account or token needed)
if ! command -v cloudflared &>/dev/null; then
  echo "⬇️  Installation de cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
  sudo install /tmp/cloudflared /usr/local/bin/cloudflared
  echo "✅ cloudflared installé"
fi

echo "📦 Installation des dépendances..."
npm install
echo ""
echo "🚀 Démarrage d'Expo en mode tunnel (Cloudflare)..."
echo "   → Ouvre Expo Go sur ton iPhone et scanne le QR code"
echo ""
npx expo start --tunnel
