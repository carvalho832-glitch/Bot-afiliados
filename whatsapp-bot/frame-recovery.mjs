const CONTEXT_ERROR_PATTERNS = [
  /attempted to use detached frame/i,
  /navigating frame was detached/i,
  /detached frame/i,
  /execution context was destroyed/i,
  /cannot find context with specified id/i,
  /most likely because of a navigation/i,
  /target closed/i,
  /session closed/i
];

const BROWSER_OPERATION_TIMEOUT_CODE = 'BROWSER_OPERATION_TIMEOUT';

export class BrowserOperationTimeoutError extends Error {
  constructor(operation = 'operação', timeoutMs = 0) {
    const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 1);
    const seconds = Math.max(1, Math.ceil(safeTimeoutMs / 1000));
    super(`Tempo limite de ${seconds}s na ${operation} do WhatsApp Web.`);
    this.name = 'BrowserOperationTimeoutError';
    this.code = BROWSER_OPERATION_TIMEOUT_CODE;
    this.operation = operation;
    this.timeoutMs = safeTimeoutMs;
  }
}

function errorChainSome(error, predicate) {
  const seen = new Set();
  let current = error;

  for (let depth = 0; current != null && depth < 6; depth += 1) {
    if (typeof current !== 'object' || seen.has(current)) return false;
    seen.add(current);
    if (predicate(current)) return true;
    current = current.cause;
  }

  return false;
}

function errorText(error) {
  const parts = [];
  const seen = new Set();
  let current = error;

  for (let depth = 0; current != null && depth < 6; depth += 1) {
    if (typeof current === 'string') {
      parts.push(current);
      break;
    }
    if (typeof current !== 'object' || seen.has(current)) break;
    seen.add(current);
    if (current.name) parts.push(String(current.name));
    if (current.message) parts.push(String(current.message));
    if (current.stack) parts.push(String(current.stack));
    current = current.cause;
  }

  return parts.join('\n');
}

export function isRecoverableBrowserContextError(error) {
  if (isBrowserOperationTimeout(error)) return true;
  const text = errorText(error);
  return Boolean(text) && CONTEXT_ERROR_PATTERNS.some(pattern => pattern.test(text));
}

export function isBrowserOperationTimeout(error) {
  return errorChainSome(error, current => (
    current.code === BROWSER_OPERATION_TIMEOUT_CODE ||
    current.name === 'BrowserOperationTimeoutError'
  ));
}

export function withBrowserOperationTimeout(promise, timeoutMs, operation = 'operação') {
  const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 1);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback(value);
    };

    timer = setTimeout(() => {
      finish(reject, new BrowserOperationTimeoutError(operation, safeTimeoutMs));
    }, safeTimeoutMs);

    Promise.resolve(promise).then(
      value => finish(resolve, value),
      error => finish(reject, error)
    );
  });
}

export function createBrowserRestartGate({
  delayMs = 2000,
  setTimer = setTimeout,
  exit = code => process.exit(code)
} = {}) {
  let scheduled = false;

  return {
    schedule(error, beforeRestart = () => {}) {
      if (!isRecoverableBrowserContextError(error)) return false;
      if (scheduled) return true;
      scheduled = true;
      beforeRestart(error);
      const timer = setTimer(() => exit(1), Math.max(0, Number(delayMs) || 0));
      timer?.unref?.();
      return true;
    },
    isScheduled() {
      return scheduled;
    }
  };
}
