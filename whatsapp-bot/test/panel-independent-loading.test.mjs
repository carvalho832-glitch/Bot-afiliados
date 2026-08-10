import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const panelSource = await readFile(new URL('../panel.html', import.meta.url), 'utf8');
const inlineScript = panelSource.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1] || '';

function createElement() {
  return {
    checked: false,
    className: '',
    innerHTML: '',
    style: {},
    textContent: '',
    value: '',
    appendChild() {},
    append() {},
    closest() { return null; },
    querySelector() { return null; }
  };
}

test('status e fila carregam mesmo quando a leitura dos grupos trava', async () => {
  assert.ok(inlineScript, 'script principal do painel não encontrado');

  const elementIds = [
    'statusPill', 'statusResumo', 'enabled', 'windowStart', 'windowEnd',
    'intervalMinutes', 'offersPerBatch', 'dailyLimit', 'configResultado',
    'metricFila', 'metricFilaDetalhe', 'metricHoje', 'metricHojeDetalhe',
    'metricProgresso', 'metricCountdown', 'metricCountdownDetalhe',
    'queueState', 'progressWrap', 'progressBar', 'progressPercent',
    'progressText', 'queueList', 'filaResultado', 'gruposLista', 'gruposResumo'
  ];
  const elements = new Map(elementIds.map(id => [id, createElement()]));
  const fetchCalls = [];
  const intervals = [];
  let timerId = 0;

  const settings = {
    enabled: true,
    selectedGroups: [
      { id: 'grupo-1@g.us', name: 'Grupo 1', category: 'geral' }
    ],
    groupCategories: { 'grupo-1@g.us': 'geral' },
    windowStart: '11:05',
    windowEnd: '22:30',
    intervalMinutes: 50,
    offersPerBatch: 3,
    dailyLimit: 40,
    sentToday: 9
  };

  const queue = {
    total: 40,
    pending: 31,
    sent: 9,
    error: 0,
    running: true,
    processing: true,
    blockReason: null,
    nextRunAt: null,
    serverTime: '10/08/2026, 20:37:54',
    sentToday: 9,
    dailyLimit: 40,
    tracking: {},
    items: []
  };

  const context = {
    AbortController,
    Date,
    clearInterval() {},
    clearTimeout() {},
    confirm() { return false; },
    console,
    document: {
      createElement,
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
      },
      querySelectorAll() {
        return [];
      }
    },
    async fetch(url) {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/groups')) return new Promise(() => {});
      if (url === '/settings') return { ok: true, json: async () => ({ ok: true, settings }) };
      if (url === '/status') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            status: 'conectado',
            serverTime: queue.serverTime,
            queueRunning: true,
            blockReason: null,
            pendingOffers: 31
          })
        };
      }
      if (url === '/queue') return { ok: true, json: async () => ({ ok: true, queue }) };
      throw new Error(`URL inesperada: ${url}`);
    },
    setInterval(callback, delay) {
      intervals.push({ callback, delay });
      return intervals.length;
    },
    setTimeout() {
      timerId += 1;
      return timerId;
    }
  };

  vm.runInNewContext(inlineScript, context);
  for (let attempt = 0; attempt < 8; attempt += 1) await Promise.resolve();

  assert.ok(fetchCalls.some(url => url.startsWith('/groups')));
  assert.equal(elements.get('statusPill').textContent, 'conectado');
  assert.match(elements.get('statusResumo').textContent, /Pendentes: 31/);
  assert.equal(elements.get('metricFila').textContent, 'Rodando');
  assert.equal(elements.get('metricHoje').textContent, '9/40');
  assert.equal(elements.get('enabled').checked, true);
  assert.equal(intervals.length, 3);
});
