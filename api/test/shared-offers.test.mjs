import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achou-levou-shared-'));
process.env.SHARED_OFFERS_FILE = path.join(tempDir, 'offers.json');

await import(`../shared-offers-preload.js?test=${Date.now()}`);
const express = (await import('express')).default;

function startServer() {
  const app = express();
  app.use(express.json());
  app.use(async function finalGatewayProxy(req, res) {
    return res.status(404).json({ ok: false, path: req.originalUrl, proxy: 'GATEWAY_URL' });
  });
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  return { response, body: await response.json() };
}

test('fila compartilhada cria, confirma, evita duplicata e exclui', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const payload = {
    source: 'radar-test',
    sourceId: 'item-123',
    title: 'Produto de teste',
    price: 'R$ 49,90',
    link: 'https://s.shopee.com.br/teste',
    message: '🔥 Produto de teste\n💰 R$ 49,90\nhttps://s.shopee.com.br/teste'
  };

  const created = await json(`${baseUrl}/shared/offers`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.created, true);
  assert.ok(created.body.offer.id);

  const id = created.body.offer.id;
  const verified = await json(`${baseUrl}/shared/offers/${encodeURIComponent(id)}`);
  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.offer.id, id);
  assert.equal(verified.body.offer.sourceId, 'item-123');

  const duplicate = await json(`${baseUrl}/shared/offers`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, price: 'R$ 44,90' })
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.created, false);
  assert.equal(duplicate.body.offer.id, id);
  assert.equal(duplicate.body.offer.price, 'R$ 44,90');

  const list = await json(`${baseUrl}/shared/offers`);
  assert.equal(list.body.count, 1);
  assert.equal(list.body.offers[0].id, id);

  const removed = await json(`${baseUrl}/shared/offers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.body.removed, true);

  const empty = await json(`${baseUrl}/shared/offers`);
  assert.equal(empty.body.count, 0);
});

test('fila compartilhada rejeita oferta sem mensagem ou link', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const missingMessage = await json(`${baseUrl}/shared/offers`, {
    method: 'POST',
    body: JSON.stringify({ link: 'https://s.shopee.com.br/teste' })
  });
  assert.equal(missingMessage.response.status, 400);
  assert.equal(missingMessage.body.ok, false);

  const missingLink = await json(`${baseUrl}/shared/offers`, {
    method: 'POST',
    body: JSON.stringify({ message: 'Oferta' })
  });
  assert.equal(missingLink.response.status, 400);
  assert.equal(missingLink.body.ok, false);
});
