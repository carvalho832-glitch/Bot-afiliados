import { timingSafeEqual } from 'crypto';

export const BULK_IMPORT_MAX_OFFERS = 200;
export const BULK_IMPORT_MAX_MESSAGE_LENGTH = 20000;

function cleanMessage(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function integerSetting(value, name, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    const error = new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function timeSetting(value, name) {
  const normalized = String(value ?? '').trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(normalized)) {
    const error = new Error(`${name} deve estar no formato HH:MM.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

export function normalizeBulkMessages(payload = {}) {
  const rawList = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.offers)
      ? payload.offers
      : null;

  const messages = rawList
    ? rawList.map(item => cleanMessage(
        typeof item === 'string'
          ? item
          : item?.message ?? item?.text ?? item?.content ?? item?.body
      )).filter(Boolean)
    : cleanMessage(payload.text)
        .split(/\r?\n---\r?\n/g)
        .map(cleanMessage)
        .filter(Boolean);

  if (!messages.length) {
    const error = new Error('Nenhuma oferta válida encontrada para importar.');
    error.statusCode = 400;
    throw error;
  }

  if (messages.length > BULK_IMPORT_MAX_OFFERS) {
    const error = new Error(`O limite por importação é de ${BULK_IMPORT_MAX_OFFERS} ofertas.`);
    error.statusCode = 400;
    throw error;
  }

  const tooLong = messages.findIndex(message => message.length > BULK_IMPORT_MAX_MESSAGE_LENGTH);
  if (tooLong >= 0) {
    const error = new Error(`A oferta ${tooLong + 1} ultrapassa ${BULK_IMPORT_MAX_MESSAGE_LENGTH} caracteres.`);
    error.statusCode = 400;
    throw error;
  }

  return messages;
}

export function normalizeBulkSettings(payload = {}) {
  const source = payload && typeof payload.settings === 'object' && !Array.isArray(payload.settings)
    ? payload.settings
    : {};
  const settings = {};

  if (Object.prototype.hasOwnProperty.call(source, 'windowStart')) {
    settings.windowStart = timeSetting(source.windowStart, 'windowStart');
  }
  if (Object.prototype.hasOwnProperty.call(source, 'windowEnd')) {
    settings.windowEnd = timeSetting(source.windowEnd, 'windowEnd');
  }
  if (Object.prototype.hasOwnProperty.call(source, 'intervalMinutes')) {
    settings.intervalMinutes = integerSetting(source.intervalMinutes, 'intervalMinutes', 1, 1440);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'offersPerBatch')) {
    settings.offersPerBatch = integerSetting(source.offersPerBatch, 'offersPerBatch', 1, 20);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'dailyLimit')) {
    settings.dailyLimit = integerSetting(source.dailyLimit, 'dailyLimit', 1, 1000);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'enabled')) {
    settings.enabled = parseBoolean(source.enabled);
  }

  return settings;
}

export function parseBulkImportPayload(payload = {}) {
  return {
    messages: normalizeBulkMessages(payload),
    settings: normalizeBulkSettings(payload),
    start: parseBoolean(payload.start)
  };
}

export function secureTokenEqual(expected, provided) {
  const a = Buffer.from(String(expected ?? ''), 'utf8');
  const b = Buffer.from(String(provided ?? ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
