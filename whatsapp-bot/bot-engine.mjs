import qrcode from 'qrcode';
import pkg from 'whatsapp-web.js';
import {
  DATA_DIR,
  SETTINGS_FILE,
  QUEUE_FILE,
  RUNTIME_FILE,
  TIME_ZONE,
  horaServidor,
  getSettings,
  saveSettings,
  getRuntime,
  saveRuntime,
  setQueueRunning,
  getQueue,
  saveQueue,
  updateQueueItem,
  normalizeGroups,
  gruposAutorizados,
  escolherGruposPorCategoria,
  intervalRemainingMs,
  getBlockReason,
  nextEligibleAt
} from './bot-store.mjs';

const { Client, LocalAuth } = pkg;
const SEND_DELAY_MS = Math.max(800, Number(process.env.SEND_DELAY_MS || 1500));
const RETRY_DELAY_MS = Math.max(30000, Number(process.env.RETRY_DELAY_MS || 60000));
const GROUP_CACHE_TTL_MS = Math.max(60000, Number(process.env.GROUP_CACHE_TTL_MS || 300000));
const TRANSIENT_RETRY_DELAYS_MS = [1500, 3500, 7000];

let status = 'iniciando';
let qrDataUrl = null;
let qrRaw = null;
let readyAt = null;
let lastError = null;
let queueTimer = null;
let queueProcessing = false;
let liveGroupsCache = { at: 0, groups: [] };
let liveGroupsPromise = null;
let consecutiveCycleFailures = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'achou-levou-julio' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }
});

export function getConnectionState() {
  return { status, readyAt, lastError, queueProcessing };
}

export function getQrState() {
  return { status, qr: qrRaw, qrDataUrl };
}

export async function fetchLiveGroups({ force = false } = {}) {
  if (status !== 'conectado') throw new Error('WhatsApp ainda não conectado.');
  if (!force && liveGroupsCache.groups.length && Date.now() - liveGroupsCache.at < GROUP_CACHE_TTL_MS) {
    return liveGroupsCache.groups;
  }
  if (liveGroupsPromise) return liveGroupsPromise;

  liveGroupsPromise = (async () => {
    let lastFailure = null;
    for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const chats = await client.getChats();
        const groups = chats
          .filter(chat => Boolean(chat?.isGroup || chat?.id?._serialized?.endsWith('@g.us')))
          .map(chat => ({
            id: String(chat?.id?._serialized || ''),
            name: String(chat?.name || chat?.formattedTitle || 'Grupo sem nome')
          }))
          .filter(group => group.id);
        const unique = Array.from(new Map(groups.map(group => [group.id, group])).values())
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        if (!unique.length) throw new Error('O WhatsApp não retornou nenhum grupo ativo.');
        liveGroupsCache = { at: Date.now(), groups: unique };
        return unique;
      } catch (error) {
        lastFailure = error;
        if (attempt < TRANSIENT_RETRY_DELAYS_MS.length) {
          const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
          console.warn(`[GRUPOS] Falha temporária na leitura, tentativa ${attempt + 1}/${TRANSIENT_RETRY_DELAYS_MS.length + 1}. Nova tentativa em ${delay} ms:`, error?.message || error);
          await sleep(delay);
        }
      }
    }
    if (liveGroupsCache.groups.length) {
      console.warn('[GRUPOS] Usando a última lista válida em cache após falha na leitura ao vivo.');
      return liveGroupsCache.groups;
    }
    throw lastFailure || new Error('Falha ao consultar grupos do WhatsApp.');
  })();

  try { return await liveGroupsPromise; }
  finally { liveGroupsPromise = null; }
}

