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

let corsMiddleware = 'cors()';
if (source.includes("app.use(cors({ origin: false }));")) {
  const corsMarker = "app.use(cors({ origin: false }));";
  source = source.replace(
    corsMarker,
    "const publicReadCors = cors({\n" +
    "  origin: true,\n" +
    "  methods: ['GET', 'OPTIONS'],\n" +
    "  allowedHeaders: ['Accept', 'Content-Type'],\n" +
    "  maxAge: 86400\n" +
    "});\n\n" + corsMarker
  );
  corsMiddleware = 'publicReadCors';
} else if (source.includes('app.use(cors());')) {
  corsMiddleware = 'cors()';
} else {
  throw new Error('[OVERVIEW] Configuração CORS esperada não foi encontrada.');
}

const statusMarker = "app.get('/status', (req, res) => {";
if (source.includes(statusMarker) && corsMiddleware === 'publicReadCors') {
  source = source.replace(statusMarker, "app.get('/status', publicReadCors, (req, res) => {");
}

const adminMarker = "app.use(['/diagnostics', '/settings', '/groups', '/queue', '/send-controlado', '/panic', '/qr', '/qr-page', '/admin'], adminAuth);";
const queueMarker = "app.get('/queue', (req, res) => {";
const insertMarker = source.includes(adminMarker) ? adminMarker : queueMarker;
if (!source.includes(insertMarker)) {
  throw new Error('[OVERVIEW] Não foi possível localizar o ponto de instalação da rota.');
}

const overviewRoute = `app.get('/overview', ${corsMiddleware}, (req, res) => {
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

source = source.replace(insertMarker, overviewRoute + insertMarker);
source = source.replace(
  "routes: ['/painel', '/status', '/diagnostics', '/groups', '/settings', '/queue', '/qr-page']",
  "routes: ['/painel', '/status', '/overview', '/diagnostics', '/groups', '/settings', '/queue', '/qr-page']"
);

if (source === original || !source.includes("app.get('/overview'")) {
  throw new Error('[OVERVIEW] Validação da alteração falhou.');
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const backup = `${file}.backup-overview-${stamp}`;
fs.copyFileSync(file, backup);
const temporary = `${file}.tmp-${process.pid}`;
fs.writeFileSync(temporary, source);
fs.renameSync(temporary, file);

console.log('[OVERVIEW] Rota pública somente leitura instalada com sucesso.');
console.log(`[OVERVIEW] Backup criado em: ${backup}`);
