# Monitoramento independente dos bots WhatsApp

Monitora em cada VM a API local **GET /** (sem modificar filas), o processo PM2, e os arquivos data/{settings,runtime,queue,group-holds}.json. Também consulta o endpoint HTTPS da outra VM para identificar queda total da instância ou do túnel Cloudflare.

## Notificações Android

Utiliza **ntfy**, aplicativo Android (Play Store/F-Droid). Configure um único tópico aleatório, com pelo menos 32 caracteres imprevisíveis, para os dois monitores. Os tópicos públicos do ntfy.sh **não são privados por autenticação**: não inclua mensagens, tokens, identificadores de grupos ou dados pessoais nos alertas. Para confidencialidade forte, use servidor ntfy com autenticação ou FCM.

O aplicativo Android precisa se inscrever no tópico para exibir push. Não confunda envio HTTP bem-sucedido com notificação exibida em um celular ainda não inscrito.

## Configuração local

Armazene apenas na VM em \`~/bot-monitor/monitor.env\` (chmod 600), **nunca no GitHub**:

\`\`\`sh
export BOT_NAME="Júlio"
export BOT_DIR="/home/centraldecuponsshp/Bot-afiliados/whatsapp-bot"
export BOT_PM2_NAME="achou-levou-whatsapp"
export BOT_HEALTH_URL="http://127.0.0.1:3010/"
export PEER_HEALTH_URL="https://usuario2.achoulevoubot.uk/"
export NTFY_URL="https://ntfy.sh/<topico-aleatorio>"
export MONITOR_STATE="/home/centraldecuponsshp/bot-monitor/state.json"
export CHECK_SECONDS=60
export AUTO_RESTART_STOPPED=1
\`\`\`

Para Renata: BOT_NAME=Renata, BOT_DIR=.../whatsapp-bot-renata, BOT_PM2_NAME=achou-levou-whatsapp-renata, BOT_HEALTH_URL=http://127.0.0.1:3020/, PEER_HEALTH_URL=https://bot.achoulevoubot.uk/.

## Verificações

\`\`\`sh
set -a; . ./monitor.env; set +a
node monitor.mjs --dry-run
node --test test/monitor.test.mjs
node monitor.mjs --test-alert
pm2 start monitor.mjs --name achou-levou-monitor-julio --time
pm2 save
\`\`\`

As anomalias precisam ocorrer em três verificações (exceto grupos isolados). Alertas repetidos são limitados a um por hora por tipo. Ao normalizar, é enviado aviso de recuperação.

**Recuperação segura:** só executa \`pm2 restart\` se PM2 relatar \`stopped\` ou \`errored\` por 3 minutos, nenhuma observação durante a queda indicar envio em andamento, não houver grupos com resultado incerto e não houver reinício na última hora. Nunca apaga filas, reenvia ofertas, limpa credenciais ou reinicia uma sessão que apenas parece congelada. Envio com confirmação incerta requer revisão manual.

**Limitação:** a verificação entre VMs depende dos túneis/domínios HTTPS. Se ambos os servidores caírem simultaneamente, nenhum monitor poderá enviar alerta; para cobertura total, acrescente um terceiro verificador externo independente.
