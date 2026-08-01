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
  normalizeGroups,
  gruposAutorizados,
  escolherGruposPorCategoria,
  intervalRemainingMs,
  getBlockReason,
  nextEligibleAt
} from './bot-store.mjs';
import {
  prepararMensagemRastreada,
  getShopeeTrackingConfiguration
} from './shopee-tracking.mjs';

const { Client, LocalAuth } = pkg;
const SEND_DELAY_MS = Math.max(800, Number(process.env.SEND_DELAY_MS || 1500));
const RETRY_DELAY_MS = Math.max(30000, Number(process.env.RETRY_DELAY_MS || 60000));

let status = 'iniciando';
let qrDataUrl = null;
let qrRaw = null;
let readyAt = null;
let lastError = null;
let queueTimer = null;
let queueProcessing = false;
let liveGroupsCache = { at: 0, groups: [] };

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
  if (status !== 'conectado' || !client?.pupPage) throw new Error('WhatsApp ainda não conectado.');
  if (!force && liveGroupsCache.groups.length && Date.now() - liveGroupsCache.at < 15000) {
    return liveGroupsCache.groups;
  }

  const groups = await client.pupPage.evaluate(() => {
    let chatCollection = null;
    try { chatCollection = window.require?.('WAWebCollections')?.Chat || null; } catch {}
    chatCollection = chatCollection || window.Store?.Chat || null;
    if (!chatCollection) throw new Error('Coleção de chats indisponível no WhatsApp Web.');
    const chats = typeof chatCollection.getModelsArray === 'function'
      ? chatCollection.getModelsArray()
      : Array.from(chatCollection.models || []);
    return chats.map(chat => {
      const id = chat?.id?._serialized || chat?.id?.toString?.() || '';
      const isGroup = chat?.id?.isGroup?.() || chat?.id?.server === 'g.us' || id.endsWith('@g.us');
      if (!isGroup || !id) return null;
      return {
        id,
        name: String(chat?.name || chat?.formattedTitle || chat?.groupMetadata?.subject || chat?.contact?.pushname || 'Grupo sem nome')
      };
    }).filter(Boolean);
  });

  const unique = Array.from(new Map(groups.map(group => [group.id, group])).values())
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (!unique.length) throw new Error('O WhatsApp não retornou nenhum grupo ativo.');
  liveGroupsCache = { at: Date.now(), groups: unique };
  return unique;
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
    const old = JSON.stringify({
      targets: item.targets,
      sentTargets: item.sentTargets,
      trackingByTarget: item.trackingByTarget,
      error: item.error
    });
    const targets = escolherGruposPorCategoria(settings, item.category);
    const targetIds = new Set(targets.map(group => group.id));
    item.targets = targets;
    item.sentTargets = item.sentTargets.filter(id => targetIds.has(id));
    item.targetErrors = Object.fromEntries(Object.entries(item.targetErrors || {}).filter(([id]) => targetIds.has(id)));
    item.trackingByTarget = Object.fromEntries(Object.entries(item.trackingByTarget || {}).filter(([id]) => targetIds.has(id)));
    item.status = 'pending';
    item.error = targets.length ? null : 'Nenhum grupo ativo compatível com esta oferta.';
    if (old !== JSON.stringify({
      targets: item.targets,
      sentTargets: item.sentTargets,
      trackingByTarget: item.trackingByTarget,
      error: item.error
    })) queueChanged = true;
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
  const trackingRecords = queue.flatMap(item => Object.values(item.trackingByTarget || {}));
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
    tracking: {
      tracked: trackingRecords.filter(record => record.status === 'tracked').length,
      fallback: trackingRecords.filter(record => record.status === 'fallback').length,
      notApplicable: trackingRecords.filter(record => record.status === 'not_applicable').length
    },
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

async function sendDirect(message, target, trackingContext = {}) {
  const preparada = await prepararMensagemRastreada({
    message,
    target,
    offerId: trackingContext.offerId,
    category: trackingContext.category,
    existing: trackingContext.existing
  });

  try {
    await client.sendMessage(target.id, preparada.message);
  } catch (error) {
    const wrapped = new Error(String(error?.message || error || 'Falha ao enviar no WhatsApp'));
    wrapped.cause = error;
    wrapped.stack = error?.stack || wrapped.stack;
    wrapped.trackingRecord = preparada.record;
    throw wrapped;
  }

  return {
    ok: true,
    groupId: target.id,
    groupName: target.name || target.id,
    tracking: preparada.record
  };
}

