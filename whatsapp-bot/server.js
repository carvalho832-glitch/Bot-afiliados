import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import {
  CATEGORIAS,
  SETTINGS_FILE,
  QUEUE_FILE,
  RUNTIME_FILE,
  getSettings,
  saveSettings,
  getQueue,
  saveQueue,
  createQueueItem,
  normalizarCategoria,
  horaServidor,
  setQueueRunning
} from './bot-store.mjs';
import {
  getConnectionState,
  getQrState,
  fetchLiveGroups,
  sincronizarGruposAtivos,
  getQueueSummary,
  startQueue,
  stopQueue,
  clearQueue,
  sendMessageToConfiguredGroups,
  getDiagnostics,
  initializeBot,
  shutdownBot
} from './bot-engine.mjs';
import { startQueueWatchdog } from './queue-watchdog.mjs';

const app = express();
const PORT = Number(process.env.PORT || 3010);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const installedSettings = getSettings();
if (installedSettings.schemaVersion !== 2) {
  saveSettings({ schemaVersion: 2, sentToday: 0, lastBatchAt: 0, lastSendAt: 0 });
  console.log('[MIGRAÇÃO] Contadores antigos convertidos para o modelo de ofertas da v2.');
}

const BOT_USER = String(process.env.BOT_USER || '').trim();
const BOT_PASS = String(process.env.BOT_PASS || '').trim();
const AUTH_ENABLED = Boolean(BOT_USER && BOT_PASS);
if (!AUTH_ENABLED) console.warn('[SEGURANÇA] BOT_USER/BOT_PASS não definidos. Rotas administrativas estão sem autenticação.');

function adminAuth(req, res, next) {
  if (!AUTH_ENABLED) return next();
  const header = String(req.headers.authorization || '');
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const user = separator >= 0 ? decoded.slice(0, separator) : decoded;
    const pass = separator >= 0 ? decoded.slice(separator + 1) : '';
    if (user === BOT_USER && pass === BOT_PASS) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Achou Levou"');
  return res.status(401).send('Autenticação necessária.');
}

app.use(cors({ origin: false }));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou WhatsApp Bot',
    version: '2.0.0',
    ...getConnectionState(),
    serverTime: horaServidor(),
    routes: ['/painel', '/status', '/diagnostics', '/groups', '/settings', '/queue', '/qr-page']
  });
});

app.get('/painel', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'panel.html'));
});

app.get('/status', (req, res) => {
  const connection = getConnectionState();
  const queue = getQueueSummary();
  res.json({
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
  });
});

app.use(['/diagnostics', '/settings', '/groups', '/queue', '/send-controlado', '/panic', '/qr', '/qr-page', '/admin'], adminAuth);

app.get('/diagnostics', async (req, res) => {
  let liveGroupsCount = 0;
  let groupsError = null;
  try {
    if (getConnectionState().status === 'conectado') {
      liveGroupsCount = (await fetchLiveGroups({ force: false })).length;
    }
  } catch (error) {
    groupsError = String(error?.message || error);
  }
  res.json({ ok: true, ...getDiagnostics(), liveGroupsCount, groupsError });
});

app.get('/settings', (req, res) => {
  res.json({ ok: true, settings: getSettings(), categorias: CATEGORIAS });
});

app.post('/settings', async (req, res) => {
  const allowed = ['enabled', 'selectedGroups', 'groups', 'groupCategories', 'windowStart', 'windowEnd', 'intervalMinutes', 'offersPerBatch', 'dailyLimit'];
  const partial = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) partial[key] = req.body[key];
  }

  const settings = saveSettings(partial);
  let queue = getQueueSummary();

  if (!settings.enabled) {
    queue = stopQueue();
  } else if (queue.running && queue.pending > 0) {
    try {
      const restarted = await startQueue();
      queue = restarted.queue;
      console.log('[FILA] Configuração alterada; temporizador recalculado imediatamente.');
    } catch (error) {
      console.warn('[FILA] Configuração salva, mas o reagendamento aguardará o watchdog:', error?.message || error);
      queue = getQueueSummary();
    }
  }

  res.json({ ok: true, settings, queue });
});

app.get('/groups', async (req, res) => {
  try {
    const settings = getSettings();
    const groups = await fetchLiveGroups({ force: req.query.force === '1' });
    res.json({
      ok: true,
      total: groups.length,
      groups: groups.map(group => ({
        ...group,
        category: settings.groupCategories?.[group.id] || 'geral',
        selected: settings.selectedGroups.some(selected => selected.id === group.id)
      }))
    });
  } catch (error) {
    res.status(503).json({ ok: false, error: String(error?.message || error), status: getConnectionState().status });
  }
});

