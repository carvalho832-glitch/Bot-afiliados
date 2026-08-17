#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

export TZ="${TZ:-America/Sao_Paulo}"
export PORT="${PORT:-3010}"
export BOT_PROFILE="${BOT_PROFILE:-julio}"
export WHATSAPP_CLIENT_ID="${WHATSAPP_CLIENT_ID:-achou-levou-${BOT_PROFILE}}"
export CLOUD_BACKUP_INTERVAL_SECONDS="${CLOUD_BACKUP_INTERVAL_SECONDS:-600}"

if [[ -n "${R2_ACCOUNT_ID:-}" && -n "${R2_BUCKET:-}" && -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" ]]; then
  echo "☁️ Restaurando sessão e dados do perfil ${BOT_PROFILE}..."
  node render-cloud-backup.mjs restore || {
    echo "❌ Não foi possível restaurar o backup remoto. Abortando para não iniciar uma sessão vazia por engano."
    exit 1
  }
else
  echo "⚠️ R2 não configurado. O Render Free perderá sessão/dados ao reiniciar."
fi

# Backups são feitos enquanto o Chromium pode estar ativo. Ao restaurar em uma
# nova instância, removemos somente arquivos de trava transitórios do Chrome.
node cleanup-restored-chrome-profile.cjs
node apply-render-profile.cjs

bash start-production.sh &
SERVER_PID=$!
BACKUP_LOOP_PID=""

backup_now() {
  if [[ -n "${R2_ACCOUNT_ID:-}" && -n "${R2_BUCKET:-}" && -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" ]]; then
    node render-cloud-backup.mjs backup || echo "⚠️ Backup remoto falhou; o bot continuará e tentará novamente."
  fi
}

backup_loop() {
  while kill -0 "$SERVER_PID" 2>/dev/null; do
    sleep "$CLOUD_BACKUP_INTERVAL_SECONDS" || break
    kill -0 "$SERVER_PID" 2>/dev/null || break
    backup_now
  done
}

backup_loop &
BACKUP_LOOP_PID=$!

finish() {
  local exit_code=$?
  trap - EXIT INT TERM

  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    for _ in $(seq 1 15); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$SERVER_PID" 2>/dev/null || true
  fi

  if [[ -n "$BACKUP_LOOP_PID" ]]; then
    kill "$BACKUP_LOOP_PID" 2>/dev/null || true
  fi

  echo "☁️ Salvando snapshot final do perfil ${BOT_PROFILE}..."
  backup_now
  exit "$exit_code"
}

trap finish EXIT INT TERM

set +e
wait "$SERVER_PID"
SERVER_EXIT=$?
set -e

if [[ "$SERVER_EXIT" -ne 0 ]]; then
  echo "⚠️ Bot encerrou com código ${SERVER_EXIT}; o Render poderá reiniciá-lo automaticamente."
fi
exit "$SERVER_EXIT"
