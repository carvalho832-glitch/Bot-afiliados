#!/usr/bin/env bash
set -u

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"
BASE_URL="http://127.0.0.1:${PORT:-3010}"

echo "========== BOT ACHOU LEVOU: PENTE-FINO =========="
echo "Hora São Paulo: $(TZ=America/Sao_Paulo date '+%d/%m/%Y %H:%M:%S %Z')"
echo

echo "=== SINTAXE ==="
node --check server.js && echo "server.js: OK"
node --check bot-store.mjs && echo "bot-store.mjs: OK"
node --check bot-engine.mjs && echo "bot-engine.mjs: OK"
echo

echo "=== PM2 ==="
pm2 list || true
echo

echo "=== PORTA 3010 ==="
ss -ltnp 2>/dev/null | grep ':3010' || echo "PORTA 3010 FECHADA"
echo

echo "=== STATUS ==="
curl -fsS "$BASE_URL/status" | python3 -m json.tool || echo "STATUS INDISPONÍVEL"
echo

echo "=== DIAGNÓSTICO ==="
curl -fsS "$BASE_URL/diagnostics" | python3 -m json.tool || echo "DIAGNÓSTICO INDISPONÍVEL"
echo

echo "=== DISCO ==="
df -h /
echo

echo "=== ÚLTIMOS LOGS ==="
pm2 logs achou-levou-whatsapp --lines 80 --nostream 2>/dev/null | tail -80 || true
