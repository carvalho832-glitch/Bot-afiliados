import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const PROJECT_ID = String(process.env.GCP_PROJECT_ID || '').trim();
const ZONE = String(process.env.GCP_VM_ZONE || '').trim();
const INSTANCE = String(process.env.GCP_VM_INSTANCE || '').trim();
const ADMIN_TOKEN = String(process.env.VM_ADMIN_TOKEN || '').trim();

const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const COMPUTE_BASE = 'https://compute.googleapis.com/compute/v1';

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function secureEqual(a = '', b = '') {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  return left.length > 0 &&
    left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

function requireConfig() {
  const missing = [];
  if (!PROJECT_ID) missing.push('GCP_PROJECT_ID');
  if (!ZONE) missing.push('GCP_VM_ZONE');
  if (!INSTANCE) missing.push('GCP_VM_INSTANCE');
  if (!ADMIN_TOKEN) missing.push('VM_ADMIN_TOKEN');
  if (missing.length) {
    const error = new Error(`Variáveis ausentes: ${missing.join(', ')}`);
    error.statusCode = 503;
    error.code = 'not_configured';
    throw error;
  }
}

function requireAdmin(req) {
  const header = String(req.headers.authorization || '');
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!secureEqual(ADMIN_TOKEN, token)) {
    const error = new Error('Token administrativo inválido.');
    error.statusCode = 401;
    error.code = 'unauthorized';
    throw error;
  }
}

async function getAccessToken() {
  const response = await fetch(METADATA_TOKEN_URL, {
    headers: { 'Metadata-Flavor': 'Google' }
  });
  if (!response.ok) {
    throw new Error(`Falha ao obter identidade do Cloud Run (HTTP ${response.status}).`);
  }
  const data = await response.json();
  if (!data?.access_token) throw new Error('Cloud Run não retornou access_token.');
  return data.access_token;
}

function instanceUrl() {
  return `${COMPUTE_BASE}/projects/${encodeURIComponent(PROJECT_ID)}/zones/${encodeURIComponent(ZONE)}/instances/${encodeURIComponent(INSTANCE)}`;
}

async function googleRequest(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (!response.ok) {
    const message = data?.error?.message || text.slice(0, 500) || `HTTP ${response.status}`;
    const error = new Error(`Google Cloud recusou a operação: ${message}`);
    error.statusCode = response.status === 403 ? 403 :
      response.status === 404 ? 404 :
      response.status === 401 ? 401 : 502;
    error.code = 'gcp_api_error';
    throw error;
  }
  return data || {};
}

function normalizeVm(data = {}) {
  return {
    projectId: PROJECT_ID,
    zone: ZONE,
    instance: INSTANCE,
    id: data.id ? String(data.id) : null,
    status: String(data.status || 'UNKNOWN').toUpperCase(),
    machineType: String(data.machineType || '').split('/').pop() || null,
    lastStartTimestamp: data.lastStartTimestamp || null,
    lastStopTimestamp: data.lastStopTimestamp || null
  };
}

async function vmStatus() {
  return normalizeVm(await googleRequest(instanceUrl(), { method: 'GET' }));
}

async function vmStart() {
  const current = await vmStatus();

  if (current.status === 'RUNNING') {
    return { ok: true, action: 'none', alreadyRunning: true, vm: current };
  }

  if (['PROVISIONING', 'STAGING'].includes(current.status)) {
    return { ok: true, action: 'none', alreadyStarting: true, vm: current };
  }

  if (current.status !== 'TERMINATED') {
    const error = new Error(
      `A VM está em estado ${current.status}; o start automático só roda quando ela está TERMINATED.`
    );
    error.statusCode = 409;
    error.code = 'vm_state_not_startable';
    throw error;
  }

  const operation = await googleRequest(`${instanceUrl()}/start`, { method: 'POST' });
  return {
    ok: true,
    action: 'start',
    accepted: true,
    previousStatus: current.status,
    vm: current,
    operation: {
      id: operation.id ? String(operation.id) : null,
      name: operation.name || null,
      status: operation.status || null,
      operationType: operation.operationType || null
    }
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'Achou Levou VM Controller',
        configured: Boolean(PROJECT_ID && ZONE && INSTANCE && ADMIN_TOKEN)
      });
    }

    requireConfig();
    requireAdmin(req);

    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, { ok: true, vm: await vmStatus() });
    }

    if (req.method === 'POST' && url.pathname === '/start') {
      const result = await vmStart();
      return json(res, result.accepted ? 202 : 200, result);
    }

    return json(res, 404, { ok: false, error: 'Rota não encontrada.' });
  } catch (error) {
    console.error('[VM-CONTROLLER]', error?.code || 'error', error?.message || error);
    return json(res, Number(error?.statusCode || 500), {
      ok: false,
      code: error?.code || 'internal_error',
      error: String(error?.message || 'Falha interna.')
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Achou Levou VM Controller ouvindo na porta ${PORT}`);
});
