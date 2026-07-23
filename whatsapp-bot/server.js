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
  initializeBot
} from './bot-engine.mjs';

const app = express();
const PORT = Number(process.env.PORT || 3010);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
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

app.get('/painel', (req, res) => {
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

app.get('/diagnostics', async (req, res) => {
  let liveGroupsCount = 0;
  let groupsError = null;
  try {
    if (getConnectionState().status === 'conectado') {
      liveGroupsCount = (await fetchLiveGroups({ force: true })).length;
    }
  } catch (error) {
    groupsError = String(error?.message || error);
  }
  res.json({ ok: true, ...getDiagnostics(), liveGroupsCount, groupsError });
});

app.get('/settings', (req, res) => {
  res.json({ ok: true, settings: getSettings(), categorias: CATEGORIAS });
});

app.post('/settings', (req, res) => {
  const allowed = ['enabled', 'selectedGroups', 'groups', 'groupCategories', 'windowStart', 'windowEnd', 'intervalMinutes', 'offersPerBatch', 'dailyLimit'];
  const partial = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) partial[key] = req.body[key];
  }
  res.json({ ok: true, settings: saveSettings(partial) });
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

process.on('unhandledRejection', error => {
  console.error('[PROCESSO] Promise rejeitada:', error?.stack || error);
});

process.on('uncaughtException', error => {
  console.error('[PROCESSO] Exceção não tratada:', error?.stack || error);
  setTimeout(() => process.exit(1), 1000).unref();
});

initializeBot();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVIDOR] Bot v2.0.0 rodando em http://localhost:${PORT}`);
  console.log('[DADOS]', { settings: SETTINGS_FILE, queue: QUEUE_FILE, runtime: RUNTIME_FILE });
});
