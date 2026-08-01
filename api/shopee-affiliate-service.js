import crypto from 'node:crypto';

export const SHOPEE_AFFILIATE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

function limparTexto(valor = '') {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function ehDominioShopee(hostname = '') {
  return /(^|\.)(?:shopee\.com\.br|s\.shopee\.com\.br|shp\.ee|collshp\.com)$/i.test(String(hostname || ''));
}

export function normalizarSubId(valor = '', fallback = 'na') {
  const limpar = entrada => String(entrada || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 50);
  const normalizado = limpar(valor);

  return normalizado || limpar(fallback) || 'na';
}

export function normalizarSubIds(valores = []) {
  const origem = Array.isArray(valores) ? valores : [];
  return origem.slice(0, 5).map((valor, indice) => normalizarSubId(valor, `na${indice + 1}`));
}

export function validarUrlShopee(valor = '') {
  const texto = limparTexto(valor);
  if (!texto) throw new Error('Informe o link da Shopee.');

  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new Error('O endereço informado não é um link válido.');
  }

  if (url.protocol !== 'https:' || !ehDominioShopee(url.hostname)) {
    throw new Error('O rastreamento aceita somente endereços oficiais da Shopee.');
  }

  return url.toString();
}

export function criarPayloadGerarLink({ originUrl, subIds = [] }) {
  const destino = validarUrlShopee(originUrl);
  const marcadores = normalizarSubIds(subIds);
  if (!marcadores.length) throw new Error('Informe pelo menos um Sub_id para rastreamento.');

  const query = `mutation GerarLinkRastreado { generateShortLink(input: { originUrl: ${JSON.stringify(destino)}, subIds: ${JSON.stringify(marcadores)} }) { shortLink } }`;
  return {
    payload: JSON.stringify({ query }),
    query,
    originUrl: destino,
    subIds: marcadores
  };
}

export function criarAutorizacaoShopee({ appId, secret, payload, timestamp = Math.floor(Date.now() / 1000) }) {
  const credential = limparTexto(appId);
  const chave = limparTexto(secret);
  if (!credential || !chave) throw new Error('Credenciais da Shopee não configuradas no servidor.');

  const instante = String(timestamp);
  const assinatura = crypto
    .createHash('sha256')
    .update(`${credential}${instante}${payload}${chave}`, 'utf8')
    .digest('hex');

  return `SHA256 Credential=${credential}, Timestamp=${instante}, Signature=${assinatura}`;
}

async function fetchComTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function gerarLinkRastreadoShopee({
  originUrl,
  subIds,
  appId = process.env.SHOPEE_APP_ID,
  secret = process.env.SHOPEE_SECRET,
  apiUrl = SHOPEE_AFFILIATE_API_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Cliente HTTP indisponível.');

  const preparado = criarPayloadGerarLink({ originUrl, subIds });
  const authorization = criarAutorizacaoShopee({ appId, secret, payload: preparado.payload });
  const resposta = await fetchComTimeout(fetchImpl, apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authorization
    },
    body: preparado.payload
  }, Math.max(5000, Number(timeoutMs || 20000)));

  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(`Shopee respondeu com HTTP ${resposta.status}.`);
  if (json?.errors?.length) {
    const mensagem = json.errors.map(erro => erro?.message).filter(Boolean).join(' | ');
    throw new Error(mensagem || 'A Shopee recusou a geração do link.');
  }

  const shortLink = limparTexto(json?.data?.generateShortLink?.shortLink);
  if (!shortLink) throw new Error('A Shopee não devolveu o link curto.');

  let shortUrl;
  try {
    shortUrl = new URL(shortLink);
  } catch {
    throw new Error('A Shopee devolveu um endereço inválido.');
  }

  if (shortUrl.protocol !== 'https:' || shortUrl.hostname.toLowerCase() !== 's.shopee.com.br') {
    throw new Error('A Shopee não devolveu o domínio curto oficial brasileiro.');
  }

  return {
    ok: true,
    shortLink: shortUrl.toString(),
    subIds: preparado.subIds
  };
}
