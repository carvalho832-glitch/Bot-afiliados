const DEFAULT_TIME_ZONE = process.env.AUDIT_TIME_ZONE || process.env.SHOPEE_TRACKING_TIME_ZONE || 'America/Sao_Paulo';

function clean(value = '', max = 20000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function urlsFromText(text = '') {
  return (String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || [])
    .map(url => url.replace(/[\])},.;!?*]+$/, ''));
}

export function sanitizeAuditUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    if (!/^https?:$/.test(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function sanitizeAuditMessage(message = '') {
  let result = clean(message, 20000);
  for (const original of [...new Set(urlsFromText(result))]) {
    const safe = sanitizeAuditUrl(original);
    result = result.split(original).join(safe || '[link oculto]');
  }
  return result;
}

function dateKeyInTimeZone(value, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function validDateFilter(value = '') {
  const normalized = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function targetNameMap(item = {}) {
  const map = new Map();
  for (const target of Array.isArray(item.targets) ? item.targets : []) {
    const id = clean(target?.id, 200);
    const name = clean(target?.name || target?.title || 'Grupo', 200);
    if (id) map.set(id, name || 'Grupo');
  }
  return map;
}

function safeTracking(item = {}, names = new Map()) {
  return Object.entries(item.trackingByTarget || {}).map(([targetId, record]) => ({
    group: names.get(targetId) || 'Grupo não disponível no registro',
    status: clean(record?.status || 'unknown', 40),
    subIds: (Array.isArray(record?.subIds) ? record.subIds : [])
      .map(value => clean(value, 60))
      .filter(Boolean)
      .slice(0, 5),
    generatedAt: clean(record?.generatedAt, 100) || null,
    error: clean(record?.error, 500) || null
  }));
}

export function safeAuditItem(item = {}, index = 0) {
  const names = targetNameMap(item);
  const groups = [...new Set([...names.values()].filter(Boolean))];
  const sentGroups = [...new Set((Array.isArray(item.sentTargets) ? item.sentTargets : [])
    .map(id => names.get(String(id || '')))
    .filter(Boolean))];
  const rawMessage = item.message || item.text || item.content || item.body || '';
  const urls = [...new Set(urlsFromText(rawMessage).map(sanitizeAuditUrl).filter(Boolean))];

  return {
    id: clean(item.id || item.offerId || item.queueId || `queue-${index + 1}`, 160),
    status: clean(item.status || item.state || 'pending', 40),
    category: clean(item.category || item.categoria || 'geral', 80),
    message: sanitizeAuditMessage(rawMessage),
    urls,
    createdAt: clean(item.createdAt || item.criadoEm, 100) || null,
    updatedAt: clean(item.updatedAt || item.atualizadoEm, 100) || null,
    lastAttemptAt: clean(item.lastAttemptAt, 100) || null,
    sentAt: clean(item.sentAt, 100) || null,
    countedAt: clean(item.countedAt, 100) || null,
    groups,
    sentGroups,
    tracking: safeTracking(item, names),
    error: clean(item.error, 500) || null
  };
}

function itemDateKeys(item, timeZone) {
  return [item.createdAt, item.updatedAt, item.lastAttemptAt, item.sentAt, item.countedAt]
    .map(value => dateKeyInTimeZone(value, timeZone))
    .filter(Boolean);
}

function sortableTime(item = {}) {
  for (const value of [item.sentAt, item.lastAttemptAt, item.countedAt, item.updatedAt, item.createdAt]) {
    const timestamp = Date.parse(value || '');
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function buildAuditOffers(queue = [], {
  date = '',
  status = '',
  category = '',
  limit = 100,
  timeZone = DEFAULT_TIME_ZONE
} = {}) {
  const dateFilter = validDateFilter(date);
  const statusFilter = clean(status, 40).toLowerCase();
  const categoryFilter = clean(category, 80).toLowerCase();
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));

  const items = (Array.isArray(queue) ? queue : [])
    .map(safeAuditItem)
    .filter(item => !dateFilter || itemDateKeys(item, timeZone).includes(dateFilter))
    .filter(item => !statusFilter || item.status.toLowerCase() === statusFilter)
    .filter(item => !categoryFilter || item.category.toLowerCase() === categoryFilter)
    .sort((a, b) => sortableTime(b) - sortableTime(a));

  return {
    filters: {
      date: dateFilter || null,
      status: statusFilter || null,
      category: categoryFilter || null,
      limit: safeLimit,
      timeZone
    },
    matched: items.length,
    items: items.slice(0, safeLimit)
  };
}
