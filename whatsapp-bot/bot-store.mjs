import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TIME_ZONE = process.env.TZ || 'America/Sao_Paulo';
export const DATA_DIR = path.join(__dirname, 'data');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
export const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const CATEGORIAS = {
  geral: 'Geral',
  country: 'Country',
  eletronicos: 'Eletrônicos',
  casa: 'Casa',
  moda: 'Moda'
};

const PALAVRAS_CATEGORIA = {
  country: ['country', 'texana', 'texano', 'rodeio', 'rodeo', 'cowboy', 'cowgirl', 'boiadeira', 'boiadeiro', 'sertanejo', 'sertaneja', 'chapeu cowboy', 'bota country', 'bota texana', 'cinto country'],
  eletronicos: ['fone', 'bluetooth', 'carregador', 'usb', 'celular', 'smartphone', 'tablet', 'smartwatch', 'relogio inteligente', 'caixa de som', 'power bank', 'controle', 'camera', 'webcam', 'microfone', 'notebook', 'gamer'],
  casa: ['casa', 'cozinha', 'panela', 'air fryer', 'liquidificador', 'cafeteira', 'organizador', 'organizacao', 'mop', 'rodo', 'limpeza', 'tapete', 'banheiro', 'quarto', 'sala', 'cama', 'mesa', 'banho', 'travesseiro', 'cobertor', 'lencol', 'armario', 'prateleira', 'pote', 'garrafa termica'],
  moda: ['blusa', 'vestido', 'calca', 'short', 'bermuda', 'camisa', 'camiseta', 'cropped', 'tricot', 'moletom', 'jaqueta', 'casaco', 'lingerie', 'sutia', 'calcinha', 'tenis', 'sapato', 'sandalia', 'sapatilha', 'bota', 'bolsa', 'look', 'moda']
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return clone(fallback);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error('[DADOS] Falha ao ler', file, error?.message || error);
    return clone(fallback);
  }
}

function writeJson(file, data) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function zonedParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function hojeKey() {
  const parts = zonedParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function horaServidor() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date());
}

function minutesNow() {
  const parts = zonedParts();
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function parseTimeToMinutes(value = '00:00') {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function normalizeTime(value, fallback) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '')) ? String(value) : fallback;
}

export function dentroDoHorario(settings) {
  const now = minutesNow();
  const start = parseTimeToMinutes(settings.windowStart);
  const end = parseTimeToMinutes(settings.windowEnd);
  return start <= end ? now >= start && now <= end : now >= start || now <= end;
}

export function normalizarTexto(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizarCategoria(value) {
  const text = normalizarTexto(value).replace(/\s+/g, '_');
  if (['eletronico', 'eletronicos', 'eletronica'].includes(text)) return 'eletronicos';
  if (['country', 'rodeio', 'texana'].includes(text)) return 'country';
  if (['casa', 'cozinha', 'decoracao'].includes(text)) return 'casa';
  if (['moda', 'roupas', 'calcados'].includes(text)) return 'moda';
  if (['geral', 'todos'].includes(text)) return 'geral';
  return '';
}

export function detectarCategoriaMensagem(message = '') {
  const text = normalizarTexto(message);
  for (const category of ['country', 'eletronicos', 'casa', 'moda']) {
    if ((PALAVRAS_CATEGORIA[category] || []).some(term => text.includes(normalizarTexto(term)))) return category;
  }
  return 'geral';
}

export function normalizeGroups(groups, fallback = []) {
  const source = Array.isArray(groups) ? groups : [];
  const map = new Map();
  for (const group of source) {
    if (!group) continue;
    if (typeof group === 'string') {
      const id = group.trim();
      if (id && !map.has(id)) map.set(id, { id, name: id, category: 'geral' });
      continue;
    }
    const id = String(group.id || group.chatId || group.value || group._serialized || '').trim();
    if (!id || map.has(id)) continue;
    map.set(id, {
      id,
      name: String(group.name || group.nome || group.title || group.label || id).trim() || id,
      category: normalizarCategoria(group.category || group.categoria || group.tipo || group.tag) || 'geral'
    });
  }
  const normalized = Array.from(map.values());
  if (normalized.length) return normalized;
  return Array.isArray(fallback) && fallback.length ? normalizeGroups(fallback, []) : [];
}

function normalizarGroupCategories(value = {}) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [id, category] of Object.entries(value)) {
    const groupId = String(id || '').trim();
    if (groupId) result[groupId] = normalizarCategoria(category) || 'geral';
  }
  return result;
}

