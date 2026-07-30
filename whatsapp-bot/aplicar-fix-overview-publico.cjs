'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let source = fs.readFileSync(file, 'utf8');
const original = source;

if (source.includes("app.get('/overview'")) {
  console.log('[OVERVIEW] A rota /overview já está instalada.');
  process.exit(0);
}

const corsMarker = "app.use(cors({ origin: false }));";
if (!source.includes(corsMarker)) {
  throw new Error('[OVERVIEW] Configuração CORS esperada não foi encontrada. Nenhuma alteração aplicada.');
}

source = source.replace(
  corsMarker,
  "const publicReadCors = cors({\n" +
  "  origin: true,\n" +
  "  methods: ['GET', 'OPTIONS'],\n" +
  "  allowedHeaders: ['Accept', 'Content-Type'],\n" +
  "  maxAge: 86400\n" +
  "});\n\n" +
  corsMarker
);

const statusMarker = "app.get('/status', (req, res) => {";
if (!source.includes(statusMarker)) {
  throw new Error('[OVERVIEW] Rota /status esperada não foi encontrada. Nenhuma alteração aplicada.');
}
source = source.replace(statusMarker, "app.get('/status', publicReadCors, (req, res) => {");

const authMarker = "app.use(['/diagnostics', '/settings', '/groups', '/queue', '/send-controlado', '/panic', '/qr', '/qr-page', '/admin'], adminAuth);";
if (!source.includes(authMarker)) {
  throw new Error('[OVERVIEW] Marcador das rotas administrativas não foi encontrado. Nenhuma alteração aplicada.');
}

const overviewRoute = `app.get('/overview', publicReadCors, (req, res) => {
  const connection = getConnectionState();
  const queue = getQueueSummary();

  res.json({
    ok: true,
    status: {
      ok: true,
      ...connection,
      hasQr: Boolean(getQrState().qrDataUrl),
      queueRunning: queue.running,
      queueProcessing: queue.processing,
      blockReason: queue.blockReason,
      serverTime: queue.serverTime,
      selectedGroups: queue.selectedGroups,
      pendingOffers: queue.pending,
      nextRunAt: queue.nextRunAt
    },
    queue,
    checkedAt: new Date().toISOString()
  });
});

`;

source = source.replace(authMarker, overviewRoute + authMarker);

source = source.replace(
  "routes: ['/painel', '/status', '/diagnostics', '/groups', '/settings', '/queue', '/qr-page']",
  "routes: ['/painel', '/status', '/overview', '/diagnostics', '/groups', '/settings', '/queue', '/qr-page']"
);

if (source === original) throw new Error('[OVERVIEW] Nenhuma alteração foi realizada.');
if (!source.includes("app.get('/overview', publicReadCors")) throw new Error('[OVERVIEW] Validação da rota falhou.');

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const backup = `${file}.backup-overview-${stamp}`;
fs.copyFileSync(file, backup);

const temporary = `${file}.tmp-${process.pid}`;
fs.writeFileSync(temporary, source);
fs.renameSync(temporary, file);

console.log('[OVERVIEW] Rota pública somente leitura instalada com sucesso.');
console.log(`[OVERVIEW] Backup criado em: ${backup}`);
