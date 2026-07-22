#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js não encontrado. Instale o Node.js 18 ou superior."
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "❌ PM2 não encontrado. Instale com: sudo npm install -g pm2"
  exit 1
fi

npm install
node runtime-fixes.mjs

# Remove o fiscal antigo, que reiniciava o processo em intervalos fixos.
pm2 delete fiscal-grupos-observador >/dev/null 2>&1 || true
pm2 delete achou-levou-timer >/dev/null 2>&1 || true
pm2 delete achou-levou-whatsapp >/dev/null 2>&1 || true

pm2 start ecosystem.config.cjs
pm2 save

# Evita que os logs do PM2 encham o disco novamente.
if ! pm2 jlist 2>/dev/null | grep -q 'pm2-logrotate'; then
  pm2 install pm2-logrotate || echo "⚠️ Não foi possível instalar pm2-logrotate agora."
fi

pm2 set pm2-logrotate:max_size 20M >/dev/null 2>&1 || true
pm2 set pm2-logrotate:retain 7 >/dev/null 2>&1 || true
pm2 set pm2-logrotate:compress true >/dev/null 2>&1 || true
pm2 set pm2-logrotate:workerInterval 30 >/dev/null 2>&1 || true
pm2 save

sleep 25

echo
echo "=== PROCESSOS ==="
pm2 list

echo
echo "=== STATUS LOCAL ==="
curl -fsS "http://127.0.0.1:${PORT:-3010}/status" || true
echo

echo
echo "✅ Configuração concluída."
echo "Para iniciar automaticamente após reiniciar a VM, execute uma vez:"
echo "sudo env PATH=\"$PATH\" pm2 startup systemd -u \"$USER\" --hp \"$HOME\""
echo "pm2 save"
