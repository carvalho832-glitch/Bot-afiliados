import 'dotenv/config';

const nativeFetch = globalThis.fetch.bind(globalThis);
const OFFICIAL_BOT_URL = 'https://bot.achoulevoubot.uk';
const configuredBotUrl = String(process.env.BOT_PANEL_URL || OFFICIAL_BOT_URL).replace(/\/+$/, '');

function parseUrl(value) {
  try {
    return new URL(typeof value === 'string' ? value : value?.url);
  } catch {
    return null;
  }
}

function methodOf(input, init = {}) {
  return String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
}

function isBotRead(url, method) {
  if (!url || method !== 'GET') return false;

  let configuredHost = '';
  try { configuredHost = new URL(configuredBotUrl).host; } catch {}

  const officialHost = new URL(OFFICIAL_BOT_URL).host;
  const allowedPaths = new Set(['/status', '/queue', '/painel', '/api/status', '/painel/status']);
  return allowedPaths.has(url.pathname.replace(/\/+$/, '') || '/') &&
    (url.host === officialHost || url.host === configuredHost || url.toString().startsWith(configuredBotUrl));
}

function withoutAuthorization(init = {}) {
  const headers = new Headers(init.headers || {});
  headers.delete('Authorization');
  headers.delete('authorization');
  return { ...init, headers };
}

function officialCandidate(url) {
  const official = new URL(OFFICIAL_BOT_URL);
  official.pathname = url.pathname;
  official.search = url.search;
  return official.toString();
}

globalThis.fetch = async function resilientBotFetch(input, init = {}) {
  const url = parseUrl(input);
  const method = methodOf(input, init);

  if (!isBotRead(url, method)) {
    return nativeFetch(input, init);
  }

  const candidates = [...new Set([url.toString(), officialCandidate(url)])];
  let lastResponse = null;
  let lastError = null;

  for (const candidate of candidates) {
    const variants = [init, withoutAuthorization(init)];

    for (const variant of variants) {
      try {
        const response = await nativeFetch(candidate, variant);
        lastResponse = response;

        if (response.ok) {
          if (candidate !== url.toString()) {
            console.warn(`[BOT-READ] Leitura recuperada pelo domínio oficial: ${url.pathname}`);
          }
          return response;
        }

        if (![401, 403, 404, 408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
          return response;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error(`Não foi possível consultar ${url.pathname} no robô.`);
};

console.log('[BOT-READ] Recuperação de status e fila ativada.', {
  configuredBotUrl,
  officialBotUrl: OFFICIAL_BOT_URL
});

await import('./front-gateway.js');
