const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const REQUEST_TIMEOUT_MS = Math.max(8000, Number(process.env.SHOPEE_REDIRECT_TIMEOUT_MS || 15000));
const MAX_VISITS = Math.max(4, Number(process.env.SHOPEE_REDIRECT_MAX_VISITS || 12));

function limparTexto(valor = '') {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function extrairLink(valor = '') {
  const texto = limparTexto(valor);
  return texto.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.;]+$/, '') || texto;
}

function decodificar(valor = '') {
  let atual = String(valor || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&');

  for (let i = 0; i < 6; i += 1) {
    try {
      const proximo = decodeURIComponent(atual);
      if (proximo === atual) break;
      atual = proximo;
    } catch {
      break;
    }
  }

  return atual;
}

function ehDominioShopee(hostname = '') {
  return /(^|\.)(?:shopee\.com\.br|s\.shopee\.com\.br|shp\.ee|collshp\.com)$/i.test(String(hostname || ''));
}

function extrairIdsShopee(valor = '') {
  const texto = decodificar(valor);
  const padroes = [
    /\/product\/(\d+)\/(\d+)/i,
    /-i\.(\d+)\.(\d+)/i,
    /[?&]shopid=(\d+).*?[?&]itemid=(\d+)/i,
    /[?&]shop_id=(\d+).*?[?&]item_id=(\d+)/i,
    /[?&]shopId=(\d+).*?[?&]itemId=(\d+)/i
  ];

  for (const padrao of padroes) {
    const match = texto.match(padrao);
    if (match) return { shopId: match[1], itemId: match[2] };
  }

  const invertido = texto.match(/[?&]itemid=(\d+).*?[?&]shopid=(\d+)/i) ||
    texto.match(/[?&]item_id=(\d+).*?[?&]shop_id=(\d+)/i) ||
    texto.match(/[?&]itemId=(\d+).*?[?&]shopId=(\d+)/i);
  if (invertido) return { shopId: invertido[2], itemId: invertido[1] };

  const urls = texto.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
  const candidatos = [texto, ...urls];

  for (const candidato of candidatos) {
    try {
      const url = new URL(extrairLink(candidato));
      if (!/(^|\.)shopee\.com\.br$/i.test(url.hostname)) continue;

      const segmentosNumericos = url.pathname
        .split('/')
        .map(parte => parte.trim())
        .filter(parte => /^\d{5,}$/.test(parte));

      if (segmentosNumericos.length >= 2) {
        return {
          shopId: segmentosNumericos[segmentosNumericos.length - 2],
          itemId: segmentosNumericos[segmentosNumericos.length - 1]
        };
      }
    } catch {}
  }

  return null;
}

function montarLinkCompleto(ids) {
  return ids?.shopId && ids?.itemId
    ? `https://shopee.com.br/product/${ids.shopId}/${ids.itemId}`
    : '';
}

function extrairUrlsDoCorpo(corpo = '', baseUrl = '') {
  const texto = decodificar(corpo);
  const candidatos = new Set();

  const adicionar = valor => {
    if (!valor) return;
    try {
      const resolvida = new URL(decodificar(valor), baseUrl || undefined).toString();
      const host = new URL(resolvida).hostname;
      if (ehDominioShopee(host)) candidatos.add(resolvida);
    } catch {}
  };

  for (const url of texto.match(/https?:\/\/[^\s"'<>\\]+/gi) || []) adicionar(url);

  const canonical = texto.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] ||
    texto.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i)?.[1];
  adicionar(canonical);

  const refresh = texto.match(/http-equiv=["']?refresh["']?[^>]*content=["'][^;]+;\s*url=([^"']+)/i)?.[1];
  adicionar(refresh);

  const jsPatterns = [
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi,
    /location\.replace\(\s*["']([^"']+)["']\s*\)/gi,
    /["'](?:url|target_url|redirect_url|universal_link|deep_link|deeplink)["']\s*:\s*["']([^"']+)["']/gi
  ];

  for (const padrao of jsPatterns) {
    let match;
    while ((match = padrao.exec(texto))) adicionar(match[1]);
  }

  return [...candidatos];
}

async function fetchComTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function headersShopee() {
  return {
    'User-Agent': MOBILE_UA,
    'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };
}

async function tentarRedirectFollow(linkOriginal) {
  try {
    const resposta = await fetchComTimeout(linkOriginal, {
      method: 'GET',
      redirect: 'follow',
      headers: headersShopee(),
      cache: 'no-store'
    });

    const finalUrl = resposta.url || linkOriginal;
    let ids = extrairIdsShopee(finalUrl);
    if (ids) return { ok: true, ids, urlFinal: finalUrl, metodo: 'http-follow-url' };

    const tipo = resposta.headers.get('content-type') || '';
    if (/text|html|json|javascript/i.test(tipo)) {
      const corpo = await resposta.text();
      ids = extrairIdsShopee(corpo);
      if (ids) return { ok: true, ids, urlFinal: finalUrl, metodo: 'http-follow-corpo' };

      for (const candidato of extrairUrlsDoCorpo(corpo, finalUrl)) {
        ids = extrairIdsShopee(candidato);
        if (ids) return { ok: true, ids, urlFinal: candidato, metodo: 'http-follow-link-corpo' };
      }
    }
  } catch {}

  return null;
}

async function tentarRedirectManual(linkOriginal) {
  const fila = [linkOriginal];
  const visitados = new Set();
  const erros = [];
  let ultimoLink = linkOriginal;

  while (fila.length && visitados.size < MAX_VISITS) {
    const atual = fila.shift();
    if (!atual || visitados.has(atual)) continue;

    visitados.add(atual);
    ultimoLink = atual;

    const idsDiretos = extrairIdsShopee(atual);
    if (idsDiretos) return { ok: true, ids: idsDiretos, urlFinal: atual, metodo: 'http-manual-direto' };

    try {
      const resposta = await fetchComTimeout(atual, {
        method: 'GET',
        redirect: 'manual',
        headers: headersShopee(),
        cache: 'no-store'
      });

      const location = resposta.headers.get('location');
      if (location) {
        const proximo = new URL(location, atual).toString();
        const idsLocation = extrairIdsShopee(proximo);
        if (idsLocation) return { ok: true, ids: idsLocation, urlFinal: proximo, metodo: 'http-location' };
        if (!visitados.has(proximo)) fila.unshift(proximo);
      }

      const tipo = resposta.headers.get('content-type') || '';
      if (/text|html|json|javascript/i.test(tipo)) {
        const corpo = await resposta.text();
        const idsCorpo = extrairIdsShopee(corpo);
        if (idsCorpo) return { ok: true, ids: idsCorpo, urlFinal: atual, metodo: 'http-corpo' };

        for (const candidato of extrairUrlsDoCorpo(corpo, atual)) {
          const idsCandidato = extrairIdsShopee(candidato);
          if (idsCandidato) return { ok: true, ids: idsCandidato, urlFinal: candidato, metodo: 'http-link-corpo' };
          if (!visitados.has(candidato)) fila.push(candidato);
        }
      }
    } catch (error) {
      erros.push(error?.name === 'AbortError' ? 'tempo esgotado' : String(error?.message || error));
    }
  }

  return {
    ok: false,
    ultimoLink,
    detalhe: erros.filter(Boolean).slice(-3).join(' | ')
  };
}

export async function resolverLinkShopee(valor) {
  const linkOriginal = extrairLink(valor);
  if (!linkOriginal) return { ok: false, error: 'Informe o link da Shopee.' };

  const idsDiretos = extrairIdsShopee(linkOriginal);
  if (idsDiretos) {
    return {
      ok: true,
      ids: idsDiretos,
      linkCompleto: montarLinkCompleto(idsDiretos),
      metodo: 'direto',
      urlFinal: linkOriginal
    };
  }

  const seguido = await tentarRedirectFollow(linkOriginal);
  if (seguido?.ok) {
    return {
      ...seguido,
      linkCompleto: montarLinkCompleto(seguido.ids)
    };
  }

  const manual = await tentarRedirectManual(linkOriginal);
  if (manual?.ok) {
    return {
      ...manual,
      linkCompleto: montarLinkCompleto(manual.ids)
    };
  }

  return {
    ok: false,
    error: 'Não consegui converter esse link curto da Shopee sem abrir o navegador.',
    detalhe: manual?.detalhe || `O redirecionamento terminou sem revelar shopId e itemId. Último endereço: ${manual?.ultimoLink || linkOriginal}`
  };
}

// Mantido para compatibilidade com o encerramento da ponte frontal.
// A conversão da Shopee agora é feita sem Chromium.
export async function fecharShopeeBrowser() {}
