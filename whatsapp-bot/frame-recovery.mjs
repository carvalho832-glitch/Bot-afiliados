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
  const text = errorText(error);
  return Boolean(text) && CONTEXT_ERROR_PATTERNS.some(pattern => pattern.test(text));
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
