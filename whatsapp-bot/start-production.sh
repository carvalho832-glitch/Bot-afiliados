#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

export PORT="${PORT:-3010}"
export TZ="${TZ:-America/Sao_Paulo}"
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-node_modules/.puppeteer_cache}"

mkdir -p "$PUPPETEER_CACHE_DIR"

node --check server.js
node --check bot-store.mjs
node --check bot-engine.mjs
node --check frame-recovery.mjs
node --check shopee-tracking.mjs
node --check phase22-control.js
node --check apply-phase22-panel.cjs
node apply-phase22-panel.cjs

resolve_chrome() {
  node - <<'NODE'
try {
  const fs = require('node:fs');
  const puppeteer = require('puppeteer');
  const executable = puppeteer.executablePath();
  fs.accessSync(executable, fs.constants.X_OK);
  process.stdout.write(executable);
} catch {
  process.exit(1);
}
NODE
}

CHROME_PATH="$(resolve_chrome 2>/dev/null || true)"

if [[ -z "$CHROME_PATH" ]]; then
  AVAILABLE_KB="$(df -Pk / | awk 'NR==2 { print $4 }')"
  if [[ -n "$AVAILABLE_KB" && "$AVAILABLE_KB" -lt 900000 ]]; then
    echo "❌ Espaço insuficiente para instalar o Chrome do Puppeteer."
    echo "Disponível: $((AVAILABLE_KB / 1024)) MB. Libere pelo menos 900 MB."
    exit 1
  fi

  echo "🧹 Chrome ausente ou cache incompleto; limpando somente o cache do Chrome..."
  rm -rf "$PUPPETEER_CACHE_DIR/chrome"

  echo "🌐 Instalando o Chrome compatível com o Puppeteer..."
  npx puppeteer browsers install chrome --format '{{path}}'

  CHROME_PATH="$(resolve_chrome 2>/dev/null || true)"
  if [[ -z "$CHROME_PATH" ]]; then
    echo "❌ A instalação terminou sem um Chrome utilizável no cache configurado: $PUPPETEER_CACHE_DIR"
    echo "[DIAGNÓSTICO] Arquivos chrome encontrados:"
    find "$PUPPETEER_CACHE_DIR" -maxdepth 6 -type f -name chrome -print 2>/dev/null || true
    exit 1
  fi
fi

export PUPPETEER_EXECUTABLE_PATH="$CHROME_PATH"
echo "✅ Chrome pronto: $PUPPETEER_EXECUTABLE_PATH"

exec node server.js
