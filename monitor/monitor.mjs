import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluate, mayRecover, summarizeQueue } from './monitor-core.mjs';

const cfg = {
  name: process.env.BOT_NAME || 'Bot',
  dir: process.env.BOT_DIR || '',
  process: process.env.BOT_PM2_NAME || '',
  url: process.env.BOT_HEALTH_URL || 'http://127.0.0.1:3010/',
  peerUrl: process.env.PEER_HEALTH_URL || '',
  ntfyUrl: process.env.NTFY_URL || '',
  everyMs: Math.max(20_000, Number(process.env.CHECK_SECONDS || 60) * 1000),
  statePath: process.env.MONITOR_STATE || path.join(process.cwd(), 'state.json'),
  autoRecovery: process.env.AUTO_RESTART_STOPPED === '1'
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (fallback !== undefined && error.code === 'ENOENT') return fallback;
    throw new Error('Não foi possível ler ' + path.basename(file) + ': ' + error.message);
  }
}
function readState() {
  try { return readJson(cfg.statePath); }
  catch { return { activeAlerts: {}, firstSeen: {}, processingSince: 0, previousRunning: null,
    lastProcessing: false, lastRestartAt: 0, serviceDownSince: 0 }; }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(cfg.statePath), { recursive: true });
  const tmp = cfg.statePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, cfg.statePath);
}
async function rootStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const json = await response.json();
    if (!json.ok || typeof json.status !== 'string') throw new Error('resposta de health inválida');
    return { status: json.status, processing: Boolean(json.queueProcessing) };
  } catch (error) {
    return { error: String(error.message || error).slice(0,120) };
  }
}
function pmStatus() {
  try {
    const raw = execFileSync('pm2', ['jlist'], { timeout: 6000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const found = JSON.parse(raw).find(p => p.name === cfg.process);
    return found?.pm2_env?.status || 'missing';
  } catch {
    return 'unknown';
  }
}
async function sampleHealth() {
  const dir = path.join(cfg.dir, 'data');
  const [local, peer] = await Promise.all([
    rootStatus(cfg.url),
    cfg.peerUrl ? rootStatus(cfg.peerUrl) : Promise.resolve({ status: 'skipped' })
  ]);
  const sample = {
    pmStatus: pmStatus(), connectionStatus: local.status || 'indisponivel',
    queueProcessing: Boolean(local.processing), localError: local.error || '',
    peerError: peer.error || '',
    settings: {}, runtime: {}, queue: { pending: 0 }, holdCount: 0
  };
  try {
    sample.settings = readJson(path.join(dir, 'settings.json'));
    sample.runtime = readJson(path.join(dir, 'runtime.json'));
    sample.queue = summarizeQueue(readJson(path.join(dir, 'queue.json')));
    const holds = readJson(path.join(dir, 'group-holds.json'), {});
    sample.holdCount = Object.values(holds).filter(hold => hold?.requiresReview).length;
  } catch (error) { sample.localError = sample.localError || error.message; }
  return sample;
}
async function notify(text, severity = 'high') {
  if (!cfg.ntfyUrl) { console.error('[MONITOR] NTFY_URL não configurado. Alerta não entregue:', text); return false; }
  try {
    const result = await fetch(cfg.ntfyUrl, {
      method: 'POST',
      headers: { 'Title': 'Achou Levou | ' + cfg.name, 'Priority': severity === 'high' ? '4' : '3',
        'Tags': severity === 'high' ? 'warning' : 'information', 'Content-Type': 'text/plain; charset=utf-8' },
      body: text, signal: AbortSignal.timeout(8000)
    });
    if (!result.ok) throw new Error('HTTP ' + result.status);
    return true;
  } catch (error) { console.error('[MONITOR] Falha no envio de alerta:', error.message); return false; }
}
let busy = false;
async function check({ dryRun = false } = {}) {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const state = readState();
    const sample = await sampleHealth();
    if (sample.queueProcessing) state.processingSince ||= now;
    else state.processingSince = 0;
    if (sample.pmStatus !== 'online' || sample.localError) state.serviceDownSince ||= now;
    else state.serviceDownSince = 0;
    const issues = evaluate(sample, state, now);
    const present = new Set(issues.map(x => x.code));
    for (const issue of issues) {
      state.firstSeen[issue.code] ||= now;
      const minChecks = issue.code === 'send-uncertain' ? 1 : 3;
      const countName = issue.code + ':count';
      state[countName] = Number(state[countName] || 0) + 1;
      if (state[countName] < minChecks) continue;
      const last = Number(state.activeAlerts[issue.code] || 0);
      if (!last || now - last >= 60 * 60_000) {
        if (!dryRun && await notify('🚨 ' + issue.message, issue.severity)) {
          state.activeAlerts[issue.code] = now;
        }
      }
    }
    for (const [code, timestamp] of Object.entries(state.activeAlerts)) {
      if (!present.has(code)) {
        if (!dryRun && await notify('✅ Situação normalizada: ' + code, 'info')) delete state.activeAlerts[code];
      }
    }
    for (const code of ['service-down','whatsapp-offline','peer-down','send-uncertain','processing-stuck','queue-overdue','queue-paused']) {
      if (!present.has(code)) { delete state.firstSeen[code]; delete state[code + ':count']; }
    }
    if (cfg.autoRecovery && mayRecover(sample, state, now) && !dryRun) {
      try {
        execFileSync('pm2', ['restart', cfg.process], { timeout: 15000, stdio: 'ignore' });
        state.lastRestartAt = now;
        await notify('🔧 PM2 estava parado. Reinício controlado solicitado. Fila não foi alterada.', 'warning');
      } catch (error) { console.error('[MONITOR] Não foi possível reiniciar PM2:', error.message); }
    }
    state.previousRunning = Boolean(sample.runtime.queueRunning);
    state.lastProcessing = Boolean(sample.queueProcessing);
    state.lastCheckAt = new Date(now).toISOString();
    state.lastSnapshot = {
      pm2: sample.pmStatus, whatsapp: sample.connectionStatus,
      pending: sample.queue.pending, partial: sample.queue.partial,
      queueRunning: state.previousRunning, processing: sample.queueProcessing,
      groupHolds: sample.holdCount, peerReachable: !sample.peerError,
      activeIssues: issues.map(x => x.code)
    };
    if (!dryRun) saveState(state);
    console.log('[MONITOR]', cfg.name, state.lastCheckAt, JSON.stringify(state.lastSnapshot),
      dryRun ? '(simulação; sem persistência nem alertas)' : '');
    return { state, issues };
  } finally { busy = false; }
}
if (process.argv.includes('--test-alert')) {
  const ok = await notify('✅ Teste de notificação Android: monitor da ' + cfg.name + ' conectado.', 'info');
  process.exitCode = ok ? 0 : 1;
} else if (process.argv.includes('--dry-run')) {
  const result = await check({ dryRun: true });
  if (result.issues.length) console.log('[SIMULAÇÃO] Alertas potenciais:', result.issues.map(x => x.code).join(', '));
} else {
  if (!cfg.dir || !cfg.process) throw new Error('Configure BOT_DIR e BOT_PM2_NAME');
  await check();
  setInterval(() => check().catch(error => console.error('[MONITOR] Erro na checagem:', error.message)), cfg.everyMs);
}