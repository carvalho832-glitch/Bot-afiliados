#!/usr/bin/env bash
set -Eeuo pipefail

REPO_SLUG="carvalho832-glitch/Bot-afiliados"
PROCESS_NAME="achou-levou-whatsapp"
PORT="${PORT:-3010}"

say() { printf '\n%s\n' "$*"; }
fail() { printf '\n❌ %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git não encontrado."
command -v node >/dev/null 2>&1 || fail "Node.js não encontrado."
command -v npm >/dev/null 2>&1 || fail "npm não encontrado."
command -v pm2 >/dev/null 2>&1 || fail "PM2 não encontrado."
command -v curl >/dev/null 2>&1 || fail "curl não encontrado."

find_repo() {
  local root remote gitdir candidate

  root="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$root" ]]; then
    remote="$(git -C "$root" remote get-url origin 2>/dev/null || true)"
    if [[ "$remote" == *"$REPO_SLUG"* ]]; then
      printf '%s\n' "$root"
      return 0
    fi
  fi

  for candidate in "$HOME/Bot-afiliados" "$HOME/bot-afiliados" "/opt/Bot-afiliados" "/srv/Bot-afiliados"; do
    [[ -d "$candidate/.git" ]] || continue
    remote="$(git -C "$candidate" remote get-url origin 2>/dev/null || true)"
    if [[ "$remote" == *"$REPO_SLUG"* ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  while IFS= read -r gitdir; do
    root="${gitdir%/.git}"
    remote="$(git -C "$root" remote get-url origin 2>/dev/null || true)"
    if [[ "$remote" == *"$REPO_SLUG"* ]]; then
      printf '%s\n' "$root"
      return 0
    fi
  done < <(find "$HOME" -maxdepth 5 -type d -name .git 2>/dev/null)

  return 1
}

REPO_ROOT="$(find_repo || true)"
[[ -n "$REPO_ROOT" ]] || fail "Não encontrei o clone do repositório $REPO_SLUG nesta VM."
APP_DIR="$REPO_ROOT/whatsapp-bot"
[[ -d "$APP_DIR" ]] || fail "Pasta whatsapp-bot não encontrada em $REPO_ROOT."

say "🔎 Repositório encontrado: $REPO_ROOT"

BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
[[ "$BRANCH" == "main" ]] || fail "A VM está na branch '$BRANCH'. Para segurança, a atualização automática só roda na main."

# O painel recebe a Fase 22 automaticamente no boot e pode ficar modificado
# sem edição manual. Se panel.html for a única alteração rastreada, restauramos
# a versão do Git antes de atualizar. Qualquer outra alteração continua bloqueando.
TRACKED_CHANGES="$(
  {
    git -C "$REPO_ROOT" diff --name-only
    git -C "$REPO_ROOT" diff --cached --name-only
  } | sed '/^$/d' | sort -u
)"

if [[ -n "$TRACKED_CHANGES" ]]; then
  ONLY_GENERATED_PANEL=true
  while IFS= read -r changed_file; do
    [[ -z "$changed_file" ]] && continue
    if [[ "$changed_file" != "whatsapp-bot/panel.html" ]]; then
      ONLY_GENERATED_PANEL=false
      break
    fi
  done <<< "$TRACKED_CHANGES"

  if [[ "$ONLY_GENERATED_PANEL" == true ]]; then
    say "🧹 panel.html contém a injeção automática do painel; restaurando a versão do Git antes da atualização..."
    git -C "$REPO_ROOT" restore --staged --worktree -- whatsapp-bot/panel.html
  else
    git -C "$REPO_ROOT" status --short
    fail "Há alterações locais rastreadas além do painel gerado automaticamente. Nada foi reiniciado. Preserve/revise essas alterações antes de atualizar."
  fi
fi

pm2 describe "$PROCESS_NAME" >/dev/null 2>&1 || fail "Processo PM2 '$PROCESS_NAME' não encontrado. Nada será alterado."

AUTH_DIR="$APP_DIR/.wwebjs_auth"
ENV_FILE="$APP_DIR/.env"
[[ -d "$AUTH_DIR" ]] || fail "Pasta .wwebjs_auth não encontrada. Para não arriscar a sessão, a atualização foi cancelada."
[[ -f "$ENV_FILE" ]] || fail "Arquivo .env não encontrado. Para não perder configuração, a atualização foi cancelada."

BACKUP_BASE="$HOME/achou-levou-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_BASE/$STAMP"
mkdir -p "$BACKUP_DIR"

