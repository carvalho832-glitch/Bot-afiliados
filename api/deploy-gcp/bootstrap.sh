#!/usr/bin/env bash
set -Eeuo pipefail

# Instalador da API Achou Levou em uma VM Debian 12 do Google Cloud.
# Uso:
#   sudo DOMAIN=api.achoulevoubot.uk bash bootstrap.sh

DOMAIN="${DOMAIN:-api.achoulevoubot.uk}"
REPO_URL="${REPO_URL:-https://github.com/carvalho832-glitch/Bot-afiliados.git}"
BRANCH="${BRANCH:-main}"
APP_ROOT="${APP_ROOT:-/opt/achou-levou}"
APP_DIR="${APP_ROOT}/api"
SERVICE_USER="${SERVICE_USER:-achoulevou}"
ENV_FILE="/etc/achou-levou-api.env"
SERVICE_FILE="/etc/systemd/system/achou-levou-api.service"
NGINX_FILE="/etc/nginx/sites-available/achou-levou-api"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo DOMAIN=${DOMAIN} bash $0"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

log() {
  printf '\n\033[1;36m[Achou Levou]\033[0m %s\n' "$*"
}

log "Instalando pacotes do sistema..."
apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  nodejs \
  npm

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  log "Criando usuário isolado ${SERVICE_USER}..."
  useradd --system --create-home --home-dir "/home/${SERVICE_USER}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

log "Baixando o código do GitHub..."
if [[ -d "${APP_ROOT}/.git" ]]; then
  git -C "${APP_ROOT}" fetch origin "${BRANCH}"
  git -C "${APP_ROOT}" reset --hard "origin/${BRANCH}"
else
  rm -rf "${APP_ROOT}"
  git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${APP_ROOT}"
fi

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_ROOT}"

log "Instalando dependências Node sem executar scripts automáticos..."
runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && npm install --ignore-scripts"

log "Instalando bibliotecas Linux necessárias ao Chromium..."
cd "${APP_DIR}"
npx playwright install-deps chromium

log "Instalando Chromium dentro do projeto..."
runuser -u "${SERVICE_USER}" -- env PLAYWRIGHT_BROWSERS_PATH=0 bash -lc "cd '${APP_DIR}' && npx playwright install chromium"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_ROOT}"

DEFAULT_BOT_URL="https://bot.achoulevoubot.uk"
DEFAULT_BOT_USER="julio"

read -r -p "Endereço do painel do bot [${DEFAULT_BOT_URL}]: " BOT_PANEL_URL
BOT_PANEL_URL="${BOT_PANEL_URL:-${DEFAULT_BOT_URL}}"

read -r -p "Usuário do painel do bot [${DEFAULT_BOT_USER}]: " BOT_PANEL_USER
BOT_PANEL_USER="${BOT_PANEL_USER:-${DEFAULT_BOT_USER}}"

read -r -s -p "Senha do painel do bot: " BOT_PANEL_PASSWORD
echo
if [[ -z "${BOT_PANEL_PASSWORD}" ]]; then
  echo "A senha não pode ficar vazia."
  exit 1
fi

log "Gravando variáveis protegidas..."
cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=3000
PLAYWRIGHT_BROWSERS_PATH=0
BOT_PANEL_URL=${BOT_PANEL_URL}
BOT_PANEL_USER=${BOT_PANEL_USER}
BOT_PANEL_PASSWORD=${BOT_PANEL_PASSWORD}
EOF
chmod 600 "${ENV_FILE}"

log "Criando serviço systemd com reinício automático..."
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=API Achou Levou
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
TimeoutStartSec=180
TimeoutStopSec=35
KillSignal=SIGTERM
LimitNOFILE=65535
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

log "Configurando Nginx para ${DOMAIN}..."
cat > "${NGINX_FILE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 15s;
        proxy_send_timeout 180s;
        proxy_read_timeout 180s;
    }
}
EOF

ln -sfn "${NGINX_FILE}" /etc/nginx/sites-enabled/achou-levou-api
rm -f /etc/nginx/sites-enabled/default
nginx -t

systemctl daemon-reload
systemctl enable --now achou-levou-api
systemctl enable --now nginx
systemctl reload nginx

log "Aguardando a API subir..."
API_OK=0
for _ in $(seq 1 36); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null 2>&1; then
    API_OK=1
    break
  fi
  sleep 5
done

if [[ "${API_OK}" -ne 1 ]]; then
  echo "A API não respondeu ao teste local. Últimos logs:"
  journalctl -u achou-levou-api -n 80 --no-pager
  exit 1
fi

log "Criando comando de atualização futura..."
cat > /usr/local/bin/achou-levou-update <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
git -C "${APP_ROOT}" fetch origin "${BRANCH}"
git -C "${APP_ROOT}" reset --hard "origin/${BRANCH}"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_ROOT}"
runuser -u "${SERVICE_USER}" -- bash -lc "cd '${APP_DIR}' && npm install --ignore-scripts"
cd "${APP_DIR}"
npx playwright install-deps chromium
runuser -u "${SERVICE_USER}" -- env PLAYWRIGHT_BROWSERS_PATH=0 bash -lc "cd '${APP_DIR}' && npx playwright install chromium"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_ROOT}"
systemctl restart achou-levou-api
systemctl --no-pager --full status achou-levou-api
EOF
chmod 750 /usr/local/bin/achou-levou-update

PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org || true)"

cat <<EOF

============================================================
API Achou Levou instalada com sucesso.

Teste local: http://127.0.0.1:3000/health
IP público:  ${PUBLIC_IP:-consulte no Google Cloud}
Domínio:     ${DOMAIN}

Próximos passos:
1. Aponte o DNS de ${DOMAIN} para o IP público da VM.
2. Aguarde o DNS propagar.
3. Execute:
   sudo certbot --nginx -d ${DOMAIN}
4. Teste:
   curl -i https://${DOMAIN}/health

Não altere ainda o endereço da API no painel. Primeiro valide
Shopee, Magalu, Amazon, Mercado Livre, status e fila nesta VM.
O Render deve continuar ligado durante a validação.
============================================================
EOF
