import {
  getSettings,
  getRuntime,
  getQueue,
  getBlockReason
} from './bot-store.mjs';
import {
  getConnectionState,
  processQueue
} from './bot-engine.mjs';

const WATCHDOG_INTERVAL_MS = Math.max(
  5000,
  Number(process.env.QUEUE_WATCHDOG_INTERVAL_MS || 15000)
);

let watchdogTimer = null;
let watchdogChecking = false;

export function startQueueWatchdog() {
  if (watchdogTimer) return watchdogTimer;

  watchdogTimer = setInterval(async () => {
    if (watchdogChecking) return;
    watchdogChecking = true;

    try {
      const runtime = getRuntime();
      if (!runtime.queueRunning) return;

      const connection = getConnectionState();
      if (connection.queueProcessing) return;

      const queue = getQueue();
      if (!queue.some(item => item.status === 'pending')) return;

      const settings = getSettings();
      const blockReason = getBlockReason(connection.status, settings);
      if (blockReason) return;

      const nextRunAtMs = runtime.nextRunAt ? Date.parse(runtime.nextRunAt) : 0;
      const timerStale = !Number.isFinite(nextRunAtMs) || nextRunAtMs <= Date.now() + WATCHDOG_INTERVAL_MS;

      if (timerStale) {
        console.log('[WATCHDOG] Fila liberada e pendente. Acionando novo ciclo.');
        await processQueue();
      }
    } catch (error) {
      console.error('[WATCHDOG] Falha ao verificar fila:', error?.stack || error);
    } finally {
      watchdogChecking = false;
    }
  }, WATCHDOG_INTERVAL_MS);

  watchdogTimer.unref?.();
  console.log(`[WATCHDOG] Ativo a cada ${Math.round(WATCHDOG_INTERVAL_MS / 1000)} segundo(s).`);
  return watchdogTimer;
}
