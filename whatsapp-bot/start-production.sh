#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

export PORT="${PORT:-3010}"
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-$HOME/.cache/puppeteer}"

mkdir -p "$PUPPETEER_CACHE_DIR"

# Reaplica correções idempotentes depois de qualquer git pull ou restauração.
node runtime-fixes.mjs

# Descobre a versão exata do Chrome exigida pelo puppeteer-core instalado.
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

# Instala a versão compatível quando ela não existir, mesmo que haja uma versão antiga no cache.
if [[ "$CHROME_READY" != true ]]; then
  AVAILABLE_KB="$(df -Pk / | awk 'NR==2 { print $4 }')"

  if [[ -n "$AVAILABLE_KB" && "$AVAILABLE_KB" -lt 900000 ]]; then
    echo "❌ Espaço insuficiente para instalar o Chrome do Puppeteer."
    echo "Disponível: $((AVAILABLE_KB / 1024)) MB. Libere pelo menos 900 MB e tente novamente."
    exit 1
  fi

  echo "🌐 Chrome compatível não encontrado. Instalando automaticamente..."
  npx puppeteer browsers install chrome
fi

exec node server.js