const defaultSettings = {
  enabled: false,
  selectedGroups: [],
  groupCategories: {},
  windowStart: '09:00',
  windowEnd: '21:00',
  intervalMinutes: 60,
  offersPerBatch: 2,
  dailyLimit: 16,
  sentToday: 0,
  sentDate: hojeKey(),
  lastBatchAt: 0,
  lastSendAt: 0
};

const defaultRuntime = {
  queueRunning: false,
  nextRunAt: null,
  lastCycleAt: null,
  lastCycleResult: null
};

function migrateSelectedGroups(saved) {
  if (Array.isArray(saved.selectedGroups)) return normalizeGroups(saved.selectedGroups, []);
  if (Array.isArray(saved.selectedGroupIds)) {
    return normalizeGroups(saved.selectedGroupIds.map((id, index) => ({ id, name: saved.selectedGroupNames?.[index] || id })), []);
  }
  if (saved.selectedGroupId) {
    return normalizeGroups([{ id: saved.selectedGroupId, name: saved.selectedGroupName || saved.selectedGroupId }], []);
  }
  return [];
}

export function getSettings() {
  const saved = readJson(SETTINGS_FILE, {});
  const savedCategories = normalizarGroupCategories(saved.groupCategories || {});
  const selectedGroups = migrateSelectedGroups(saved).map(group => ({
    ...group,
    category: normalizarCategoria(group.category || savedCategories[group.id]) || 'geral'
  }));
  const groupCategories = { ...savedCategories };
  selectedGroups.forEach(group => { groupCategories[group.id] = group.category; });

  const settings = {
    ...defaultSettings,
    ...saved,
    selectedGroups,
    groupCategories,
    windowStart: normalizeTime(saved.windowStart, defaultSettings.windowStart),
    windowEnd: normalizeTime(saved.windowEnd, defaultSettings.windowEnd),
    intervalMinutes: clampNumber(saved.intervalMinutes, 1, 1440, defaultSettings.intervalMinutes),
    offersPerBatch: clampNumber(saved.offersPerBatch, 1, 20, defaultSettings.offersPerBatch),
    dailyLimit: clampNumber(saved.dailyLimit, 1, 1000, defaultSettings.dailyLimit),
    sentToday: clampNumber(saved.sentToday, 0, 100000, 0),
    lastBatchAt: Number(saved.lastBatchAt || saved.lastSendAt || 0),
    enabled: Boolean(saved.enabled)
  };

  if (settings.sentDate !== hojeKey()) {
    settings.sentDate = hojeKey();
    settings.sentToday = 0;
    settings.lastBatchAt = 0;
    settings.lastSendAt = 0;
    writeJson(SETTINGS_FILE, settings);
  }
  return settings;
}

export function saveSettings(partial = {}) {
  const current = getSettings();
  const mergedCategories = {
    ...(current.groupCategories || {}),
    ...normalizarGroupCategories(partial.groupCategories || {})
  };
  const selectedRaw = Object.prototype.hasOwnProperty.call(partial, 'selectedGroups')
    ? partial.selectedGroups
    : Object.prototype.hasOwnProperty.call(partial, 'groups')
      ? partial.groups
      : current.selectedGroups;
  const selectedGroups = normalizeGroups(selectedRaw, []).map(group => {
    const category = normalizarCategoria(group.category || mergedCategories[group.id]) || 'geral';
    mergedCategories[group.id] = category;
    return { ...group, category };
  });

  const next = {
    ...current,
    ...partial,
    selectedGroups,
    groupCategories: mergedCategories,
    windowStart: normalizeTime(partial.windowStart ?? current.windowStart, current.windowStart),
    windowEnd: normalizeTime(partial.windowEnd ?? current.windowEnd, current.windowEnd),
    intervalMinutes: clampNumber(partial.intervalMinutes ?? current.intervalMinutes, 1, 1440, current.intervalMinutes),
    offersPerBatch: clampNumber(partial.offersPerBatch ?? current.offersPerBatch, 1, 20, current.offersPerBatch),
    dailyLimit: clampNumber(partial.dailyLimit ?? current.dailyLimit, 1, 1000, current.dailyLimit),
    sentToday: clampNumber(partial.sentToday ?? current.sentToday, 0, 100000, current.sentToday),
    lastBatchAt: Number(partial.lastBatchAt ?? current.lastBatchAt ?? 0),
    enabled: Boolean(partial.enabled ?? current.enabled)
  };
  for (const oldKey of ['selectedGroupId', 'selectedGroupName', 'selectedGroupIds', 'selectedGroupNames']) delete next[oldKey];
  writeJson(SETTINGS_FILE, next);
  return next;
}

export function getRuntime() {
  return { ...defaultRuntime, ...readJson(RUNTIME_FILE, defaultRuntime) };
}

