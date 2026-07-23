import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverFile = path.join(__dirname, 'server.js');
const marker = 'ACHOU_LEVOU_FILA_DIAGNOSTICO_V1';

if (!fs.existsSync(serverFile)) {
  throw new Error(`Arquivo não encontrado: ${serverFile}`);
}

let source = fs.readFileSync(serverFile, 'utf8');
let changed = false;

if (!source.includes(marker)) {
  const summaryPattern = /function getQueueSummary\(\) \{[\s\S]*?\n\}/;
  const summaryReplacement = `function getQueueSummary() {
  // ${marker}: mostra por que a fila está aguardando e quando poderá enviar.
  const queue = getQueue();
  const settings = getSettings();
  const blockReason = queueRunning ? podeEnviarAgora(settings) : null;
  const intervalMs = Math.max(1, Number(settings.intervalMinutes || 10)) * 60 * 1000;
  const nextEligibleAt = settings.lastSendAt
    ? new Date(Number(settings.lastSendAt) + intervalMs).toISOString()
    : null;
  const serverTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date());

  return {
    total: queue.length,
    pending: queue.filter(item => item.status === 'pending').length,
    sent: queue.filter(item => item.status === 'sent').length,
    error: queue.filter(item => item.status === 'error').length,
    running: queueRunning,
    processing: queueProcessing,
    blockReason,
    serverTime,
    nextEligibleAt,
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    sentToday: settings.sentToday,
    dailyLimit: settings.dailyLimit,
    items: queue
  };
}`;

  if (!summaryPattern.test(source)) {
    throw new Error('Não foi possível localizar getQueueSummary().');
  }

  source = source.replace(summaryPattern, summaryReplacement);

  const startPattern = /app\.post\('\/queue\/start', \(req, res\) => \{[\s\S]*?\n\}\);/;
  const startReplacement = `app.post('/queue/start', (req, res) => {
  const settings = getSettings();
  if (!settings.enabled) return res.status(400).json({ ok: false, error: 'Ative o envio controlado antes de iniciar a fila.' });
  if (status !== 'conectado') return res.status(400).json({ ok: false, error: 'WhatsApp ainda não conectado.' });
  if (!normalizeGroups(settings.selectedGroups, []).length) return res.status(400).json({ ok: false, error: 'Selecione pelo menos um grupo.' });

  // Recalcula os destinos das ofertas ainda não enviadas. Isso evita que uma fila
  // criada quando existia apenas o Grupo teste continue presa naquele destino.
  const queue = getQueue();
  for (const item of queue) {
    if (item.status !== 'pending') continue;
    item.sentTargets = Array.isArray(item.sentTargets) ? item.sentTargets : [];
    if (item.sentTargets.length === 0) {
      const category = normalizarCategoria(item.category) || detectarCategoriaMensagem(item.message);
      item.category = category;
      item.targets = escolherGruposPorCategoria(settings, category);
      item.error = null;
    }
  }
  saveQueue(queue);

  const summary = getQueueSummary();
  if (!summary.pending) return res.status(400).json({ ok: false, error: 'Não há mensagens pendentes na fila.' });
  queueRunning = true;
  scheduleNextQueueRun(1000);
  res.json({ ok: true, message: 'Fila iniciada.', queue: getQueueSummary() });
});`;

  if (!startPattern.test(source)) {
    throw new Error('Não foi possível localizar a rota /queue/start.');
  }

  source = source.replace(startPattern, startReplacement);

  const panelLine = "    linhas.push('Rodando: ' + (q.running ? 'sim' : 'não'));";
  const panelReplacement = `${panelLine}
    linhas.push('Hora do bot: ' + (q.serverTime || 'indisponível'));
    if (q.blockReason) linhas.push('Aguardando: ' + q.blockReason);
    if (q.nextEligibleAt) linhas.push('Próxima liberação: ' + new Date(q.nextEligibleAt).toLocaleString('pt-BR'));`;

  if (source.includes(panelLine)) {
    source = source.replace(panelLine, panelReplacement);
  }

  const batchMarkerIndex = source.indexOf('ACHOU_LEVOU_LOTE_OFERTAS_V1');
  if (batchMarkerIndex >= 0) {
    const blockerNeedle = "    const bloqueio = podeEnviarAgora(settings);\n    if (bloqueio) {";
    const blockerIndex = source.indexOf(blockerNeedle, batchMarkerIndex);
    if (blockerIndex >= 0) {
      source = source.slice(0, blockerIndex) +
        "    const bloqueio = podeEnviarAgora(settings);\n    if (bloqueio) {\n      console.log('[FILA] Aguardando:', bloqueio);" +
        source.slice(blockerIndex + blockerNeedle.length);
    }
  }

  changed = true;
}

if (changed) {
  fs.writeFileSync(serverFile, source, 'utf8');
  console.log('✅ Diagnóstico da fila e recálculo de destinos aplicados.');
} else {
  console.log('✅ Diagnóstico da fila já está aplicado.');
}
