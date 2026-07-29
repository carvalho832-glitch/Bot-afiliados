import { chromium } from 'playwright';

const NAVIGATION_TIMEOUT_MS = Math.max(20000, Number(process.env.MAGAZINEVOCE_NAVIGATION_TIMEOUT_MS || 45000));
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

function limparTexto(valor = '') {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function extrairLink(valor = '') {
  return limparTexto(valor).match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.;]+$/, '') || limparTexto(valor);
}

function validarLink(valor = '') {
  try {
    const url = new URL(extrairLink(valor));
    return /(^|\.)magazinevoce\.com\.br$/i.test(url.hostname) && /\/p\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function numeroDeMoeda(valor = '') {
  const texto = String(valor || '').replace(/[^\d,.]/g, '').trim();
  if (!texto) return 0;

  let normalizado = texto;
  if (texto.includes(',') && texto.includes('.')) {
    normalizado = texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '');
  } else if (texto.includes(',')) {
    normalizado = texto.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = texto.split('.');
    if (partes.length > 2) normalizado = partes.join('');
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function formatarMoeda(valor) {
  const numero = Number(valor || 0);
  if (!Number.isFinite(numero) || numero <= 0) return '';
  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function limparTitulo(valor = '') {
  return limparTexto(valor)
    .replace(/\s*[|–-]\s*Magazine Você.*$/i, '')
    .replace(/\s*[|–-]\s*Magazine Luiza.*$/i, '')
    .replace(/\s*[|–-]\s*Magalu.*$/i, '')
    .replace(/^Magazine Você\s*[|:–-]?\s*/i, '')
    .replace(/^Magazine Luiza\s*[|:–-]?\s*/i, '')
    .replace(/^Magalu\s*[|:–-]?\s*/i, '')
    .trim();
}

function encontrarProdutoJsonLd(valor) {
  if (!valor) return null;
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const encontrado = encontrarProdutoJsonLd(item);
      if (encontrado) return encontrado;
    }
    return null;
  }
  if (typeof valor !== 'object') return null;

  const tipo = valor['@type'];
  if (tipo === 'Product' || (Array.isArray(tipo) && tipo.includes('Product'))) return valor;

  for (const chave of ['@graph', 'mainEntity', 'itemListElement', 'item']) {
    const encontrado = encontrarProdutoJsonLd(valor[chave]);
    if (encontrado) return encontrado;
  }
  return null;
}

function normalizarResultado(dados, linkConsulta) {
  const produto = limparTitulo(dados?.titulo || '');
  let precoPor = numeroDeMoeda(dados?.precoLd || dados?.precoMeta || dados?.precoTexto || '');
  let precoDe = numeroDeMoeda(dados?.precoAnterior || '');
  const corpo = String(dados?.corpo || '');

  if (!precoPor) {
    const match = corpo.match(/(?:por|à vista|no pix)\s*R\$\s*([\d.]+,\d{2})/i) ||
      corpo.match(/R\$\s*([\d.]+,\d{2})/i);
    precoPor = numeroDeMoeda(match?.[1] || '');
  }

  if (!precoDe) {
    const match = corpo.match(/(?:de|preço anterior)\s*R\$\s*([\d.]+,\d{2})/i);
    precoDe = numeroDeMoeda(match?.[1] || '');
  }

  if (precoDe && precoPor && precoDe <= precoPor) precoDe = 0;

  const invalido = !produto || produto.length < 5 || /não é possível acessar|nao e possivel acessar|this site can.?t be reached|chrome-error|^https?:/i.test(produto);
  if (invalido) {
    return {
      ok: false,
      error: 'A Magazine Você abriu a página, mas não entregou um nome de produto válido.',
      detalhe: `Página consultada: ${linkConsulta}`
    };
  }

  return {
    ok: true,
    loja: 'Magalu',
    produto,
    precoDe: formatarMoeda(precoDe),
    precoPor: formatarMoeda(precoPor),
    cupom: '',
    desconto: precoDe > precoPor && precoPor > 0
      ? `${Math.floor(((precoDe - precoPor) / precoDe) * 100)}% OFF`
      : '',
    linkCompleto: dados?.canonical || dados?.ogUrl || linkConsulta,
    linkConsulta,
    origem: 'magazinevoce-playwright',
    aviso: precoPor ? '' : 'O produto foi localizado, mas o preço não apareceu para esta sessão.'
  };
}

export async function buscarProdutoMagazineVoce(valor) {
  const linkConsulta = extrairLink(valor);
  if (!validarLink(linkConsulta)) {
    return {
      ok: false,
      error: 'O endereço informado não parece ser uma página de produto da Magazine Você.',
      detalhe: 'Use um link de magazinevoce.com.br que contenha /p/.'
    };
  }

  let browser;
  let context;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromium.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent: USER_AGENT,
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' }
    });

    const page = await context.newPage();
    await page.route('**/*', route => {
      const tipo = route.request().resourceType();
      if (['image', 'media', 'font'].includes(tipo)) return route.abort();
      return route.continue();
    });

    await page.goto(linkConsulta, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForTimeout(4500);

    const dados = await page.evaluate(() => {
      const texto = valor => String(valor || '').replace(/\s+/g, ' ').trim();
      const primeiroTexto = seletores => {
        for (const seletor of seletores) {
          const elemento = document.querySelector(seletor);
          const valor = texto(elemento?.textContent || elemento?.getAttribute?.('content'));
          if (valor) return valor;
        }
        return '';
      };

      const jsonLds = [];
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { jsonLds.push(JSON.parse(script.textContent || 'null')); } catch {}
      }

      const encontrarProduto = valor => {
        if (!valor) return null;
        if (Array.isArray(valor)) {
          for (const item of valor) {
            const achado = encontrarProduto(item);
            if (achado) return achado;
          }
          return null;
        }
        if (typeof valor !== 'object') return null;
        const tipo = valor['@type'];
        if (tipo === 'Product' || (Array.isArray(tipo) && tipo.includes('Product'))) return valor;
        for (const chave of ['@graph', 'mainEntity', 'itemListElement', 'item']) {
          const achado = encontrarProduto(valor[chave]);
          if (achado) return achado;
        }
        return null;
      };

      const produtoLd = jsonLds.map(encontrarProduto).find(Boolean) || null;
      const ofertas = Array.isArray(produtoLd?.offers) ? produtoLd.offers : (produtoLd?.offers ? [produtoLd.offers] : []);
      const oferta = ofertas.find(item => item?.price || item?.lowPrice) || ofertas[0] || {};

      return {
        titulo: texto(produtoLd?.name) || primeiroTexto([
          '[data-testid="heading-product-title"]',
          '[data-testid="product-title"]',
          'main h1',
          'h1',
          'meta[property="og:title"]'
        ]) || texto(document.title),
        precoLd: oferta?.price || oferta?.lowPrice || '',
        precoMeta: document.querySelector('meta[property="product:price:amount"]')?.content || '',
        precoTexto: primeiroTexto([
          '[data-testid="price-value"]',
          '[data-testid="price"]',
          '[data-testid*="price-value"]',
          '[data-testid*="price"]'
        ]),
        precoAnterior: primeiroTexto([
          '[data-testid="price-original"]',
          '[data-testid="original-price"]',
          '[data-testid*="price-original"]',
          's',
          'del'
        ]),
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
        corpo: texto(document.body?.innerText || '').slice(0, 30000)
      };
    });

    return normalizarResultado(dados, linkConsulta);
  } catch (error) {
    return {
      ok: false,
      error: 'Não consegui abrir o produto na Magazine Você.',
      detalhe: String(error?.message || error)
    };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}
