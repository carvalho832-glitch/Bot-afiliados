export function zonedClock(now = new Date(), zone = 'America/Sao_Paulo') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(x => [x.type, x.value]));
  return { date: p.year + '-' + p.month + '-' + p.day, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function minutes(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function withinWindow(settings = {}, now = Date.now()) {
  if (!settings.enabled) return false;
  const clock = zonedClock(new Date(now));
  if (settings.cycles?.enabled) {
    if (settings.cycles.runDate && settings.cycles.runDate !== clock.date) return false;
    return (settings.cycles.windows || []).some(win => {
      const start = minutes(win.start), end = minutes(win.end);
      return start !== null && end !== null && clock.minutes >= start && clock.minutes < end;
    });
  }
  const start = minutes(settings.windowStart), end = minutes(settings.windowEnd);
  if (start === null || end === null) return false;
  return start <= end
    ? clock.minutes >= start && clock.minutes < end
    : clock.minutes >= start || clock.minutes < end;
}

export function evaluate(sample, state = {}, now = Date.now()) {
  const issues = [];
  const add = (code, message, severity = 'high') => issues.push({ code, message, severity });
  const queue = sample.queue || {};
  const settings = sample.settings || {};
  const runtime = sample.runtime || {};
  const active = withinWindow(settings, now) && Number(settings.sentToday || 0) < Number(settings.dailyLimit || 100000);
  if (sample.pmStatus !== 'online' || sample.localError) {
    add('service-down', 'Processo WhatsApp ou API local indisponível. Verificar PM2 e conexão.');
  } else if (sample.connectionStatus !== 'conectado') {
    add('whatsapp-offline', 'WhatsApp Web desconectado ou aguardando reconexão. Verificar sessão.');
  }
  if (sample.peerError) {
    add('peer-down', 'A outra VM não respondeu ao teste externo. Pode ser queda do servidor ou túnel.');
  }
  if (sample.holdCount > 0) {
    add('send-uncertain', String(sample.holdCount) + ' grupo(s) com envio incerto exigindo revisão manual. Não repetir ofertas automaticamente.', 'warning');
  }
  if (sample.queueProcessing && state.processingSince && now - state.processingSince > 30 * 60_000) {
    add('processing-stuck', 'Envio marcado como em processamento há mais de 30 minutos. Não reiniciar nem reenviar automaticamente.');
  }
  if (runtime.queueRunning && queue.pending > 0 && active && !sample.queueProcessing &&
      !sample.localError && sample.connectionStatus === 'conectado' && sample.pmStatus === 'online') {
    const planned = Date.parse(runtime.nextRunAt || '');
    const intervalMs = Number(settings.intervalMinutes || 60) * 60_000;
    const fallback = Number(settings.lastBatchAt || 0) > 0 ? Number(settings.lastBatchAt) + intervalMs : NaN;
    const due = Number.isFinite(planned) ? planned : fallback;
    if (Number.isFinite(due) && now > due + 12 * 60_000) {
      add('queue-overdue', 'Fila com ' + queue.pending + ' ofertas pendentes, acima de 12 minutos do próximo lote previsto.');
    }
  }
  if (state.previousRunning === true && runtime.queueRunning === false && active && queue.pending > 0) {
    add('queue-paused', 'A fila foi pausada com ' + queue.pending + ' ofertas pendentes. Conferir se a pausa foi intencional.', 'warning');
  }
  return issues;
}

export function summarizeQueue(items = []) {
  return {
    pending: items.filter(item => item.status === 'pending').length,
    partial: items.filter(item => item.status === 'partial').length,
    sent: items.filter(item => item.status === 'sent').length
  };
}

export function mayRecover(sample, state, now = Date.now()) {
  return Boolean(sample.pmStatus === 'stopped' || sample.pmStatus === 'errored') &&
    !sample.queueProcessing && !state.lastProcessing &&
    Number(state.serviceDownSince || 0) > 0 &&
    now - state.serviceDownSince > 3 * 60_000 &&
    now - Number(state.lastRestartAt || 0) > 60 * 60_000;
}