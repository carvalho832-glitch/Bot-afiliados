import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const integrationSource = await readFile(new URL('../../bot-queue-integration.js', import.meta.url), 'utf8');
const proxySource = await readFile(new URL('../../bot-queue-proxy.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');

function storageStub() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

test('polling usa a leitura pública substituída pela ponte do Render', async () => {
  const documentListeners = new Map();
  const intervalCallbacks = [];
  const document = {
    hidden: false,
    addEventListener(type, callback) {
      documentListeners.set(type, callback);
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    }
  };
  const window = {
    addEventListener() {},
    dispatchEvent() {},
    location: { href: 'https://example.test/', search: '' },
    open() {}
  };

  vm.runInNewContext(integrationSource, {
    AbortController,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    URL,
    URLSearchParams,
    clearInterval() {},
    clearTimeout,
    console,
    document,
    fetch() {
      throw new Error('A leitura direta antiga não deveria ser chamada.');
    },
    localStorage: storageStub(),
    setInterval(callback) {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    },
    setTimeout,
    window
  });

  const bridgeCalls = [];
  window.AchouLevouBotQueue.getOverview = options => {
    bridgeCalls.push(options);
    return Promise.resolve({ ok: true });
  };

  documentListeners.get('DOMContentLoaded')();
  assert.equal(bridgeCalls.length, 1);

  intervalCallbacks[0]();
  assert.equal(bridgeCalls.length, 2);
  assert.equal(bridgeCalls[1].force, true);
});

test('falha temporária mantém o último status e se recupera sozinha', async () => {
  const elements = new Map([
    ['bot-status-pill', { dataset: {}, textContent: '', title: '' }],
    ['bot-status-text', { textContent: '' }]
  ]);
  const events = [];
  const timers = [];
  let timerId = 0;
  let fetchCalls = 0;

  const goodPayload = {
    ok: true,
    apiOnline: true,
    statusOk: true,
    queueOk: true,
    status: { status: 'conectado' },
    queue: { total: 25, pending: 19, sent: 6, running: true }
  };

  const responses = [
    goodPayload,
    new Error('oscilação temporária'),
    { ...goodPayload, queue: { ...goodPayload.queue, pending: 18, sent: 7 } }
  ];

  const queueApi = {
    loadConfig: () => ({ profileId: 'julio', profileLabel: 'Júlio' }),
    getOverview: async () => null,
    checkBotStatus: async () => null,
    sendMessages: async () => null,
    interpretBotStatus(status) {
      return status?.status === 'conectado'
        ? { label: 'Conectado', state: 'ok', connected: true, explicit: true }
        : { label: 'Offline', state: 'error', connected: false, explicit: true };
    }
  };
  const window = {
    AchouLevouBotQueue: queueApi,
    dispatchEvent(event) {
      events.push(event);
    }
  };
  const document = {
    hidden: false,
    getElementById(id) {
      return elements.get(id) || null;
    }
  };

  const context = {
    AbortController,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    URLSearchParams,
    clearTimeout(id) {
      const timer = timers.find(item => item.id === id);
      if (timer) timer.cleared = true;
    },
    console,
    document,
    async fetch() {
      const response = responses[fetchCalls++];
      if (response instanceof Error) throw response;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(response)
      };
    },
    setTimeout(callback, delay) {
      const timer = { id: ++timerId, callback, delay, cleared: false };
      timers.push(timer);
      return timer.id;
    },
    window
  };

  vm.runInNewContext(proxySource, context);

  const first = await window.AchouLevouBotQueue.getOverview({ force: true });
  assert.equal(first.stale, false);
  assert.equal(elements.get('bot-status-text').textContent, 'Conectado');

  const temporaryFailure = await window.AchouLevouBotQueue.getOverview({ force: true });
  assert.equal(temporaryFailure.stale, true);
  assert.equal(temporaryFailure.statusOk, true);
  assert.equal(temporaryFailure.queueOk, true);
  assert.equal(temporaryFailure.queue.sent, 6);
  assert.equal(elements.get('bot-status-text').textContent, 'Conectado');

  const recovery = timers.find(timer => timer.delay === 1500 && !timer.cleared);
  assert.ok(recovery, 'a recuperação rápida deve ser agendada');
  recovery.callback();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(fetchCalls, 3);
  assert.equal(elements.get('bot-status-text').textContent, 'Conectado');
  const overviewEvents = events.filter(event => event.type === 'achoulevou:bot-overview');
  assert.equal(overviewEvents.at(-1).detail.stale, false);
  assert.equal(overviewEvents.at(-1).detail.queue.sent, 7);
});

test('service worker não redireciona mais para a integração antiga', () => {
  assert.doesNotMatch(workerSource, /new URL\('\.\/bot-queue-integration-v83\.js'/);
  assert.match(workerSource, /achou-levou-v87-status/);
});
