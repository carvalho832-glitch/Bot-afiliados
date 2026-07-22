#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

export PORT="${PORT:-3010}"
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-$HOME/.cache/puppeteer}"

mkdir -p "$PUPPETEER_CACHE_DIR"

# Reaplica correções idempotentes depois de qualquer git pull ou restauração.
node runtime-fixes.mjs

# O whatsapp-web.js depende de uma versão compatível do Chrome no cache do Puppeteer.
if ! find "$PUPPETEER_CACHE_DIR" -type f -name chrome -perm -u+x -print -quit 2>/dev/null | grep -q .; then
  AVAILABLE_KB="$(df -Pk / | awk 'NR==2 { print $4 }')"

  if [[ -n "$AVAILABLE_KB" && "$AVAILABLE_KB" -lt 900000 ]]; then
    echo "❌ Espaço insuficiente para instalar o Chrome do Puppeteer."
    echo "Disponível: $((AVAILABLE_KB / 1024)) MB. Libere pelo menos 900 MB e tente novamente."
    exit 1
  fi

  echo "🌐 Chrome do Puppeteer não encontrado. Instalando automaticamente..."
  npx puppeteer browsers install chrome
fi

exec node server.js
