import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-phase24-reviews-'));
process.env.PHASE24_REVIEWS_FILE = path.join(tempDir, 'reviews.json');

await import(`../phase24-reviews-preload.js?test=${Date.now()}`);
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

test('revisão persiste aprovação, rejeição e envio por lote', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const approve = await json(`${baseUrl}/phase24/reviews/item-1`, {
    method: 'PATCH',
    body: JSON.stringify({ batchId: 'batch-1', offerId: 'offer-1', status: 'approved' })
  });
  assert.equal(approve.response.status, 200);
  assert.equal(approve.body.ok, true);
  assert.equal(approve.body.review.status, 'approved');
  assert.equal(approve.body.summary.approved, 1);

  const reject = await json(`${baseUrl}/phase24/reviews/item-2`, {
    method: 'PATCH',
    body: JSON.stringify({ batchId: 'batch-1', offerId: 'offer-2', status: 'rejected' })
  });
  assert.equal(reject.response.status, 200);
  assert.equal(reject.body.review.status, 'rejected');
  assert.equal(reject.body.summary.rejected, 1);

  const sent = await json(`${baseUrl}/phase24/reviews/item-1`, {
    method: 'PATCH',
    body: JSON.stringify({ batchId: 'batch-1', offerId: 'offer-1', status: 'sent' })
  });
  assert.equal(sent.response.status, 200);
  assert.equal(sent.body.review.status, 'sent');
  assert.ok(sent.body.review.sentAt);

  const list = await json(`${baseUrl}/phase24/reviews?batchId=batch-1`);
  assert.equal(list.response.status, 200);
  assert.equal(list.body.reviews.length, 2);
  assert.equal(list.body.summary.sent, 1);
  assert.equal(list.body.summary.rejected, 1);
  assert.equal(list.body.summary.pending, 0);
});

test('revisão valida lote, produto e status', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const missingBatch = await json(`${baseUrl}/phase24/reviews/item-1`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved' })
  });
  assert.equal(missingBatch.response.status, 400);

  const missingSource = await json(`${baseUrl}/phase24/reviews/`, {
    method: 'PATCH',
    body: JSON.stringify({ batchId: 'batch-1', status: 'approved' })
  });
  assert.equal(missingSource.response.status, 404);

  const invalidStatus = await json(`${baseUrl}/phase24/reviews/item-3`, {
    method: 'PATCH',
    body: JSON.stringify({ batchId: 'batch-1', status: 'qualquer-coisa' })
  });
  assert.equal(invalidStatus.response.status, 200);
  assert.equal(invalidStatus.body.review.status, 'pending');

  const missingQuery = await json(`${baseUrl}/phase24/reviews`);
  assert.equal(missingQuery.response.status, 400);
});
