import { readFile } from 'node:fs/promises';

const BOT = 'https://bot.achoulevoubot.uk';
const OFFER_FILE = new URL('./ops-julio-20260915.txt', import.meta.url);
const MARKER_FIRST = 'https://s.shopee.com.br/8pln4w4CMf';
const MARKER_LAST = 'https://meli.la/24oYr5U';

async function request(path, options = {}) {
  const response = await fetch(`${BOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}: ${data?.error || text.slice(0, 300)}`);
  }
  return data;
}

const payload = (await readFile(OFFER_FILE, 'utf8')).trim();
const messages = payload.split(/\r?\n---\r?\n/g).map(v => v.trim()).filter(Boolean);
if (messages.length !== 50) throw new Error(`Pacote inválido: ${messages.length} mensagens; esperado 50.`);

const statusBefore = await request('/status');
if (String(statusBefore.status || '').toLowerCase() !== 'conectado') {
  throw new Error(`WhatsApp não conectado. Status atual: ${statusBefore.status || 'desconhecido'}`);
}

const queueBefore = await request('/queue');
const reviewBefore = await request('/queue/review-source');
const pendingBefore = Number(queueBefore?.queue?.pending ?? statusBefore.pendingOffers ?? reviewBefore.pending ?? 0);
const items = Array.isArray(reviewBefore?.items) ? reviewBefore.items : [];
const campaignAlreadyThere = items.some(item => {
  const message = String(item?.message || '');
  return message.includes(MARKER_FIRST) || message.includes(MARKER_LAST);
});

if (pendingBefore > 0 && !campaignAlreadyThere) {
  throw new Error(`Fila possui ${pendingBefore} oferta(s) pendente(s) de outra carga. Abortando para não misturar ou duplicar.`);
}

await request('/settings', {
  method: 'POST',
  body: JSON.stringify({
    enabled: true,
    windowStart: '07:00',
    windowEnd: '21:15',
    intervalMinutes: 95,
    offersPerBatch: 5,
    dailyLimit: 50
  })
});

let added = 0;
if (!campaignAlreadyThere) {
  const addResult = await request('/queue/add', {
    method: 'POST',
    body: JSON.stringify({ text: payload })
  });
  added = Number(addResult?.added || 0);
  if (added !== 50) throw new Error(`Bot adicionou ${added}; esperado 50.`);
}

await request('/queue/start', { method: 'POST', body: JSON.stringify({}) });

const [statusAfter, queueAfter, settingsAfter] = await Promise.all([
  request('/status'),
  request('/queue'),
  request('/settings')
]);

console.log(JSON.stringify({
  ok: true,
  whatsapp: statusAfter.status,
  added,
  campaignAlreadyThere,
  pending: queueAfter?.queue?.pending ?? statusAfter.pendingOffers,
  queueRunning: queueAfter?.queue?.running ?? statusAfter.queueRunning,
  nextRunAt: queueAfter?.queue?.nextRunAt ?? statusAfter.nextRunAt,
  settings: settingsAfter?.settings
}, null, 2));
