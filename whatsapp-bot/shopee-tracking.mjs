import crypto from 'node:crypto';

const DEFAULT_TRACKING_URL = 'https://bot-afiliados-1fwi.onrender.com/shopee/rastrear';
const REQUEST_TIMEOUT_MS = Math.max(8000, Number(process.env.SHOPEE_TRACKING_TIMEOUT_MS || 45000));
const TRACKING_TIME_ZONE = process.env.SHOPEE_TRACKING_TIME_ZONE || 'America/Sao_Paulo';

function ehDominioShopee(hostname = '') {
  return /(^|\.)(?:shopee\.com\.br|s\.shopee\.com\.br|shp\.ee|collshp\.com)$/i.test(String(hostname || ''));
}

function extrairUrls(message = '') {
  return (String(message || '').match(/https?:\/\/[^\s<>"']+/gi) || [])
    .map(url => url.replace(/[\])},.;!?*]+$/, ''));
}

function ehLinkAfiliadoShopee(url = '') {
  try {
    const parsed = new URL(url);
    if (!ehDominioShopee(parsed.hostname)) return false;
    if (parsed.hostname.toLowerCase() === 's.shopee.com.br') return true;
    const rastreamento = `${parsed.pathname}?${parsed.searchParams}`.toLowerCase();
    return /affiliate|uls_trackid|share_channel|an_[a-z0-9]|utm_(source|medium|campaign)|smtt=|af_siteid|sub[_-]?id|tracking|click_id/.test(rastreamento);
  } catch {
    return false;
  }
}

function normalizarMarcador(valor = '', fallback = 'na', limite = 50) {
  const limpar = entrada => String(entrada || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, limite);
  return limpar(valor) || limpar(fallback) || 'na';
}

function hashCurto(valor = '') {
  return crypto.createHash('sha256').update(String(valor || ''), 'utf8').digest('hex').slice(0, 6);
}

function dataHoraNoFuso(date = new Date(), timeZone = TRACKING_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    day: `${map.year}${map.month}${map.day}`,
    time: `${map.hour}${map.minute}`
  };
}

export function extrairLinksShopee(message = '') {
  const urls = extrairUrls(message);
  const encontrados = [];

  for (const bruto of urls) {
    const url = bruto.replace(/[\])},.;!?*]+$/, '');
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && ehDominioShopee(parsed.hostname) && !encontrados.includes(url)) {
        encontrados.push(url);
      }
    } catch {}
  }

  return encontrados.slice(0, 3);
}

export function criarSubIdsRastreamento({ target = {}, offerId = '', category = 'geral', now = new Date() } = {}) {
  const nomeGrupo = normalizarMarcador(target.name || 'grupo', 'grupo', 32);
  const grupo = normalizarMarcador(`g${nomeGrupo}${hashCurto(target.id || target.name)}`, 'ggrupo');
  const oferta = normalizarMarcador(`of${offerId}`, `of${Date.now()}`);
  const categoria = normalizarMarcador(`cat${category || 'geral'}`, 'catgeral');
  const horario = dataHoraNoFuso(now);

  return [grupo, oferta, categoria, `h${horario.time}`, `wa${horario.day}`];
}

export function aplicarLinksRastreados(message = '', links = []) {
  let resultado = String(message || '');
  for (const item of Array.isArray(links) ? links : []) {
    const originalUrl = String(item?.originalUrl || '');
    const shortLink = String(item?.shortLink || '');
    if (originalUrl && shortLink) resultado = resultado.split(originalUrl).join(shortLink);
  }
  return resultado;
}

