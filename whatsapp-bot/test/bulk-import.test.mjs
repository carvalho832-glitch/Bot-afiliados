import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_IMPORT_MAX_OFFERS,
  normalizeBulkMessages,
  normalizeBulkSettings,
  parseBulkImportPayload,
  secureTokenEqual
} from '../bulk-import.mjs';

test('aceita 55 ofertas separadas por ---', () => {
  const text = Array.from({ length: 55 }, (_, index) => `Oferta ${index + 1}`).join('\n---\n');
  const payload = parseBulkImportPayload({
    text,
    start: true,
    settings: {
      windowStart: '07:45',
      windowEnd: '21:45',
      intervalMinutes: 40,
      offersPerBatch: 3,
      dailyLimit: 55
    }
  });

  assert.equal(payload.messages.length, 55);
  assert.equal(payload.start, true);
  assert.deepEqual(payload.settings, {
    windowStart: '07:45',
    windowEnd: '21:45',
    intervalMinutes: 40,
    offersPerBatch: 3,
    dailyLimit: 55
  });
});

test('aceita array de mensagens e remove vazias', () => {
  assert.deepEqual(normalizeBulkMessages({ messages: [' A ', '', { message: 'B' }] }), ['A', 'B']);
});

test('rejeita quantidade acima do limite', () => {
  const messages = Array.from({ length: BULK_IMPORT_MAX_OFFERS + 1 }, () => 'x');
  assert.throws(() => normalizeBulkMessages({ messages }), /limite por importação/i);
});

test('rejeita horários e números inválidos', () => {
  assert.throws(() => normalizeBulkSettings({ settings: { windowStart: '25:00' } }), /HH:MM/);
  assert.throws(() => normalizeBulkSettings({ settings: { offersPerBatch: 0 } }), /entre 1 e 20/);
  assert.throws(() => normalizeBulkSettings({ settings: { intervalMinutes: 1.5 } }), /inteiro/);
});

test('comparação de token exige valor idêntico', () => {
  assert.equal(secureTokenEqual('segredo-123', 'segredo-123'), true);
  assert.equal(secureTokenEqual('segredo-123', 'segredo-124'), false);
  assert.equal(secureTokenEqual('segredo-123', ''), false);
});
