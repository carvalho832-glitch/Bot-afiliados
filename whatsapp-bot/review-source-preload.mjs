import express from 'express';
import { getQueue } from './bot-store.mjs';

const ROUTE = '/queue/review-source';
const originalGet = express.application.get;
let patched = false;

function clean(value = '', max = 20000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function safeItem(item = {}, index = 0) {
  const message = clean(item.message || item.text || item.content || item.body, 20000);
  if (!message) return null;
  return {
    id: clean(item.id || item.offerId || item.queueId || `queue-${index + 1}`, 160),
    status: clean(item.status || item.state || 'pending', 40),
    message,
    category: clean(item.category || item.categoria || 'geral', 80),
    createdAt: clean(item.createdAt || item.criadoEm, 100),
    updatedAt: clean(item.updatedAt || item.atualizadoEm, 100),
    error: clean(item.error, 500) || null
  };
}

function installRoute(app) {
  if (app.locals.__phase24ReviewSourceInstalled) return;
  app.locals.__phase24ReviewSourceInstalled = true;
  originalGet.call(app, ROUTE, (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const queue = getQueue();
    const items = queue
      .map(safeItem)
      .filter(Boolean)
      .filter(item => !['sent', 'enviado', 'completed', 'concluido', 'concluído', 'done'].includes(item.status.toLowerCase()));

    res.json({
      ok: true,
      source: 'whatsapp-bot-queue-file',
      total: queue.length,
      pending: items.length,
      items,
      generatedAt: new Date().toISOString()
    });
  });
  console.log('[REVIEW-SOURCE] Rota segura registrada.', { route: ROUTE });
}

if (!patched) {
  patched = true;
  express.application.get = function phase24ReviewSourceAwareGet(path, ...handlers) {
    if (path !== ROUTE) installRoute(this);
    return originalGet.call(this, path, ...handlers);
  };
}