function criarAuthorization() {
  const token = String(process.env.SHOPEE_TRACKING_TOKEN || '').trim();
  if (token) return `Bearer ${token}`;

  const user = String(process.env.SHOPEE_TRACKING_USER || process.env.BOT_PANEL_USER || 'julio');
  const password = String(process.env.SHOPEE_TRACKING_PASSWORD || process.env.BOT_PANEL_PASSWORD || 'AchouLevou2026');
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function registroEmCacheValido(existing, linksOriginais) {
  if (!existing || existing.status !== 'tracked' || !Array.isArray(existing.links)) return false;
  if (existing.links.length !== linksOriginais.length) return false;
  return existing.links.every((link, index) => (
    link?.originalUrl === linksOriginais[index] &&
    /^https:\/\/s\.shopee\.com\.br\//i.test(String(link?.shortLink || ''))
  ));
}

async function chamarGerador({ originUrl, subIds, fetchImpl, endpoint, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resposta = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: criarAuthorization()
      },
      body: JSON.stringify({ originUrl, subIds }),
      signal: controller.signal
    });

    const corpo = await resposta.text();
    let json = null;
    try { json = JSON.parse(corpo); } catch {}

    if (!resposta.ok || !json?.ok) {
      const detalhe = json?.detalhe ? ` ${json.detalhe}` : '';
      throw new Error(`${json?.error || `HTTP ${resposta.status}`}${detalhe}`.trim());
    }

    const shortLink = String(json.shortLink || '').trim();
    if (!/^https:\/\/s\.shopee\.com\.br\//i.test(shortLink)) {
      throw new Error('O gerador não devolveu um link curto oficial da Shopee Brasil.');
    }

    return shortLink;
  } finally {
    clearTimeout(timer);
  }
}

export async function prepararMensagemRastreada({
  message,
  target,
  offerId,
  category,
  existing = null,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  endpoint = process.env.SHOPEE_TRACKING_API_URL || DEFAULT_TRACKING_URL,
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  const originalMessage = String(message || '').trim();
  if (typeof fetchImpl !== 'function') throw new Error('Cliente HTTP indisponível.');
  const linksOriginais = extrairLinksShopee(originalMessage);

  if (!linksOriginais.length) {
    throw new Error('Oferta sem link oficial da Shopee: envio bloqueado para preservar o rastreamento de afiliado.');
  }

  const todosOsLinks = extrairUrls(originalMessage);
  if (todosOsLinks.some(url => !linksOriginais.includes(url))) {
    throw new Error('Oferta contém link fora da Shopee: envio bloqueado para preservar somente o link de afiliado.');
  }

  // O link copiado do painel de Afiliados é a fonte de verdade. Não o
  // reenviamos ao gerador, pois isso trocaria o URL salvo por outro link.
  if (linksOriginais.every(ehLinkAfiliadoShopee)) {
    return {
      message: originalMessage,
      record: {
        status: 'preserved',
        links: linksOriginais.map(originalUrl => ({ originalUrl, shortLink: originalUrl })),
        subIds: [],
        generatedAt: new Date(now).toISOString(),
        error: null
      }
    };
  }

  if (registroEmCacheValido(existing, linksOriginais)) {
    return { message: aplicarLinksRastreados(originalMessage, existing.links), record: existing };
  }

  const subIds = criarSubIdsRastreamento({ target, offerId, category, now });

  try {
    const trackedLinks = [];
    for (const originalUrl of linksOriginais) {
      const shortLink = await chamarGerador({
        originUrl: originalUrl,
        subIds,
        fetchImpl,
        endpoint,
        timeoutMs: Math.max(8000, Number(timeoutMs || REQUEST_TIMEOUT_MS))
      });
      trackedLinks.push({ originalUrl, shortLink });
    }

    const record = {
      status: 'tracked',
      links: trackedLinks,
      subIds,
      generatedAt: new Date(now).toISOString(),
      error: null
    };
    return { message: aplicarLinksRastreados(originalMessage, trackedLinks), record };
  } catch (error) {
    const detalhe = error?.name === 'AbortError'
      ? 'Tempo limite ao solicitar o link oficial.'
      : String(error?.message || error);
    throw new Error(`Link de afiliado não gerado; envio bloqueado. ${detalhe}`);
  }
}

export function getShopeeTrackingConfiguration() {
  const endpoint = process.env.SHOPEE_TRACKING_API_URL || DEFAULT_TRACKING_URL;
  let endpointHost = '';
  try { endpointHost = new URL(endpoint).hostname; } catch {}
  return {
    enabled: Boolean(endpointHost),
    endpointHost,
    authentication: process.env.SHOPEE_TRACKING_TOKEN ? 'bearer' : 'basic',
    timeoutMs: REQUEST_TIMEOUT_MS
  };
}