say "🛡️ Fazendo backup consistente da sessão e configuração..."
say "⏸️ Pausando o processo do bot por alguns segundos somente durante a cópia da sessão..."

pm2 stop "$PROCESS_NAME" >/dev/null

BACKUP_OK=false
if cp -a "$AUTH_DIR" "$BACKUP_DIR/.wwebjs_auth" \
  && cp -a "$ENV_FILE" "$BACKUP_DIR/.env"; then
  if [[ -d "$APP_DIR/data" ]]; then
    cp -a "$APP_DIR/data" "$BACKUP_DIR/data"
  fi
  BACKUP_OK=true
fi

say "▶️ Religando o bot após o backup..."
pm2 restart "$PROCESS_NAME" --update-env >/dev/null || true

if [[ "$BACKUP_OK" != true ]]; then
  fail "O backup da sessão falhou. O bot antigo foi religado e a atualização foi cancelada."
fi

printf '%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD)" > "$BACKUP_DIR/git-head.txt"
pm2 jlist > "$BACKUP_DIR/pm2-jlist.json" 2>/dev/null || true
curl -fsS "http://127.0.0.1:${PORT}/status" > "$BACKUP_DIR/status-before.json" 2>/dev/null || true
say "✅ Backup salvo em: $BACKUP_DIR"

PREV_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"
say "📥 Buscando atualização da main..."
git -C "$REPO_ROOT" fetch origin main
git -C "$REPO_ROOT" merge --ff-only origin/main || fail "Não foi possível atualizar por fast-forward. O bot NÃO foi reiniciado."
NEW_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"
printf '%s\n' "$NEW_HEAD" > "$BACKUP_DIR/git-head-after.txt"

say "🧪 Instalando dependências e validando antes de tocar no WhatsApp..."
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then
  npm ci --ignore-scripts
else
  npm install --ignore-scripts
fi

if ! npm run check; then
  printf '\n❌ A validação falhou. O processo PM2 NÃO foi reiniciado e a sessão continua intacta.\n' >&2
  printf 'Commit anterior: %s\nCommit atualizado: %s\nBackup: %s\n' "$PREV_HEAD" "$NEW_HEAD" "$BACKUP_DIR" >&2
  exit 1
fi

say "🔐 Conferindo token da importação em lote..."
if ! grep -Eq '^BULK_IMPORT_TOKEN=.+$' "$ENV_FILE"; then
  TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  if grep -q '^BULK_IMPORT_TOKEN=' "$ENV_FILE"; then
    sed -i "s|^BULK_IMPORT_TOKEN=.*$|BULK_IMPORT_TOKEN=$TOKEN|" "$ENV_FILE"
  else
    printf '\nBULK_IMPORT_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
  fi
  echo "✅ BULK_IMPORT_TOKEN criado e salvo no .env (valor oculto)."
else
  echo "✅ BULK_IMPORT_TOKEN já configurado."
fi

say "♻️ Reiniciando somente o processo do bot, preservando .wwebjs_auth..."
pm2 restart "$PROCESS_NAME" --update-env
pm2 save >/dev/null 2>&1 || true

CONNECTED=false
LAST_STATUS=""
for _ in $(seq 1 30); do
  LAST_STATUS="$(curl -fsS "http://127.0.0.1:${PORT}/status" 2>/dev/null || true)"
  if [[ -n "$LAST_STATUS" ]]; then
    STATUS_VALUE="$(printf '%s' "$LAST_STATUS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s).status||''))}catch{}})")"
    if [[ "$STATUS_VALUE" == "conectado" ]]; then
      CONNECTED=true
      break
    fi
  fi
  sleep 3
done

printf '%s' "$LAST_STATUS" > "$BACKUP_DIR/status-after.json" 2>/dev/null || true

if [[ "$CONNECTED" == true ]]; then
  say "✅ ATUALIZAÇÃO CONCLUÍDA"
  echo "WhatsApp: conectado"
  echo "PM2: $PROCESS_NAME reiniciado com sucesso"
  echo "Sessão preservada: $AUTH_DIR"
  echo "Backup: $BACKUP_DIR"
  echo "Commit: $NEW_HEAD"
  exit 0
fi

say "⚠️ O código foi atualizado, mas o WhatsApp ainda não confirmou 'conectado'."
echo "A pasta de sessão NÃO foi apagada. Backup: $BACKUP_DIR"
echo "Último status: ${LAST_STATUS:-indisponível}"
echo
echo "Últimas linhas do PM2:"
pm2 logs "$PROCESS_NAME" --lines 40 --nostream || true
exit 2