export function saveRuntime(partial = {}) {
  const next = { ...getRuntime(), ...partial };
  writeJson(RUNTIME_FILE, next);
  return next;
}

export function setQueueRunning(value) {
  const runtime = getRuntime();
  return saveRuntime({ queueRunning: Boolean(value), nextRunAt: value ? runtime.nextRunAt : null });
}

function normalizeTrackingByTarget(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};

  for (const [targetId, raw] of Object.entries(value)) {
    const id = String(targetId || '').trim();
    if (!id || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const status = ['tracked', 'fallback', 'not_applicable'].includes(raw.status)
      ? raw.status
      : 'fallback';
    const links = (Array.isArray(raw.links) ? raw.links : []).slice(0, 3).map(link => ({
      originalUrl: String(link?.originalUrl || '').trim(),
      shortLink: String(link?.shortLink || '').trim()
    })).filter(link => link.originalUrl);

    result[id] = {
      status,
      links,
      subIds: (Array.isArray(raw.subIds) ? raw.subIds : []).slice(0, 5).map(String),
      generatedAt: raw.generatedAt || null,
      error: raw.error ? String(raw.error).slice(0, 300) : null
    };
  }

  return result;
}

function normalizeQueueItem(raw = {}) {
  return {
    id: String(raw.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    message: String(raw.message || '').trim(),
    category: normalizarCategoria(raw.category) || detectarCategoriaMensagem(raw.message),
    status: raw.status === 'sent' ? 'sent' : 'pending',
    targets: normalizeGroups(raw.targets, []),
    sentTargets: Array.from(new Set((Array.isArray(raw.sentTargets) ? raw.sentTargets : []).map(String))),
    targetErrors: raw.targetErrors && typeof raw.targetErrors === 'object' ? raw.targetErrors : {},
    createdAt: raw.createdAt || new Date().toISOString(),
    sentAt: raw.sentAt || null,
    countedAt: raw.countedAt || null,
    lastAttemptAt: raw.lastAttemptAt || null,
    retryAfter: Number(raw.retryAfter || 0),
    trackingByTarget: normalizeTrackingByTarget(raw.trackingByTarget),
    error: raw.error || null
  };
}

export function getQueue() {
  const raw = readJson(QUEUE_FILE, []);
  return Array.isArray(raw) ? raw.map(normalizeQueueItem).filter(item => item.message) : [];
}

export function saveQueue(queue) {
  const normalized = Array.isArray(queue) ? queue.map(normalizeQueueItem).filter(item => item.message) : [];
  writeJson(QUEUE_FILE, normalized);
  return normalized;
}

export function createQueueItem(message, category = null) {
  return normalizeQueueItem({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    category: normalizarCategoria(category) || detectarCategoriaMensagem(message),
    status: 'pending',
    targets: [],
    sentTargets: [],
    createdAt: new Date().toISOString()
  });
}

export function gruposAutorizados(settings, overrideGroups = null) {
  return normalizeGroups(overrideGroups ?? settings.selectedGroups, []).map(group => ({
    ...group,
    category: normalizarCategoria(group.category || settings.groupCategories?.[group.id]) || 'geral'
  }));
}

export function escolherGruposPorCategoria(settings, category, overrideGroups = null) {
  const groups = gruposAutorizados(settings, overrideGroups);
  if (!groups.length) return [];
  const normalized = normalizarCategoria(category) || 'geral';
  const exact = groups.filter(group => group.category === normalized);
  if (exact.length) return exact;
  const general = groups.filter(group => group.category === 'geral');
  return general.length ? general : groups;
}

export function intervalRemainingMs(settings) {
  const last = Number(settings.lastBatchAt || 0);
  return last ? Math.max(0, last + settings.intervalMinutes * 60000 - Date.now()) : 0;
}

export function getBlockReason(connectionStatus, settings) {
  if (!settings.enabled) return 'Envio controlado desativado.';
  if (connectionStatus !== 'conectado') return 'WhatsApp ainda não conectado.';
  if (!normalizeGroups(settings.selectedGroups, []).length) return 'Nenhum grupo ativo selecionado.';
  if (!dentroDoHorario(settings)) return `Fora do horário permitido: ${settings.windowStart} até ${settings.windowEnd}.`;
  if (settings.sentToday >= settings.dailyLimit) return `Limite diário de ${settings.dailyLimit} oferta(s) atingido.`;
  const remaining = intervalRemainingMs(settings);
  if (remaining > 0) return `Aguarde mais ${Math.ceil(remaining / 60000)} minuto(s) para o próximo lote.`;
  return null;
}

export function nextEligibleAt(settings) {
  const remaining = intervalRemainingMs(settings);
  return remaining > 0 ? new Date(Date.now() + remaining).toISOString() : null;
}
