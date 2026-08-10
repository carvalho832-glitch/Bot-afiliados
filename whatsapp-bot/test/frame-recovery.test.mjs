import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrowserOperationTimeoutError,
  createBrowserRestartGate,
  isBrowserOperationTimeout,
  isRecoverableBrowserContextError,
  withBrowserOperationTimeout
} from '../frame-recovery.mjs';

test('reconhece erros de frame e contexto do Puppeteer', () => {
  const messages = [
    "Attempted to use detached Frame 'ABC123'.",
    'Error: Navigating frame was detached',
    'Execution context was destroyed, most likely because of a navigation.',
    'Protocol error: Target closed'
  ];

  for (const message of messages) {
    assert.equal(isRecoverableBrowserContextError(new Error(message)), true, message);
  }
});

test('reconhece erro recuperável dentro de cause', () => {
  const wrapped = new Error('Falha ao carregar grupos', {
    cause: new Error("Attempted to use detached Frame 'ABC123'.")
  });
  assert.equal(isRecoverableBrowserContextError(wrapped), true);
});

test('não reinicia para falhas comuns de negócio ou API', () => {
  assert.equal(isRecoverableBrowserContextError(new Error('Nenhum grupo selecionado.')), false);
  assert.equal(isRecoverableBrowserContextError(new Error('Shopee indisponível.')), false);
});

test('encerra operação travada e classifica o timeout como recuperável', async () => {
  let error = null;

  try {
    await withBrowserOperationTimeout(new Promise(() => {}), 5, 'leitura dos grupos');
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof BrowserOperationTimeoutError);
  assert.equal(error.code, 'BROWSER_OPERATION_TIMEOUT');
  assert.equal(isBrowserOperationTimeout(error), true);
  assert.equal(isRecoverableBrowserContextError(error), true);
  assert.match(error.message, /leitura dos grupos/);
});

test('mantém o resultado quando a operação termina antes do limite', async () => {
  const result = await withBrowserOperationTimeout(Promise.resolve('grupos-ok'), 50, 'leitura dos grupos');
  assert.equal(result, 'grupos-ok');
});

test('agenda somente um reinício e usa código de saída 1', () => {
  const timers = [];
  const exits = [];
  let beforeCount = 0;
  const gate = createBrowserRestartGate({
    delayMs: 1234,
    setTimer(fn, delay) {
      timers.push({ fn, delay });
      return { unref() {} };
    },
    exit(code) {
      exits.push(code);
    }
  });

  const error = new Error('Execution context was destroyed');
  assert.equal(gate.schedule(error, () => { beforeCount += 1; }), true);
  assert.equal(gate.schedule(error, () => { beforeCount += 1; }), true);
  assert.equal(gate.isScheduled(), true);
  assert.equal(beforeCount, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 1234);

  timers[0].fn();
  assert.deepEqual(exits, [1]);
});
