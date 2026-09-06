import { sanitizeAuditMessage, sanitizeAuditUrl } from './audit-utils.mjs';

const DEFAULT_TIME_ZONE = process.env.AUDIT_TIME_ZONE || process.env.SHOPEE_TRACKING_TIME_ZONE || 'America/Sao_Paulo';

function clean(value = '', max = 20000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function urlsFromText(text = '') {
  return (String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || [])
    .map(url => url.replace(/[\])},.;!?*]+$/, ''));
}

function validDate(value = '') {
  const normalized = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function localPartsFromTimestamp(timestamp, timeZone = DEFAULT_TIME_ZONE) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    iso: date.toISOString(),
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}:${map.second}`
  };
}

export function safeSentWhatsAppMessage(message = {}, groupName = 'Grupo', timeZone = DEFAULT_TIME_ZONE) {
  if (!message?.fromMe) return null;
  const body = clean(message.body || message.caption || '', 20000);
  if (!body) return null;
  const local = localPartsFromTimestamp(message.timestamp, timeZone);
  if (!local) return null;
  const urls = [...new Set(urlsFromText(body).map(sanitizeAuditUrl).filter(Boolean))];

  return {
    group: clean(groupName || 'Grupo', 200),
    sentAt: local.iso,
    localDate: local.date,
    localTime: local.time,
    message: sanitizeAuditMessage(body),
    urls
  };
}

export async function buildWhatsAppSentAudit({
  client,
  groups = [],
  date = '',
  group = '',
  limitPerGroup = 120,
  timeZone = DEFAULT_TIME_ZONE
} = {}) {
  if (!client || typeof client.getChatById !== 'function') {
    throw new Error('Cliente do WhatsApp indisponível para auditoria.');
  }

  const dateFilter = validDate(date);
  if (!dateFilter) throw new Error('Informe date no formato YYYY-MM-DD.');

  const groupFilter = clean(group, 200).toLocaleLowerCase('pt-BR');
  const safeLimit = Math.min(300, Math.max(10, Number(limitPerGroup) || 120));
  const selectedGroups = (Array.isArray(groups) ? groups : [])
    .filter(item => item?.id && item?.name)
    .filter(item => !groupFilter || String(item.name).toLocaleLowerCase('pt-BR').includes(groupFilter));

  const items = [];
  const errors = [];

  for (const target of selectedGroups) {
    try {
      const chat = await client.getChatById(target.id);
      if (!chat || typeof chat.fetchMessages !== 'function') {
        throw new Error('Chat não permite leitura do histórico.');
      }
      const messages = await chat.fetchMessages({ limit: safeLimit, fromMe: true });
      for (const message of Array.isArray(messages) ? messages : []) {
        const safe = safeSentWhatsAppMessage(message, target.name, timeZone);
        if (safe && safe.localDate === dateFilter) items.push(safe);
      }
    } catch (error) {
      errors.push({
        group: clean(target.name, 200),
        error: clean(error?.message || error, 500)
      });
    }
  }

  items.sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));

  return {
    filters: {
      date: dateFilter,
      group: groupFilter || null,
      limitPerGroup: safeLimit,
      timeZone
    },
    groupsChecked: selectedGroups.map(item => clean(item.name, 200)),
    matched: items.length,
    items,
    errors
  };
}
