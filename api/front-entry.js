import 'dotenv/config';

const nativeFetch = globalThis.fetch.bind(globalThis);
const OFFICIAL_BOT_URL = 'https://bot.achoulevoubot.uk';
const configuredBotUrl = String(process.env.BOT_PANEL_URL || OFFICIAL_BOT_URL).replace(/\/+$/, '');
const BOT_USER = process.env.BOT_PANEL_USER || 'julio';
const BOT_PASSWORD = process.env.BOT_PANEL_PASSWORD || 'AchouLevou2026';
const GATEWAY_PORT = Number(process.env.GATEWAY_INTERNAL_PORT || 3099);
const READ_TIMEOUT_MS = Math.max(3000, Number(process.env.BOT_READ_ATTEMPT_TIMEOUT_MS || 7000));

function authHeader() {
  return `Basic ${Buffer.from(`${BOT_USER}:${BOT_PASSWORD}`).toString('base64')}`;
}

function parseUrl(input) {
  try {
    return new URL(typeof input === 'string' ? input : input?.url);
  } catch {
    return null;
  }
}

function isOverviewRequest(input, init = {}) {
  const url = parseUrl(input);
  const method = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();

  return Boolean(
    url &&
    method === 'GET' &&
    url.hostname === '127.0.0.1' &&
    Number(url.port || 80) === GATEWAY_PORT &&
    url.pathname.replace(/\/+$/, '') === '/bot/overview'
  );
}

function botCandidates() {
  return [...new Set([OFFICIAL_BOT_URL, configuredBotUrl].filter(Boolean))];
}

async function fetchBotJson(pathname) {
  const attempts = [];

  for (const baseUrl of botCandidates()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    const url = `${baseUrl}${pathname}${pathname.includes('?') ? '&' : '?'}t=${Date.now()}`;

    try {
      const response = await nativeFetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: authHeader()
        },
        cache: 'no-store',
        signal: controller.signal
      });

      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}

      attempts.push({
        baseUrl,
        status: response.status,
        validJson: Boolean(data)
      });

      if (response.ok && data) {
        return {
          ok: true,
          data,
          source: baseUrl,
          attempts
        };
      }
    } catch (error) {
      attempts.push({
        baseUrl,
        error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error)
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    data: null,
    source: null,
    attempts,
    error: `Não foi possível consultar ${pathname} no robô.`
  };
}

async function buildOverview() {
  const [statusRead, queueRead] = await Promise.all([
    fetchBotJson('/status'),
    fetchBotJson('/queue')
  ]);

  const statusOk = statusRead.ok;
  const queueOk = queueRead.ok;
  const apiOnline = statusOk || queueOk;

  return {
    httpStatus: apiOnline ? 200 : 503,
    body: {
      ok: apiOnline,
      apiOnline,
      statusOk,
      queueOk,
      status: statusOk ? statusRead.data : null,
      queue: queueOk ? (queueRead.data?.queue || queueRead.data) : null,
      sources: {
        status: statusRead.source,
        queue: queueRead.source
      },
      errors: {
        status: statusOk ? null : statusRead.error,
        queue: queueOk ? null : queueRead.error
      },
      diagnostics: {
        statusAttempts: statusRead.attempts,
        queueAttempts: queueRead.attempts
      },
      checkedAt: new Date().toISOString()
    }
  };
}

globalThis.fetch = async function achouLevouEntryFetch(input, init = {}) {
  if (!isOverviewRequest(input, init)) {
    return nativeFetch(input, init);
  }

  const overview = await buildOverview();

  return new Response(JSON.stringify(overview.body), {
    status: overview.httpStatus,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    }
  });
};

console.log('[BOT-OVERVIEW] Rota única de status e fila ativada.', {
  officialBotUrl: OFFICIAL_BOT_URL,
  configuredBotUrl,
  readTimeoutMs: READ_TIMEOUT_MS
});

await import('./front-gateway.js');
