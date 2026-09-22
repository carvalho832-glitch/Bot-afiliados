import test from 'node:test';
import assert from 'node:assert/strict';
import { createVmControllerProxyMiddleware } from '../vm-controller-proxy-preload.js';

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

function req(method, path, token = '') {
  return {
    method,
    path,
    url: path,
    headers: token ? { authorization: `Bearer ${token}` } : {}
  };
}

test('returns 503 while controller is not configured', async () => {
  const middleware = createVmControllerProxyMiddleware({ env: {}, fetchImpl: async () => { throw new Error('should not fetch'); } });
  const res = makeRes();
  await middleware(req('GET', '/admin/vm/status'), res, () => {});
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'vm_controller_not_configured');
});

test('requires a bearer token before proxying', async () => {
  const middleware = createVmControllerProxyMiddleware({
    env: { VM_CONTROLLER_URL: 'https://controller.example' },
    fetchImpl: async () => { throw new Error('should not fetch'); }
  });
  const res = makeRes();
  await middleware(req('GET', '/admin/vm/status'), res, () => {});
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /ausente/i);
});

test('proxies VM status to the Cloud Run controller', async () => {
  const calls = [];
  const middleware = createVmControllerProxyMiddleware({
    env: { VM_CONTROLLER_URL: 'https://controller.example/' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        status: 200,
        async text() { return JSON.stringify({ ok: true, vm: { status: 'RUNNING' } }); }
      };
    }
  });
  const res = makeRes();
  await middleware(req('GET', '/admin/vm/status', 'secret'), res, () => {});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vm.status, 'RUNNING');
  assert.equal(calls[0].url, 'https://controller.example/status');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
});

test('proxies VM start with POST and preserves upstream status', async () => {
  const middleware = createVmControllerProxyMiddleware({
    env: { VM_CONTROLLER_URL: 'https://controller.example' },
    fetchImpl: async (_url, options) => ({
      status: 202,
      async text() { return JSON.stringify({ ok: true, action: 'start', method: options.method }); }
    })
  });
  const res = makeRes();
  await middleware(req('POST', '/admin/vm/start', 'secret'), res, () => {});
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.action, 'start');
  assert.equal(res.body.method, 'POST');
});

test('does not intercept unrelated routes', async () => {
  let passed = false;
  const middleware = createVmControllerProxyMiddleware({ env: {} });
  await middleware(req('GET', '/health'), makeRes(), () => { passed = true; });
  assert.equal(passed, true);
});


test('forwards whatever bearer token the caller supplied to Cloud Run', async () => {
  const calls = [];
  const middleware = createVmControllerProxyMiddleware({
    env: { VM_CONTROLLER_URL: 'https://controller.example' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        status: 401,
        async text() { return JSON.stringify({ ok: false, error: 'Token administrativo inválido.' }); }
      };
    }
  });
  const res = makeRes();
  await middleware(req('GET', '/admin/vm/status', 'caller-token'), res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer caller-token');
});

test('config validates the bearer token against Cloud Run before responding', async () => {
  const middleware = createVmControllerProxyMiddleware({
    env: {
      VM_CONTROLLER_URL: 'https://controller.example',
      GCP_PROJECT_ID: 'project',
      GCP_VM_ZONE: 'zone',
      GCP_VM_INSTANCE: 'vm'
    },
    fetchImpl: async (_url, options) => ({
      status: options.headers.Authorization === 'Bearer secret' ? 200 : 401,
      async text() {
        return JSON.stringify(
          options.headers.Authorization === 'Bearer secret'
            ? { ok: true, vm: { projectId: 'project', zone: 'zone', instance: 'vm', status: 'RUNNING' } }
            : { ok: false, error: 'Token administrativo inválido.' }
        );
      }
    })
  });

  const res = makeRes();
  await middleware(req('GET', '/admin/vm/config', 'secret'), res, () => {});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'cloud-run-controller');
  assert.equal(res.body.target.instance, 'vm');
});
