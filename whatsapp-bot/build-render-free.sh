#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-node_modules/.puppeteer_cache}"

# Evita que o postinstall do Puppeteer baixe em um cache diferente.
export PUPPETEER_SKIP_DOWNLOAD=true
npm install
unset PUPPETEER_SKIP_DOWNLOAD

mkdir -p "$PUPPETEER_CACHE_DIR"
rm -rf "$PUPPETEER_CACHE_DIR/chrome"

echo "🌐 Instalando Chrome do Puppeteer no cache do artefato..."
INSTALL_OUTPUT="$(npx puppeteer browsers install chrome --format '{{path}}')"
printf '%s\n' "$INSTALL_OUTPUT"

CHROME_PATH="$(node - <<'NODE'
try {
  const fs = require('node:fs');
  const puppeteer = require('puppeteer');
  const executable = puppeteer.executablePath();
  fs.accessSync(executable, fs.constants.X_OK);
  process.stdout.write(executable);
} catch (error) {
  process.stderr.write(String(error?.stack || error));
  process.exit(1);
}
NODE
)"

echo "✅ Chrome validado no build: $CHROME_PATH"
