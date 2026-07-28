import {
  getSettings,
  saveSettings,
  getRuntime,
  saveRuntime,
  getQueue,
  getBlockReason
} from './bot-store.mjs';
import {
  getConnectionState,
  processQueue
} from './bot-engine.mjs';

const WATCHDOG_INTERVAL_MS = Math.max(
  5000,
  Number(process.env.QUEUE_WATCHDOG_INTERVAL_MS || 5000)
);
const SCHEDULE_MATCH_TOLERANCE_MS = 5000;
const MAX_BATCH_DRIFT_MS = 30 * 60000;

let watchdogTimer = null;
let watchdogChecking = false;

function corrigirDerivaDoAgendamento(runtime, settings) {
  const result = String(runtime.lastCycleResult || '');
  const cycleStartedAt = Date.parse(runtime.lastCycleAt || '');
  const scheduledAt = Date.parse(runtime.nextRunAt || '');
  const batchEndedAt = Number(settings.lastBatchAt || 0);
  const intervalMs = Number(settings.intervalMinutes || 0) * 60000;

  if (!result.startsWith('Lote concluído:')) return settings;
  if (!Number.isFinite(cycleStartedAt) || !Number.isFinite(scheduledAt)) return settings;
  if (!Number.isFinite(batchEndedAt) || batchEndedAt <= 0 || intervalMs <= 0) return settings;

  // O motor antigo marcava o intervalo a partir do fim do lote. Como cada envio
  // leva alguns segundos por grupo, esse atraso se acumulava e empurrava o último
  // lote para fora da janela. Só corrigimos quando o próximo horário gravado
  // corresponde exatamente a "fim do lote + intervalo", evitando interferir em
  // envios manuais ou em qualquer outro reagendamento.
  const expectedFromBatchEnd = batchEndedAt + intervalMs;
  const matchesOldSchedule = Math.abs(scheduledAt - expectedFromBatchEnd) <= SCHEDULE_MATCH_TOLERANCE_MS;
  const driftMs = batchEndedAt - cycleStartedAt;

  if (!matchesOldSchedule || driftMs < 1000 || driftMs > MAX_BATCH_DRIFT_MS) return settings;

  const correctedSettings = saveSettings({ lastBatchAt: cycleStartedAt });
  const correctedNextAt = cycleStartedAt + intervalMs;
  saveRuntime({
    nextRunAt: new Date(Math.max(Date.now() + 250, correctedNextAt)).toISOString()
  });

  console.log(`[WATCHDOG] Deriva corrigida em ${Math.round(driftMs / 1000)}s. Próximo lote ancorado no início do lote anterior.`);
  return correctedSettings;
}

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

      let settings = getSettings();
      settings = corrigirDerivaDoAgendamento(runtime, settings);

      const blockReason = getBlockReason(connection.status, settings);
      if (blockReason) return;

      // Quando as configurações mudam ou o temporizador antigo ainda aponta para
      // o horário calculado a partir do fim do lote, o watchdog usa o horário já
      // corrigido e aciona o ciclo assim que ele fica realmente liberado.
      console.log('[WATCHDOG] Fila liberada e pendente. Acionando novo ciclo.');
      await processQueue();
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
