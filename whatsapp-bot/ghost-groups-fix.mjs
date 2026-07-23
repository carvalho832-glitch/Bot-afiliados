import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverFile = path.join(__dirname, 'server.js');
const marker = 'ACHOU_LEVOU_GRUPOS_FANTASMAS_V1';

if (!fs.existsSync(serverFile)) {
  throw new Error(`Arquivo não encontrado: ${serverFile}`);
}

let source = fs.readFileSync(serverFile, 'utf8');

if (source.includes(marker)) {
  console.log('✅ Proteção contra grupos fantasmas já aplicada.');
  process.exit(0);
}

const helperAnchor = 'function getQueueSummary() {';
if (!source.includes(helperAnchor)) {
  throw new Error('Não foi possível localizar getQueueSummary().');
}

const helper = `async function sincronizarGruposAtivos() {
  // ${marker}: remove da memória os grupos que não existem mais no WhatsApp.
  if (status !== 'conectado' || !client?.pupPage) {
    return { ok: false, removed: [], active: 0, reason: 'WhatsApp não conectado.' };
  }

  const liveGroups = await client.pupPage.evaluate(() => {
    const collections = window.require('WAWebCollections');
    const chatCollection = collections?.Chat;
    if (!chatCollection) return [];

    const chats = typeof chatCollection.getModelsArray === 'function'
      ? chatCollection.getModelsArray()
      : Array.from(chatCollection.models || []);

    return chats
      .filter(chat => {
        const id = chat?.id?._serialized || chat?.id?.toString?.() || '';
        return chat?.id?.isGroup?.() || id.endsWith('@g.us');
      })
      .map(chat => ({
        id: chat?.id?._serialized || chat?.id?.toString?.() || '',
        name: String(
          chat?.name ||
          chat?.formattedTitle ||
          chat?.groupMetadata?.subject ||
          chat?.contact?.pushname ||
          'Grupo sem nome'
        )
      }))
      .filter(group => group.id);
  });

  const liveMap = new Map(liveGroups.map(group => [group.id, group]));
  const currentSettings = getSettings();
  const selectedBefore = normalizeGroups(currentSettings.selectedGroups, []);
  const removed = selectedBefore.filter(group => !liveMap.has(group.id));

  const selectedGroups = selectedBefore
    .filter(group => liveMap.has(group.id))
    .map(group => ({
      ...group,
      name: liveMap.get(group.id)?.name || group.name,
      category: normalizarCategoria(
        group.category || currentSettings.groupCategories?.[group.id]
      ) || 'geral'
    }));

  if (!selectedGroups.length && selectedBefore.length) {
    console.warn('[GRUPOS] Nenhum dos grupos selecionados existe mais no WhatsApp.');
    return { ok: false, removed, active: 0, reason: 'Nenhum grupo selecionado continua ativo.' };
  }

  let settings = currentSettings;
  if (selectedGroups.length) {
    const groupCategories = {};
    for (const group of selectedGroups) groupCategories[group.id] = group.category || 'geral';
    settings = saveSettings({ selectedGroups, groupCategories });
  }

  const queue = getQueue();
  let queueChanged = false;

  for (const item of queue) {
    if (item.status === 'sent') continue;

    const category = normalizarCategoria(item.category) || detectarCategoriaMensagem(item.message);
    const newTargets = escolherGruposPorCategoria(settings, category);
    const newIds = new Set(newTargets.map(group => group.id));

    item.category = category;
    item.targets = newTargets;
    item.sentTargets = Array.isArray(item.sentTargets)
      ? item.sentTargets.filter(id => newIds.has(id))
      : [];

    if (item.status === 'error') item.status = 'pending';
    item.error = null;
    queueChanged = true;
  }

  if (queueChanged) saveQueue(queue);

  if (removed.length) {
    console.log('[GRUPOS] Removidos grupos fantasmas:', removed.map(group => group.name || group.id).join(', '));
  }

  return {
    ok: true,
    active: selectedGroups.length,
    removed: removed.map(group => ({ id: group.id, name: group.name }))
  };
}

`;

source = source.replace(helperAnchor, helper + helperAnchor);

const startPattern = /app\.post\('\/queue\/start',\s*(?:async\s*)?\(req, res\) => \{[\s\S]*?\n\}\);/;
if (!startPattern.test(source)) {
  throw new Error('Não foi possível localizar a rota /queue/start.');
}

const startReplacement = `app.post('/queue/start', async (req, res) => {
  try {
    let settings = getSettings();
    if (!settings.enabled) return res.status(400).json({ ok: false, error: 'Ative o envio controlado antes de iniciar a fila.' });
    if (status !== 'conectado') return res.status(400).json({ ok: false, error: 'WhatsApp ainda não conectado.' });

    const sync = await sincronizarGruposAtivos();
    if (!sync.ok) return res.status(400).json({ ok: false, error: sync.reason, sync });

    settings = getSettings();
    if (!normalizeGroups(settings.selectedGroups, []).length) {
      return res.status(400).json({ ok: false, error: 'Selecione pelo menos um grupo ativo.' });
    }

    const queue = getQueue();
    for (const item of queue) {
      if (item.status === 'sent') continue;
      item.status = 'pending';
      item.error = null;
    }
    saveQueue(queue);

    const summary = getQueueSummary();
    if (!summary.pending) return res.status(400).json({ ok: false, error: 'Não há mensagens pendentes na fila.' });

    queueRunning = true;
    scheduleNextQueueRun(1000);
    res.json({ ok: true, message: 'Fila iniciada.', sync, queue: getQueueSummary() });
  } catch (error) {
    console.error('[GRUPOS] Erro ao sincronizar antes da fila:', error?.stack || error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});`;

source = source.replace(startPattern, startReplacement);

const processNeedle = `  try {
    const settings = getSettings();`;
const processReplacement = `  try {
    const sync = await sincronizarGruposAtivos();
    if (!sync.ok) {
      console.log('[FILA] Pausada:', sync.reason);
      queueRunning = false;
      clearQueueTimer();
      return;
    }

    const settings = getSettings();`;

const processIndex = source.indexOf('async function processQueue()');
if (processIndex < 0) throw new Error('Não foi possível localizar processQueue().');
const needleIndex = source.indexOf(processNeedle, processIndex);
if (needleIndex < 0) throw new Error('Não foi possível inserir a sincronização em processQueue().');
source = source.slice(0, needleIndex) + processReplacement + source.slice(needleIndex + processNeedle.length);

fs.writeFileSync(serverFile, source, 'utf8');
console.log('✅ Grupos fantasmas serão removidos ao iniciar e antes de cada lote.');
