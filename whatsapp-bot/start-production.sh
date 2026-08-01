#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

export PORT="${PORT:-3010}"
export TZ="${TZ:-America/Sao_Paulo}"
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-$HOME/.cache/puppeteer}"

mkdir -p "$PUPPETEER_CACHE_DIR"

node --check server.js
node --check bot-store.mjs
node --check bot-engine.mjs
node --check shopee-tracking.mjs

EXPECTED_CHROME="$(node - <<'NODE'
try {
  const revisions = require('./node_modules/puppeteer-core/lib/cjs/puppeteer/revisions.js');
  process.stdout.write(String(revisions.PUPPETEER_REVISIONS?.chrome || ''));
} catch {
  process.stdout.write('');
}
NODE
)"

CHROME_READY=false
if [[ -n "$EXPECTED_CHROME" ]]; then
  if find "$PUPPETEER_CACHE_DIR" -type f -name chrome -path "*${EXPECTED_CHROME}*" -perm -u+x -print -quit 2>/dev/null | grep -q .; then
    CHROME_READY=true
  fi
elif find "$PUPPETEER_CACHE_DIR" -type f -name chrome -perm -u+x -print -quit 2>/dev/null | grep -q .; then
  CHROME_READY=true
fi

if [[ "$CHROME_READY" != true ]]; then
  AVAILABLE_KB="$(df -Pk / | awk 'NR==2 { print $4 }')"
  if [[ -n "$AVAILABLE_KB" && "$AVAILABLE_KB" -lt 900000 ]]; then
    echo "❌ Espaço insuficiente para instalar o Chrome do Puppeteer."
    echo "Disponível: $((AVAILABLE_KB / 1024)) MB. Libere pelo menos 900 MB."
    exit 1
  fi
  echo "🌐 Instalando o Chrome compatível com o Puppeteer..."
  npx puppeteer browsers install chrome
fi

exec node server.js