export async function processQueue() {
  if (!getRuntime().queueRunning || queueProcessing) return;
  queueProcessing = true;
  saveRuntime({ lastCycleAt: new Date().toISOString(), nextRunAt: null });

  try {
    const sync = await sincronizarGruposAtivos({ force: true });
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
      item.trackingByTarget = item.trackingByTarget || {};
      item.lastAttemptAt = new Date().toISOString();
      item.retryAfter = 0;

      for (const target of targets) {
        if (item.sentTargets.includes(target.id)) continue;
        try {
          const delivery = await sendDirect(item.message, target, {
            offerId: item.id,
            category: item.category,
            existing: item.trackingByTarget[target.id]
          });
          item.trackingByTarget[target.id] = delivery.tracking;
          item.sentTargets.push(target.id);
          delete item.targetErrors[target.id];
          item.error = null;
          successfulDeliveries += 1;
          const trackingStatus = delivery.tracking?.status || 'not_applicable';
          console.log(`[FILA] Oferta ${item.id} enviada para ${target.name}. Rastreamento: ${trackingStatus}.`);
        } catch (error) {
          if (error?.trackingRecord) item.trackingByTarget[target.id] = error.trackingRecord;
          const message = String(error?.message || error || 'Falha desconhecida');
          item.targetErrors[target.id] = { message, at: new Date().toISOString() };
          item.error = `Falha em ${Object.keys(item.targetErrors).length} grupo(s). O bot continuou para os demais.`;
          item.retryAfter = Date.now() + 5 * 60000;
          console.error(`[FILA] Falha no grupo ${target.name} (${target.id}):`, error?.stack || error);
        }
        saveQueue(queue);
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
      saveQueue(queue);
      if (getSettings().sentToday >= getSettings().dailyLimit) break;
    }

    if (successfulDeliveries > 0 || completedOffers > 0) {
      settings = saveSettings({ lastBatchAt: Date.now(), lastSendAt: Date.now() });
      const result = `Lote concluído: ${completedOffers} oferta(s), ${successfulDeliveries} entrega(s).`;
      console.log('[FILA]', result);
      saveRuntime({ lastCycleResult: result });
      scheduleNextQueueRun(settings.intervalMinutes * 60000);
    } else {
      const result = 'Nenhuma entrega concluída neste ciclo; nova tentativa agendada.';
      console.log('[FILA]', result);
      saveRuntime({ lastCycleResult: result });
      scheduleNextQueueRun(RETRY_DELAY_MS);
    }
  } catch (error) {
    console.error('[FILA] Falha no ciclo:', error?.stack || error);
    saveRuntime({ lastCycleResult: String(error?.message || error) });
    scheduleNextQueueRun(RETRY_DELAY_MS);
  } finally {
    queueProcessing = false;
  }
}

export async function startQueue() {
  const settings = getSettings();
  if (!settings.enabled) throw new Error('Ative o envio controlado antes de iniciar.');
  if (status !== 'conectado') throw new Error('WhatsApp ainda não conectado.');
  const sync = await sincronizarGruposAtivos({ force: true });
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
  const sync = await sincronizarGruposAtivos({ force: true });
  if (!sync.ok) return { ok: false, error: sync.reason, results: [] };
  const settings = getSettings();
  const block = getBlockReason(status, settings);
  if (block) return { ok: false, error: block, results: [] };
  const groups = category ? escolherGruposPorCategoria(settings, category) : gruposAutorizados(settings);
  const results = [];
  const directOfferId = `direct_${Date.now()}`;
  for (const group of groups) {
    try {
      const delivery = await sendDirect(message, group, {
        offerId: directOfferId,
        category: category || group.category || 'geral'
      });
      results.push({
        ok: true,
        groupId: group.id,
        groupName: group.name,
        category: group.category,
        tracking: delivery.tracking?.status || 'not_applicable'
      });
    } catch (error) {
      results.push({
        ok: false,
        groupId: group.id,
        groupName: group.name,
        category: group.category,
        tracking: error?.trackingRecord?.status || 'fallback',
        error: String(error?.message || error)
      });
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
    version: '2.1.0',
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
    shopeeTracking: getShopeeTrackingConfiguration(),
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
  try { await sincronizarGruposAtivos({ force: true }); }
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

export function initializeBot() {
  return client.initialize().catch(error => {
    status = 'erro_inicializacao';
    lastError = String(error?.message || error);
    console.error('[WHATSAPP] Falha ao iniciar:', error?.stack || error);
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
