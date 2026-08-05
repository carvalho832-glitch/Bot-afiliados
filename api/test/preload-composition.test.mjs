import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-preload-composition-'));
process.env.SHARED_OFFERS_FILE = path.join(tempDir, 'offers.json');
process.env.PHASE24_BATCHES_FILE = path.join(tempDir, 'batches.json');

await import(`../shared-offers-preload.js?composition=${Date.now()}`);
await import(`../phase24-batches-preload.js?composition=${Date.now()}`);
const express = (await import('express')).default;

function startServer() {
  const app = express();
  app.use(express.json());
  app.use(async function finalGatewayProxy(req, res) {
    return res.status(404).json({ ok: false, path: req.originalUrl, proxy: 'GATEWAY_URL' });
  });
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  return { response, body: await response.json() };
}

test('as duas APIs são registradas antes do proxy final', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const sharedHealth = await getJson(`${baseUrl}/shared/offers/health`);
  assert.equal(sharedHealth.response.status, 200);
  assert.equal(sharedHealth.body.ok, true);

  const phaseHealth = await getJson(`${baseUrl}/phase24/batches/health`);
  assert.equal(phaseHealth.response.status, 200);
  assert.equal(phaseHealth.body.ok, true);

  const createdBatch = await getJson(`${baseUrl}/phase24/batches`, {
    method: 'POST',
    body: JSON.stringify({
      profile: 'julio',
      items: [{ title: 'Produto composto', url: 'https://affiliate.shopee.com.br/offer/999' }]
    })
  });
  assert.equal(createdBatch.response.status, 201);
  assert.equal(createdBatch.body.batch.summary.total, 1);

  const createdOffer = await getJson(`${baseUrl}/shared/offers`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Oferta composta',
      link: 'https://s.shopee.com.br/composto',
      message: '🔥 Oferta composta\nhttps://s.shopee.com.br/composto'
    })
  });
  assert.equal(createdOffer.response.status, 201);
  assert.equal(createdOffer.body.offer.title, 'Oferta composta');
});
