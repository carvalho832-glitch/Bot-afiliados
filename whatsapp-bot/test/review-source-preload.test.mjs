import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../review-source-preload.mjs', import.meta.url), 'utf8');

test('registra a rota sem usar app.get recursivamente', () => {
  assert.match(source, /app\.route\(ROUTE\)\.get/);
  assert.doesNotMatch(source, /originalGet\.call\(app, ROUTE/);
});

test('mantém a rota somente leitura e possui fallback do último item', () => {
  assert.match(source, /getQueue/);
  assert.match(source, /fallbackToLatest/);
  assert.doesNotMatch(source, /saveQueue|queue\/add|queue\/start|send-controlado/);
});
