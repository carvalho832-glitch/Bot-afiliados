import test from 'node:test';
import assert from 'node:assert/strict';
import { createVmController, getVmConfig, VmControlError } from '../gcp-vm-control.mjs';

function fakeAuth(token = 'test-token') {
  return {
    async getClient() {
      return {
        async getAccessToken() {
          return { token };
        }
      };
    }
  };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test('getVmConfig reports missing required environment variables', () => {
  const config = getVmConfig({});
  assert.equal(config.configured, false);
  assert.deepEqual(config.missing, ['GCP_PROJECT_ID', 'GCP_VM_ZONE', 'GCP_VM_INSTANCE']);
});

test('status reads only the configured Compute Engine instance', async () => {
  const calls = [];
  const controller = createVmController({
    env: {
      GCP_PROJECT_ID: 'meu-projeto',
      GCP_VM_ZONE: 'southamerica-east1-a',
      GCP_VM_INSTANCE: 'achou-levou-bot-2'
    },
    auth: fakeAuth(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, {
        id: '123',
        status: 'RUNNING',
        machineType: 'zones/southamerica-east1-a/machineTypes/e2-small'
      });
    }
  });

  const result = await controller.status();
  assert.equal(result.status, 'RUNNING');
  assert.equal(result.instance, 'achou-levou-bot-2');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /projects\/meu-projeto\/zones\/southamerica-east1-a\/instances\/achou-levou-bot-2$/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
});

test('start is idempotent when VM is already running', async () => {
  let calls = 0;
  const controller = createVmController({
    env: {
      GCP_PROJECT_ID: 'p',
      GCP_VM_ZONE: 'z',
      GCP_VM_INSTANCE: 'vm'
    },
    auth: fakeAuth(),
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, { status: 'RUNNING' });
    }
  });

  const result = await controller.start();
  assert.equal(result.alreadyRunning, true);
  assert.equal(result.action, 'none');
  assert.equal(calls, 1);
});

test('start sends POST only after confirming TERMINATED state', async () => {
  const calls = [];
  const controller = createVmController({
    env: {
      GCP_PROJECT_ID: 'p',
      GCP_VM_ZONE: 'z',
      GCP_VM_INSTANCE: 'vm'
    },
    auth: fakeAuth(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'GET') return jsonResponse(200, { status: 'TERMINATED' });
      return jsonResponse(200, { id: 'op-1', name: 'operation-1', status: 'RUNNING', operationType: 'start' });
    }
  });

  const result = await controller.start();
  assert.equal(result.action, 'start');
  assert.equal(result.accepted, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'POST');
  assert.match(calls[1].url, /\/instances\/vm\/start$/);
});

test('start refuses states that should not receive the start method', async () => {
  const controller = createVmController({
    env: {
      GCP_PROJECT_ID: 'p',
      GCP_VM_ZONE: 'z',
      GCP_VM_INSTANCE: 'vm'
    },
    auth: fakeAuth(),
    fetchImpl: async () => jsonResponse(200, { status: 'SUSPENDED' })
  });

  await assert.rejects(
    controller.start(),
    error => error instanceof VmControlError && error.statusCode === 409
  );
});


test('accepts service account credentials encoded as Base64', async () => {
  const credentials = {
    client_email: 'starter@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
  };
  const env = {
    GCP_PROJECT_ID: 'p',
    GCP_VM_ZONE: 'z',
    GCP_VM_INSTANCE: 'vm',
    GCP_SERVICE_ACCOUNT_JSON_B64: Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64')
  };

  const controller = createVmController({
    env,
    auth: fakeAuth(),
    fetchImpl: async () => jsonResponse(200, { status: 'RUNNING' })
  });

  const result = await controller.status();
  assert.equal(result.status, 'RUNNING');
});