app.post('/groups/sync', async (req, res) => {
  try {
    const sync = await sincronizarGruposAtivos({ force: true });
    res.json({ ok: sync.ok, sync, settings: getSettings(), queue: getQueueSummary() });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get('/queue', (req, res) => {
  res.json({ ok: true, queue: getQueueSummary() });
});

app.post('/queue/add', (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Texto vazio.' });
  const messages = text.split(/\r?\n---\r?\n/g).map(message => message.trim()).filter(Boolean);
  if (!messages.length) return res.status(400).json({ ok: false, error: 'Nenhuma oferta válida encontrada.' });
  const forcedCategory = normalizarCategoria(req.body?.category || req.body?.categoria);
  const newItems = messages.map(message => createQueueItem(message, forcedCategory));
  saveQueue([...getQueue(), ...newItems]);
  res.json({ ok: true, added: newItems.length, queue: getQueueSummary() });
});

app.post('/queue/start', async (req, res) => {
  try {
    const result = await startQueue();
    res.json({ ok: true, message: 'Fila iniciada.', ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post('/queue/stop', (req, res) => {
  res.json({ ok: true, message: 'Fila pausada.', queue: stopQueue() });
});

app.post('/queue/clear', (req, res) => {
  if (getConnectionState().queueProcessing) {
    return res.status(409).json({ ok: false, error: 'A fila está processando um lote. Pause e aguarde o ciclo terminar antes de limpar.' });
  }
  res.json({ ok: true, message: 'Fila limpa.', queue: clearQueue() });
});

app.post('/send-controlado', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ ok: false, error: 'Mensagem vazia.' });
    const category = normalizarCategoria(req.body?.category || req.body?.categoria);
    const result = await sendMessageToConfiguredGroups(message, category || null);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post('/panic', (req, res) => {
  setQueueRunning(false);
  const settings = saveSettings({ enabled: false });
  res.json({ ok: true, message: 'Bot desativado e fila pausada.', settings, queue: stopQueue() });
});

app.post('/admin/restart-whatsapp', (req, res) => {
  console.warn('[ADMIN] Reinício controlado solicitado pelo painel.');
  res.json({ ok: true, message: 'Reinício solicitado. O PM2 deverá reconectar o WhatsApp em alguns segundos.' });
  setTimeout(() => requestShutdown(0), 750).unref();
});

app.get('/qr', (req, res) => {
  res.json({ ok: true, ...getQrState() });
});

app.get('/qr-page', (req, res) => {
  const qr = getQrState();
  if (!qr.qrDataUrl) {
    return res.send(`<html><body style="font-family:Arial;text-align:center;padding:40px;background:#0d1117;color:white"><h2>Status: ${qr.status}</h2><p>Aguarde alguns segundos e atualize.</p><a style="color:#58a6ff" href="/qr-page">Atualizar</a></body></html>`);
  }
  res.send(`<html><body style="font-family:Arial;text-align:center;padding:30px;background:#0d1117;color:white"><h2>Escaneie o QR Code</h2><p>WhatsApp → Aparelhos conectados → Conectar aparelho</p><img src="${qr.qrDataUrl}" style="width:300px;max-width:90%;background:white;padding:12px;border-radius:12px"><p><a style="color:#58a6ff" href="/status">Ver status</a></p></body></html>`);
});

let httpServer = null;
let shuttingDown = false;

async function requestShutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[PROCESSO] Encerramento controlado iniciado.');
  const forceTimer = setTimeout(() => process.exit(exitCode || 1), 15000);
  forceTimer.unref?.();
  try {
    await shutdownBot();
    await new Promise(resolve => {
      if (!httpServer) return resolve();
      httpServer.close(() => resolve());
    });
  } catch (error) {
    console.error('[PROCESSO] Falha durante encerramento:', error?.stack || error);
    exitCode = exitCode || 1;
  } finally {
    clearTimeout(forceTimer);
    process.exit(exitCode);
  }
}

process.on('unhandledRejection', error => {
  console.error('[PROCESSO] Promise rejeitada:', error?.stack || error);
});

process.on('uncaughtException', error => {
  console.error('[PROCESSO] Exceção não tratada:', error?.stack || error);
  setTimeout(() => requestShutdown(1), 250).unref();
});
process.on('SIGTERM', () => requestShutdown(0));
process.on('SIGINT', () => requestShutdown(0));

initializeBot();
startQueueWatchdog();

httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVIDOR] Bot v2.0.0 rodando em http://localhost:${PORT}`);
  console.log('[DADOS]', { settings: SETTINGS_FILE, queue: QUEUE_FILE, runtime: RUNTIME_FILE });
});
