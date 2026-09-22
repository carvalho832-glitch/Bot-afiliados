import { GoogleAuth } from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const COMPUTE_BASE = 'https://compute.googleapis.com/compute/v1';

export class VmControlError extends Error {
  constructor(message, statusCode = 500, code = 'vm_control_error', details = null) {
    super(message);
    this.name = 'VmControlError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function clean(value = '') {
  return String(value ?? '').trim();
}

function parseCredentials(env = process.env) {
  const rawJson = clean(env.GCP_SERVICE_ACCOUNT_JSON);
  const rawBase64 = clean(env.GCP_SERVICE_ACCOUNT_JSON_B64);
  if (!rawJson && !rawBase64) return null;

  let raw = rawJson;
  if (!raw && rawBase64) {
    try {
      raw = Buffer.from(rawBase64, 'base64').toString('utf8');
    } catch (error) {
      throw new VmControlError(
        'GCP_SERVICE_ACCOUNT_JSON_B64 não contém Base64 válido.',
        503,
        'gcp_credentials_base64_invalid',
        String(error?.message || error)
      );
    }
  }

  try {
    const credentials = JSON.parse(raw);
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('client_email/private_key ausentes');
    }
    return credentials;
  } catch (error) {
    throw new VmControlError(
      'A credencial do Google Cloud está configurada, mas não contém um JSON de conta de serviço válido.',
      503,
      'gcp_credentials_invalid',
      String(error?.message || error)
    );
  }
}

export function getVmConfig(env = process.env) {
  const projectId = clean(env.GCP_PROJECT_ID);
  const zone = clean(env.GCP_VM_ZONE);
  const instance = clean(env.GCP_VM_INSTANCE);

  const missing = [
    !projectId && 'GCP_PROJECT_ID',
    !zone && 'GCP_VM_ZONE',
    !instance && 'GCP_VM_INSTANCE'
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    missing,
    projectId,
    zone,
    instance
  };
}

function requireVmConfig(env = process.env) {
  const config = getVmConfig(env);
  if (!config.configured) {
    throw new VmControlError(
      `Controle da VM ainda não configurado. Variáveis ausentes: ${config.missing.join(', ')}.`,
      503,
      'gcp_vm_not_configured',
      { missing: config.missing }
    );
  }
  return config;
}

function createAuth(env = process.env) {
  const credentials = parseCredentials(env);
  return new GoogleAuth({
    scopes: [CLOUD_PLATFORM_SCOPE],
    ...(credentials ? { credentials } : {})
  });
}

async function getAccessToken(auth) {
  const client = await auth.getClient();
  const tokenResult = await client.getAccessToken();
  const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
  if (!token) {
    throw new VmControlError(
      'O Google Cloud não forneceu um token de acesso para controlar a VM.',
      502,
      'gcp_access_token_missing'
    );
  }
  return token;
}

function instanceBaseUrl(config) {
  return `${COMPUTE_BASE}/projects/${encodeURIComponent(config.projectId)}/zones/${encodeURIComponent(config.zone)}/instances/${encodeURIComponent(config.instance)}`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}

  if (!response.ok) {
    const googleMessage =
      data?.error?.message ||
      data?.error_description ||
      text?.slice(0, 500) ||
      `HTTP ${response.status}`;

    const statusCode = response.status === 403 ? 403
      : response.status === 404 ? 404
        : response.status === 401 ? 401
          : 502;

    throw new VmControlError(
      `Google Cloud recusou a operação: ${googleMessage}`,
      statusCode,
      'gcp_api_error',
      { googleStatus: response.status }
    );
  }

  return data || {};
}

function normalizeVm(instance, config) {
  return {
    projectId: config.projectId,
    zone: config.zone,
    instance: config.instance,
    id: instance.id ? String(instance.id) : null,
    status: clean(instance.status).toUpperCase() || 'UNKNOWN',
    machineType: clean(instance.machineType).split('/').pop() || null,
    lastStartTimestamp: instance.lastStartTimestamp || null,
    lastStopTimestamp: instance.lastStopTimestamp || null
  };
}

export function createVmController({
  env = process.env,
  fetchImpl = globalThis.fetch,
  auth = null
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new VmControlError('fetch indisponível para chamar o Google Cloud.', 500, 'fetch_unavailable');
  }

  async function authHeaders(config) {
    const authClient = auth || createAuth(env);
    const token = await getAccessToken(authClient);
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'achou-levou-vm-control/1.0'
    };
  }

  async function status() {
    const config = requireVmConfig(env);
    const headers = await authHeaders(config);
    const response = await fetchImpl(instanceBaseUrl(config), {
      method: 'GET',
      headers,
      cache: 'no-store'
    });
    const data = await readJsonResponse(response);
    return normalizeVm(data, config);
  }

  async function start() {
    const current = await status();

    if (current.status === 'RUNNING') {
      return {
        ok: true,
        action: 'none',
        alreadyRunning: true,
        vm: current
      };
    }

    if (['PROVISIONING', 'STAGING'].includes(current.status)) {
      return {
        ok: true,
        action: 'none',
        alreadyStarting: true,
        vm: current
      };
    }

    if (current.status !== 'TERMINATED') {
      throw new VmControlError(
        `A VM está em estado ${current.status}; o start automático só é executado quando ela está TERMINATED.`,
        409,
        'vm_state_not_startable',
        { status: current.status }
      );
    }

    const config = requireVmConfig(env);
    const headers = await authHeaders(config);
    const response = await fetchImpl(`${instanceBaseUrl(config)}/start`, {
      method: 'POST',
      headers,
      cache: 'no-store'
    });
    const operation = await readJsonResponse(response);

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
        operationType: operation.operationType || null,
        targetLink: operation.targetLink || null
      }
    };
  }

  return { status, start };
}
