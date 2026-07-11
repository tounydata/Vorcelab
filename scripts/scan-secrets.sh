#!/usr/bin/env bash
# Scan de secrets déterministe (sans dépendance externe). Échoue (exit 1) si un
# VRAI secret est trouvé dans les fichiers suivis par git. Distingue les clés
# publiques (JWT Supabase role:anon, destinées au client) des secrets serveur.
#
# Usage : scripts/scan-secrets.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

found=0
report() { echo "❌ Secret potentiel — $1"; found=1; }

# Fichiers suivis, hors binaires et hors ce script.
mapfile -t files < <(git ls-files | grep -vE '\.(png|jpg|jpeg|gif|webp|zip|ico|svg|woff2?|ttf)$' | grep -v '^scripts/scan-secrets.sh$')

for f in "${files[@]}"; do
  [ -f "$f" ] || continue

  # Stripe secret/restricted keys, Anthropic, webhook signing (secrets longs
  # uniquement → évite les mentions de FORMAT dans la doc comme `sk_live_…`).
  while IFS= read -r line; do
    report "$f : clé secrète Stripe/Anthropic/webhook — ${line%%:*}"
  done < <(grep -nE '(sk|rk)_(live|test)_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|whsec_[A-Za-z0-9]{20,}' "$f" 2>/dev/null)

  # Clés privées.
  if grep -qE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----' "$f" 2>/dev/null; then
    report "$f : bloc de clé privée"
  fi

  # JWT Supabase : on décode le payload pour ne bloquer QUE les service_role
  # (les anon sont publics par conception).
  while IFS= read -r jwt; do
    payload="$(echo "$jwt" | cut -d. -f2)"
    # base64url → base64 + padding
    payload="${payload//-/+}"; payload="${payload//_//}"
    case $(( ${#payload} % 4 )) in 2) payload="${payload}==";; 3) payload="${payload}=";; esac
    role="$(printf '%s' "$payload" | base64 -d 2>/dev/null | grep -oE '"role"[[:space:]]*:[[:space:]]*"[a-z_]+"' | grep -oE '[a-z_]+"$' | tr -d '"')"
    if [ "$role" = "service_role" ]; then
      report "$f : JWT Supabase service_role (secret serveur)"
    fi
  done < <(grep -ohE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' "$f" 2>/dev/null)
done

if [ "$found" -ne 0 ]; then
  echo ""
  echo "Des secrets réels ont été détectés. Retire-les, fais-les tourner, et"
  echo "utilise des variables d'environnement / Supabase Secrets à la place."
  exit 1
fi
echo "✓ Aucun secret réel détecté (les clés anon publiques sont autorisées)."