export async function sincronizarGruposAtivos({ force = true } = {}) {
  const liveGroups = await fetchLiveGroups({ force });
  const liveMap = new Map(liveGroups.map(group => [group.id, group]));
  const current = getSettings();
  const before = normalizeGroups(current.selectedGroups, []);
  const removed = before.filter(group => !liveMap.has(group.id));
  const selectedGroups = before.filter(group => liveMap.has(group.id)).map(group => ({
    ...group,
    name: liveMap.get(group.id)?.name || group.name,
    category: group.category || current.groupCategories?.[group.id] || 'geral'
  }));

  const groupCategories = { ...current.groupCategories };
  selectedGroups.forEach(group => { groupCategories[group.id] = group.category; });
  const changed = removed.length > 0 || JSON.stringify(selectedGroups) !== JSON.stringify(before);
  const settings = changed ? saveSettings({ selectedGroups, groupCategories }) : current;

  const queue = getQueue();
  let queueChanged = false;
  for (const item of queue) {
    if (item.status === 'sent') continue;
    const old = JSON.stringify({ targets: item.targets, sentTargets: item.sentTargets, error: item.error });
    const targets = escolherGruposPorCategoria(settings, item.category);
    const targetIds = new Set(targets.map(group => group.id));
    item.targets = targets;
    item.sentTargets = item.sentTargets.filter(id => targetIds.has(id));
    item.targetErrors = Object.fromEntries(Object.entries(item.targetErrors || {}).filter(([id]) => targetIds.has(id)));
    item.status = 'pending';
    item.error = targets.length ? null : 'Nenhum grupo ativo compatível com esta oferta.';
    if (old !== JSON.stringify({ targets: item.targets, sentTargets: item.sentTargets, error: item.error })) queueChanged = true;
  }
  if (queueChanged) saveQueue(queue);

  if (removed.length) {
    console.log('[GRUPOS] Removidos da seleção:', removed.map(group => group.name || group.id).join(', '));
  }

  return {
    ok: selectedGroups.length > 0,
    liveGroups,
    activeSelected: selectedGroups,
    removed,
    reason: selectedGroups.length ? null : 'Nenhum grupo selecionado continua ativo no WhatsApp.'
  };
}

export function getQueueSummary() {
  const queue = getQueue();
  const settings = getSettings();
  const runtime = getRuntime();
  return {
    total: queue.length,
    pending: queue.filter(item => item.status === 'pending').length,
    sent: queue.filter(item => item.status === 'sent').length,
    error: queue.filter(item => item.error).length,
    running: Boolean(runtime.queueRunning),
    processing: queueProcessing,
    blockReason: runtime.queueRunning ? getBlockReason(status, settings) : null,
    serverTime: horaServidor(),
    nextEligibleAt: nextEligibleAt(settings),
    nextRunAt: runtime.nextRunAt,
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    offersPerBatch: settings.offersPerBatch,
    intervalMinutes: settings.intervalMinutes,
    sentToday: settings.sentToday,
    dailyLimit: settings.dailyLimit,
    selectedGroups: settings.selectedGroups.length,
    items: queue
  };
}

function clearQueueTimer() {
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = null;
}

function scheduleNextQueueRun(delayMs = 1000) {
  clearQueueTimer();
  if (!getRuntime().queueRunning) return;
  const safeDelay = Math.max(250, Number(delayMs || 1000));
  saveRuntime({ nextRunAt: new Date(Date.now() + safeDelay).toISOString() });
  queueTimer = setTimeout(() => {
    processQueue().catch(error => {
      console.error('[FILA] Erro completo:', error?.stack || error);
      scheduleNextQueueRun(RETRY_DELAY_MS);
    });
  }, safeDelay);
}

function isTransientWhatsAppError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return ['detached frame', 'execution context was destroyed', 'target closed', 'session closed', 'protocol error', 'most likely because of a navigation'].some(token => text.includes(token));
}

