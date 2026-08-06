import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-autopilot-'));
process.env.PHASE24_AUTOPILOT_FILE = path.join(tempDir, 'autopilot.json');

await import(`../phase24-autopilot-preload.js?test=${Date.now()}`);
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

test('autopiloto só conclui depois de ofertas salvas e verificadas', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const created = await json(`${baseUrl}/phase24/autopilot/runs`, {
    method: 'POST',
    body: JSON.stringify({ profile: 'julio', target: 2, filters: { keywords: 'casa' } })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.run.target, 2);
  assert.equal(created.body.run.successCount, 0);

  const runId = created.body.run.id;
  const candidates = await json(`${baseUrl}/phase24/autopilot/runs/${runId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'running',
      stage: 'link',
      appendItems: [
        { title: 'Produto A', url: 'https://affiliate.shopee.com.br/offer/a' },
        { title: 'Produto B', url: 'https://affiliate.shopee.com.br/offer/b' },
        { title: 'Produto C', url: 'https://affiliate.shopee.com.br/offer/c' }
      ]
    })
  });
  assert.equal(candidates.body.run.summary.candidates, 3);
  const [first, second, third] = candidates.body.run.items;

  const linkOnly = await json(`${baseUrl}/phase24/autopilot/runs/${runId}/items/${first.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stage: 'affiliate-ready', affiliateUrl: 'https://s.shopee.com.br/a' })
  });
  assert.equal(linkOnly.body.run.successCount, 0);
  assert.equal(linkOnly.body.run.status, 'running');

  const failed = await json(`${baseUrl}/phase24/autopilot/runs/${runId}/items/${second.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stage: 'failed-link', lastError: 'link indisponível' })
  });
  assert.equal(failed.body.run.failureCount, 1);
  assert.equal(failed.body.run.successCount, 0);

  const savedOne = await json(`${baseUrl}/phase24/autopilot/runs/${runId}/items/${first.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      stage: 'saved-verified',
      savedOfferId: 'offer-a',
      message: 'Mensagem A https://s.shopee.com.br/a'
    })
  });
  assert.equal(savedOne.body.run.successCount, 1);
  assert.equal(savedOne.body.run.status, 'running');

  const savedTwo = await json(`${baseUrl}/phase24/autopilot/runs/${runId}/items/${third.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      stage: 'saved-verified',
      savedOfferId: 'offer-c',
      message: 'Mensagem C https://s.shopee.com.br/c'
    })
  });
  assert.equal(savedTwo.body.run.successCount, 2);
  assert.equal(savedTwo.body.run.failureCount, 1);
  assert.equal(savedTwo.body.run.status, 'completed');
  assert.equal(savedTwo.body.run.stage, 'completed');
});

test('nova execução cancela somente a execução ativa do mesmo perfil', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const create = profile => json(`${baseUrl}/phase24/autopilot/runs`, {
    method: 'POST',
    body: JSON.stringify({ profile, target: 5 })
  });

  const first = await create('renata');
  await create('julio');
  const second = await create('renata');
  assert.notEqual(first.body.run.id, second.body.run.id);

  const active = await json(`${baseUrl}/phase24/autopilot/runs?active=1`);
  assert.equal(active.body.run.id, second.body.run.id);
  assert.equal(active.body.run.profile, 'renata');

  const list = await json(`${baseUrl}/phase24/autopilot/runs?profile=renata`);
  assert.equal(list.body.runs[0].status, 'ready');
  assert.equal(list.body.runs[1].status, 'cancelled');
});
