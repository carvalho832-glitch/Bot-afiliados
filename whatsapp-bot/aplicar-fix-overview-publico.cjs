'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let source = fs.readFileSync(file, 'utf8');

if (source.includes("app.get('/overview'") || source.includes('app.get("/overview"')) {
  console.log('[OVERVIEW] A rota /overview já está instalada.');
  process.exit(0);
}

const publicRoute = `
// Leitura pública e somente leitura para o painel Achou Levou.
// Não expõe comandos de envio, configurações ou controle da fila.
function publicOverviewCors(req, res, next) {
  const origin = String(req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

app.options('/overview', publicOverviewCors);
app.get('/overview', publicOverviewCors, (req, res) => {
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

const anchors = [
  /app\.get\(\s*['"]\/['"]\s*,/,
  /app\.get\(\s*['"]\/painel['"]\s*,/,
  /app\.get\(\s*['"]\/status['"]\s*,/,
  /app\.get\(\s*['"]\/diagnostics['"]\s*,/,
  /app\.get\(\s*['"]\/queue['"]\s*,/
];

let anchorIndex = -1;
for (const pattern of anchors) {
  const match = pattern.exec(source);
  if (match && (anchorIndex < 0 || match.index < anchorIndex)) anchorIndex = match.index;
}

if (anchorIndex < 0) {
  throw new Error('[OVERVIEW] Nenhuma rota Express conhecida foi localizada em server.js. Nada foi alterado.');
}

const updated = source.slice(0, anchorIndex) + publicRoute + source.slice(anchorIndex);
if (!updated.includes("app.get('/overview'")) {
  throw new Error('[OVERVIEW] A validação da nova rota falhou. Nada foi alterado.');
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const backup = `${file}.backup-overview-${stamp}`;
fs.copyFileSync(file, backup);

const temporary = `${file}.tmp-${process.pid}`;
fs.writeFileSync(temporary, updated, 'utf8');
fs.renameSync(temporary, file);

console.log('[OVERVIEW] Rota pública somente leitura instalada com sucesso.');
console.log(`[OVERVIEW] Backup criado em: ${backup}`);
