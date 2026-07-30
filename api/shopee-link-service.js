const GATEWAY_PORT = Number(process.env.GATEWAY_INTERNAL_PORT || 3099);
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const RESOLUTION_TIMEOUT_MS = Math.max(45000, Number(process.env.SHOPEE_RESOLUTION_TIMEOUT_MS || 125000));

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

  for (let i = 0; i < 5; i += 1) {
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

async function consultarGatewayExistente(linkOriginal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLUTION_TIMEOUT_MS);
  const params = new URLSearchParams({ url: linkOriginal, _resolver: 'front-gateway' });

  try {
    const resposta = await fetch(`${GATEWAY_URL}/shopee/produto?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });

    const corpo = await resposta.text();
    let dados = null;
    try { dados = JSON.parse(corpo); } catch {}

    return { resposta, dados, corpo };
  } finally {
    clearTimeout(timer);
  }
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

  try {
    const { dados, corpo } = await consultarGatewayExistente(linkOriginal);

    if (dados?.shopId && dados?.itemId) {
      const ids = { shopId: String(dados.shopId), itemId: String(dados.itemId) };
      return {
        ok: true,
        ids,
        linkCompleto: montarLinkCompleto(ids),
        metodo: 'gateway-dados',
        urlFinal: dados.linkCompleto || dados.urlNavegador || linkOriginal
      };
    }

    const pistas = [
      dados?.linkCompleto,
      dados?.urlNavegador,
      dados?.urlResolvida,
      dados?.aviso,
      dados?.detalhe,
      dados?.error,
      corpo
    ].filter(Boolean).join(' ');

    const ids = extrairIdsShopee(pistas);
    if (ids) {
      const urlEncontrada = pistas.match(/https?:\/\/[^\s"'<>\\]+/i)?.[0] || linkOriginal;
      return {
        ok: true,
        ids,
        linkCompleto: montarLinkCompleto(ids),
        metodo: 'gateway-url-final',
        urlFinal: urlEncontrada
      };
    }

    return {
      ok: false,
      error: 'Não consegui converter esse link curto da Shopee.',
      detalhe: dados?.aviso || dados?.detalhe || dados?.error || 'O navegador existente abriu o link, mas não revelou os códigos do produto.'
    };
  } catch (error) {
    return {
      ok: false,
      error: 'Não consegui converter esse link curto da Shopee.',
      detalhe: error?.name === 'AbortError'
        ? 'A resolução do link ultrapassou o tempo limite.'
        : String(error?.message || error)
    };
  }
}

// Mantido para compatibilidade com o encerramento da ponte frontal.
// Este módulo não possui mais navegador próprio.
export async function fecharShopeeBrowser() {}