async function sendDirect(message, target) {
  let lastFailure = null;
  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await client.sendMessage(target.id, String(message).trim());
      return { ok: true, groupId: target.id, groupName: target.name || target.id };
    } catch (error) {
      lastFailure = error;
      if (!isTransientWhatsAppError(error) || attempt >= TRANSIENT_RETRY_DELAYS_MS.length) break;
      const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
      console.warn(`[ENVIO] Contexto temporariamente indisponível para ${target.name || target.id}. Tentativa ${attempt + 1}/${TRANSIENT_RETRY_DELAYS_MS.length + 1} em ${delay} ms.`);
      await sleep(delay);
    }
  }
  throw lastFailure || new Error('Falha desconhecida ao enviar mensagem.');
}

export async function processQueue() {
  if (!getRuntime().queueRunning || queueProcessing) return;
  queueProcessing = true;
  saveRuntime({ lastCycleAt: new Date().toISOString(), nextRunAt: null });

  try {
    let sync;
    try { sync = await sincronizarGruposAtivos({ force: false }); }
    catch (error) {
      console.warn('[FILA] Sincronização ao vivo falhou; preservando seleção salva:', error?.message || error);
      const settingsFallback = getSettings();
      sync = { ok: settingsFallback.selectedGroups.length > 0, reason: settingsFallback.selectedGroups.length ? null : 'Nenhum grupo selecionado.' };
    }
    if (!sync.ok) {
      console.log('[FILA] Aguardando:', sync.reason);
      saveRuntime({ lastCycleResult: sync.reason });
      scheduleNextQueueRun(RETRY_DELAY_MS);
      return;
    }

    let settings = getSettings();
    let queue = getQueue();
    const pending = queue.filter(item => item.status === 'pending');
    if (!pending.length) {
      setQueueRunning(false);
      console.log('[FILA] Finalizada: não há ofertas pendentes.');
      return;
    }

    const block = getBlockReason(status, settings);
    if (block) {
      console.log('[FILA] Aguardando:', block);
      saveRuntime({ lastCycleResult: block });
      const remaining = intervalRemainingMs(settings);
      scheduleNextQueueRun(remaining > 0 ? Math.min(remaining + 1000, 60000) : 60000);
      return;
    }

    const now = Date.now();
    const availableSlots = Math.max(0, settings.dailyLimit - settings.sentToday);
    const batchSize = Math.min(settings.offersPerBatch, availableSlots);
    const eligible = pending.filter(item => !item.retryAfter || item.retryAfter <= now).slice(0, batchSize);
    if (!eligible.length) {
      const nextRetry = Math.min(...pending.map(item => item.retryAfter || now + RETRY_DELAY_MS));
      scheduleNextQueueRun(Math.max(1000, nextRetry - now));
      return;
    }

    let successfulDeliveries = 0;
    let completedOffers = 0;

    for (const selected of eligible) {
      queue = getQueue();
      const item = queue.find(candidate => candidate.id === selected.id);
      if (!item || item.status !== 'pending') continue;

      const targets = escolherGruposPorCategoria(getSettings(), item.category);
      item.targets = targets;
      item.sentTargets = item.sentTargets.filter(id => targets.some(target => target.id === id));
      item.lastAttemptAt = new Date().toISOString();
      item.retryAfter = 0;

      for (const target of targets) {
        if (item.sentTargets.includes(target.id)) continue;
        try {
          await sendDirect(item.message, target);
          item.sentTargets.push(target.id);
          delete item.targetErrors[target.id];
          item.error = null;
          successfulDeliveries += 1;
          console.log(`[FILA] Oferta ${item.id} enviada para ${target.name}.`);
        } catch (error) {
          const message = String(error?.message || error || 'Falha desconhecida');
          item.targetErrors[target.id] = { message, at: new Date().toISOString() };
          item.error = `Falha em ${Object.keys(item.targetErrors).length} grupo(s). O bot continuou para os demais.`;
          item.retryAfter = Date.now() + 5 * 60000;
          console.error(`[FILA] Falha no grupo ${target.name} (${target.id}):`, error?.stack || error);
        }
        const persisted = updateQueueItem(item.id, () => item);
        if (!persisted.item) {
          console.warn(`[FILA] Oferta ${item.id} foi removida durante o processamento; interrompendo este item.`);
          break;
        }
        await sleep(SEND_DELAY_MS);
      }

      if (item.targets.length && item.targets.every(target => item.sentTargets.includes(target.id))) {
        item.status = 'sent';
        item.sentAt = new Date().toISOString();
        item.error = null;
        if (!item.countedAt) {
          settings = getSettings();
          saveSettings({ sentToday: settings.sentToday + 1 });
          item.countedAt = new Date().toISOString();
        }
        completedOffers += 1;
      } else {
        item.status = 'pending';
      }
      updateQueueItem(item.id, () => item);
      if (getSettings().sentToday >= getSettings().dailyLimit) break;
    }

    if (successfulDeliveries > 0 || completedOffers > 0) {
      settings = saveSettings({ lastBatchAt: Date.now(), lastSendAt: Date.now() });
      const result = `Lote concluído: ${completedOffers} oferta(s), ${successfulDeliveries} entrega(s).`;
      console.log('[FILA]', result);
      consecutiveCycleFailures = 0;
      saveRuntime({ lastCycleResult: result, consecutiveCycleFailures: 0 });
      scheduleNextQueueRun(settings.intervalMinutes * 60000);
    } else {
      const result = 'Nenhuma entrega concluída neste ciclo; nova tentativa agendada.';
      console.log('[FILA]', result);
      consecutiveCycleFailures += 1;
      const backoff = Math.min(RETRY_DELAY_MS * Math.max(1, consecutiveCycleFailures), 15 * 60000);
      saveRuntime({ lastCycleResult: result, consecutiveCycleFailures });
      scheduleNextQueueRun(backoff);
    }
  } catch (error) {
    console.error('[FILA] Falha no ciclo:', error?.stack || error);
    consecutiveCycleFailures += 1;
    const backoff = Math.min(RETRY_DELAY_MS * Math.max(1, consecutiveCycleFailures), 15 * 60000);
    saveRuntime({ lastCycleResult: String(error?.message || error), consecutiveCycleFailures });
    scheduleNextQueueRun(backoff);
  } finally {
    queueProcessing = false;
  }
}

