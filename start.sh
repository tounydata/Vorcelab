#!/usr/bin/env bash
set -e

# Load all vars from .env into the current shell so NGROK_AUTHTOKEN is visible to ngrok
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "$NGROK_AUTHTOKEN" ]; then
  echo "❌ NGROK_AUTHTOKEN is missing."
  echo "   1. Crée un compte gratuit sur https://ngrok.com"
  echo "   2. Copie ton authtoken depuis https://dashboard.ngrok.com/get-started/your-authtoken"
  echo "   3. Ajoute dans .env :  NGROK_AUTHTOKEN=<ton_token>"
  exit 1
fi

echo "📦 Installation des dépendances..."
rm -rf node_modules package-lock.json
npm install
echo ""
echo "🚀 Démarrage d'Expo en mode tunnel..."
echo "   → Ouvre Expo Go sur ton iPhone et scanne le QR code"
echo ""
npx expo start --tunnel
