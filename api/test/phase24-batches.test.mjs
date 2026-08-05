import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-phase24-'));
process.env.PHASE24_BATCHES_FILE = path.join(tempDir, 'batches.json');

await import(`../phase24-batches-preload.js?test=${Date.now()}`);
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

test('Fase 24 cria lote, filtra duplicata e registra decisões', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const payload = {
    profile: 'julio',
    sourceUrl: 'https://affiliate.shopee.com.br/offer/product_offer',
    filters: { maxItems: 15, minSold: 50, minRating: 4.6 },
    items: [
      {
        title: 'Air Fryer 4 litros',
        url: 'https://affiliate.shopee.com.br/offer/product/123',
        priceText: 'R$ 299,90',
        priceValue: 299.9,
        soldCount: 1200,
        rating: 4.8
      },
      {
        title: 'Air Fryer 4 litros',
        url: 'https://affiliate.shopee.com.br/offer/product/123',
        priceText: 'R$ 299,90'
      },
      {
        title: 'Kit de panelas',
        url: 'https://affiliate.shopee.com.br/offer/product/456',
        priceText: 'R$ 189,00',
        soldCount: 400,
        rating: 4.7
      }
    ]
  };

  const created = await json(`${baseUrl}/phase24/batches`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.batch.summary.total, 2);
  assert.equal(created.body.batch.summary.pending, 2);
  assert.equal(created.body.batch.profile, 'julio');

  const batch = created.body.batch;
  const first = batch.items[0];
  const approved = await json(`${baseUrl}/phase24/batches/${batch.id}/items/${first.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ decision: 'approved', reason: 'Passou nos filtros' })
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.item.decision, 'approved');
  assert.equal(approved.body.batch.summary.approved, 1);

  const second = batch.items[1];
  const finalized = await json(`${baseUrl}/phase24/batches/${batch.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'approved',
      decisions: [{ id: second.id, decision: 'rejected', reason: 'Fora do nicho' }]
    })
  });
  assert.equal(finalized.response.status, 200);
  assert.equal(finalized.body.batch.status, 'approved');
  assert.equal(finalized.body.batch.summary.approved, 1);
  assert.equal(finalized.body.batch.summary.rejected, 1);

  const current = await json(`${baseUrl}/phase24/batches?profile=julio&current=1`);
  assert.equal(current.response.status, 200);
  assert.equal(current.body.batch.id, batch.id);
  assert.equal(current.body.batch.status, 'approved');
});

test('novo lote arquiva o rascunho anterior do mesmo perfil', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const create = title => json(`${baseUrl}/phase24/batches`, {
    method: 'POST',
    body: JSON.stringify({
      profile: 'renata',
      items: [{ title, url: `https://affiliate.shopee.com.br/offer/${encodeURIComponent(title)}` }]
    })
  });

  const first = await create('Produto A');
  const second = await create('Produto B');
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);

  const list = await json(`${baseUrl}/phase24/batches?profile=renata`);
  assert.equal(list.body.count, 2);
  assert.equal(list.body.batches[0].status, 'draft');
  assert.equal(list.body.batches[1].status, 'archived');
});

test('Fase 24 rejeita lote sem produtos válidos', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const invalid = await json(`${baseUrl}/phase24/batches`, {
    method: 'POST',
    body: JSON.stringify({ profile: 'julio', items: [{ title: 'Sem URL' }] })
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.ok, false);
});