export async function startQueue() {
  const settings = getSettings();
  if (!settings.enabled) throw new Error('Ative o envio controlado antes de iniciar.');
  if (status !== 'conectado') throw new Error('WhatsApp ainda não conectado.');
  let sync;
  try { sync = await sincronizarGruposAtivos({ force: false }); }
  catch (error) {
    const current = getSettings();
    if (!current.selectedGroups.length) throw error;
    sync = { ok: true, activeSelected: current.selectedGroups, warning: String(error?.message || error) };
  }
  if (!sync.ok) throw new Error(sync.reason);
  if (!getQueue().some(item => item.status === 'pending')) throw new Error('Não há ofertas pendentes na fila.');
  setQueueRunning(true);
  scheduleNextQueueRun(500);
  return { sync, queue: getQueueSummary() };
}

export function stopQueue() {
  setQueueRunning(false);
  clearQueueTimer();
  return getQueueSummary();
}

export function clearQueue() {
  stopQueue();
  saveQueue([]);
  return getQueueSummary();
}

export async function sendMessageToConfiguredGroups(message, category = null) {
  if (queueProcessing) {
    return { ok: false, error: 'A fila automática está processando um lote. Aguarde o ciclo terminar.', results: [] };
  }
  let sync;
  try { sync = await sincronizarGruposAtivos({ force: false }); }
  catch (error) {
    const current = getSettings();
    if (!current.selectedGroups.length) return { ok: false, error: String(error?.message || error), results: [] };
    sync = { ok: true, warning: String(error?.message || error) };
  }
  if (!sync.ok) return { ok: false, error: sync.reason, results: [] };
  const settings = getSettings();
  const block = getBlockReason(status, settings);
  if (block) return { ok: false, error: block, results: [] };
  const groups = category ? escolherGruposPorCategoria(settings, category) : gruposAutorizados(settings);
  const results = [];
  for (const group of groups) {
    try {
      await sendDirect(message, group);
      results.push({ ok: true, groupId: group.id, groupName: group.name, category: group.category });
    } catch (error) {
      results.push({ ok: false, groupId: group.id, groupName: group.name, category: group.category, error: String(error?.message || error) });
    }
    await sleep(SEND_DELAY_MS);
  }
  if (results.some(result => result.ok)) {
    const current = getSettings();
    saveSettings({ sentToday: current.sentToday + 1, lastBatchAt: Date.now(), lastSendAt: Date.now() });
  }
  const updated = getSettings();
  return {
    ok: results.some(result => result.ok),
    partial: results.some(result => !result.ok),
    results,
    sentToday: updated.sentToday,
    dailyLimit: updated.dailyLimit,
    groupName: results.filter(result => result.ok).map(result => result.groupName).join(', ')
  };
}

