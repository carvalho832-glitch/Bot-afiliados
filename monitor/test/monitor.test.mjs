import test from 'node:test';
import assert from 'node:assert/strict';
import { zonedClock, withinWindow, evaluate, summarizeQueue, mayRecover } from '../monitor-core.mjs';

const at = (iso) => Date.parse(iso);
const base = (now) => ({
  pmStatus: 'online', connectionStatus: 'conectado', localError: '', peerError: '',
  queueProcessing: false, holdCount: 0, queue: { pending: 15 },
  runtime: { queueRunning: true, nextRunAt: new Date(now + 5 * 60_000).toISOString() },
  settings: { enabled: true, windowStart: '06:00', windowEnd: '22:00',
    sentToday: 10, dailyLimit: 55, intervalMinutes: 50, lastBatchAt: now - 45 * 60_000 }
});
test('time zone and scheduled pause outside hours', () => {
  assert.deepEqual(zonedClock(new Date('2026-10-29T14:00:00Z')), { date:'2026-10-29', minutes:660 });
  assert.equal(withinWindow(base(at('2026-10-29T14:00:00Z')).settings, at('2026-10-29T14:00:00Z')), true);
  assert.equal(withinWindow(base(0).settings, at('2026-10-30T03:00:00Z')), false);
});
test('separate normal interval from overdue batch', () => {
  const now = at('2026-10-29T14:00:00Z');
  assert.deepEqual(evaluate(base(now), {}, now), []);
  const s = base(now); s.runtime.nextRunAt = new Date(now - 13 * 60_000).toISOString();
  assert.equal(evaluate(s, {}, now).some(x => x.code === 'queue-overdue'), true);
});
test('never mistake normal processing for queue overdue', () => {
  const now = at('2026-10-29T14:00:00Z');
  const s = base(now); s.queueProcessing = true; s.runtime.nextRunAt = new Date(now - 20 * 60_000).toISOString();
  assert.equal(evaluate(s, {processingSince:now-2 * 60_000}, now).length, 0);
  assert.equal(evaluate(s, {processingSince:now-31 * 60_000}, now)[0].code, 'processing-stuck');
});
test('connection and peers fail independently', () => {
  const now = at('2026-10-29T14:00:00Z');
  const s = base(now); s.connectionStatus = 'desconectado'; s.peerError = 'timeout';
  assert.deepEqual(evaluate(s, {}, now).map(x=>x.code), ['whatsapp-offline', 'peer-down']);
});
test('group holds are only a human review alert', () => {
  const now = at('2026-10-29T14:00:00Z');
  const s = base(now); s.holdCount = 2;
  assert.equal(evaluate(s, {}, now)[0].code, 'send-uncertain');
});
test('planned stop not flagged at night; unexpected pause during work is flagged', () => {
  const now = at('2026-10-29T14:00:00Z');
  const s = base(now); s.runtime.queueRunning = false;
  assert.equal(evaluate(s, { previousRunning:true }, now)[0].code, 'queue-paused');
  assert.equal(evaluate(s, { previousRunning:true }, at('2026-10-30T03:00:00Z')).length, 0);
});
test('only stopped PM2 process qualifies for guarded restart', () => {
  const now = at('2026-10-29T14:00:00Z');
  const s = base(now); s.pmStatus = 'stopped';
  const state = { serviceDownSince: now - 4*60_000, lastRestartAt:0, lastProcessing:false };
  assert.equal(mayRecover(s, state, now), true);
  assert.equal(mayRecover({...s,pmStatus:'online'}, state, now), false);
  assert.equal(mayRecover(s, {...state,lastProcessing:true}, now), false);
  assert.equal(mayRecover(s, {...state,lastRestartAt:now-10*60_000}, now), false);
});
test('summary counts individual offer states only', () => {
  assert.deepEqual(summarizeQueue([{status:'pending'}, {status:'partial'}, {status:'sent'}]), {pending:1, partial:1, sent:1});
});