export function getDiagnostics() {
  const settings = getSettings();
  return {
    version: '2.0.0',
    status,
    serverTime: horaServidor(),
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    settings: {
      enabled: settings.enabled,
      windowStart: settings.windowStart,
      windowEnd: settings.windowEnd,
      intervalMinutes: settings.intervalMinutes,
      offersPerBatch: settings.offersPerBatch,
      dailyLimit: settings.dailyLimit,
      sentToday: settings.sentToday,
      selectedGroups: settings.selectedGroups
    },
    runtime: getRuntime(),
    queue: getQueueSummary(),
    dataFiles: { dataDir: DATA_DIR, settings: SETTINGS_FILE, queue: QUEUE_FILE, runtime: RUNTIME_FILE },
    timeZone: TIME_ZONE
  };
}

client.on('qr', async qr => {
  status = 'aguardando_qr';
  qrRaw = qr;
  qrDataUrl = await qrcode.toDataURL(qr);
  console.log('[WHATSAPP] QR Code gerado.');
});

client.on('authenticated', () => {
  status = 'autenticado';
  console.log('[WHATSAPP] Autenticado.');
});

client.on('ready', async () => {
  status = 'conectado';
  readyAt = new Date().toISOString();
  qrRaw = null;
  qrDataUrl = null;
  lastError = null;
  console.log('[WHATSAPP] Conectado e pronto.');
  try { await sincronizarGruposAtivos({ force: false }); }
  catch (error) { console.error('[GRUPOS] Sincronização inicial falhou:', error?.message || error); }
  if (getRuntime().queueRunning && getSettings().enabled && getQueue().some(item => item.status === 'pending')) {
    console.log('[FILA] Retomando automaticamente após reconexão.');
    scheduleNextQueueRun(1500);
  }
});

client.on('auth_failure', message => {
  status = 'falha_autenticacao';
  lastError = String(message || 'Falha de autenticação');
  clearQueueTimer();
  console.error('[WHATSAPP] Falha de autenticação:', lastError);
});

client.on('disconnected', reason => {
  status = 'desconectado';
  lastError = String(reason || 'Desconectado');
  clearQueueTimer();
  console.error('[WHATSAPP] Desconectado:', lastError);
  setTimeout(() => process.exit(1), 5000).unref();
});

export async function shutdownBot() {
  clearQueueTimer();
  try {
    await client.destroy();
  } catch (error) {
    console.warn('[WHATSAPP] Falha ao encerrar cliente de forma limpa:', error?.message || error);
  }
}

export function initializeBot() {
  return client.initialize().catch(error => {
    status = 'erro_inicializacao';
    lastError = String(error?.message || error);
    console.error('[WHATSAPP] Falha ao iniciar:', error?.stack || error);
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
