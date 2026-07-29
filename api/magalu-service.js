import { chromium } from 'playwright';

const BROWSER_IDLE_MS = Math.max(30000, Number(process.env.MAGALU_BROWSER_IDLE_MS || 90000));
const NAVIGATION_TIMEOUT_MS = Math.max(20000, Number(process.env.MAGALU_NAVIGATION_TIMEOUT_MS || 40000));

let browserCompartilhado = null;
let browserPromise = null;
let browserIdleTimer = null;
let fila = Promise.resolve();

function limparTexto(valor = '') {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function extrairLink(valor = '') {
  return limparTexto(valor).match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.;]+$/, '') || limparTexto(valor);
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

function ehUrlMagalu(valor = '') {
  return /(?:magazineluiza|magalu)\.com\.br/i.test(String(valor));
}

function ehUrlProdutoMagalu(valor = '') {
  const texto = String(valor || '');
  return ehUrlMagalu(texto) && /\/p\//i.test(texto);
}

function coletarUrlsAninhadas(valor, saida = new Set()) {
  const texto = decodificar(valor);
  if (!texto) return saida;

  const urls = texto.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
  for (const urlBruta of urls) {
    const url = urlBruta.replace(/[),.;]+$/, '');
    if (!saida.has(url)) {
      saida.add(url);
      coletarUrlsAninhadas(url, saida);
    }
  }

  try {
    const url = new URL(texto);
    saida.add(url.toString());
    for (const valorParametro of url.searchParams.values()) {
      coletarUrlsAninhadas(valorParametro, saida);
    }
  } catch {}

  return saida;
}

function formatarMoeda(valor) {
  const numero = Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) return '';
  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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

function limparTitulo(valor = '') {
  return limparTexto(valor)
    .replace(/\s*[|–-]\s*Magazine Luiza.*$/i, '')
    .replace(/\s*[|–-]\s*Magalu.*$/i, '')
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

async function fetchComTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function resolverLeve(linkOriginal) {
  const candidatos = coletarUrlsAninhadas(linkOriginal);
  try {
    const resposta = await fetchComTimeout(linkOriginal);
    candidatos.add(resposta.url);
    const tipo = resposta.headers.get('content-type') || '';
    if (/text|html|json|javascript/i.test(tipo)) {
      const corpo = await resposta.text();
      coletarUrlsAninhadas(corpo, candidatos);
    }
  } catch {}

  return Array.from(candidatos).find(ehUrlProdutoMagalu) ||
    Array.from(candidatos).find(ehUrlMagalu) ||
    linkOriginal;
}

async function fecharBrowser() {
  clearTimeout(browserIdleTimer);
  browserIdleTimer = null;
  const browser = browserCompartilhado;
  browserCompartilhado = null;
  browserPromise = null;
  if (browser) await browser.close().catch(() => {});
}

function programarFechamento() {
  clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(() => fecharBrowser().catch(() => {}), BROWSER_IDLE_MS);
  browserIdleTimer.unref?.();
}

async function obterBrowser() {
  if (browserCompartilhado?.isConnected?.()) return browserCompartilhado;
  if (browserPromise) return browserPromise;

  browserPromise = chromium.launch({
    headless: true,
    executablePath: chromium.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }).then(browser => {
    browserCompartilhado = browser;
    browser.on('disconnected', () => {
      if (browserCompartilhado === browser) browserCompartilhado = null;
    });
    return browser;
  }).finally(() => {
    browserPromise = null;
  });

  return browserPromise;
}

function executarEmFila(tarefa) {
  const execucao = fila.then(tarefa, tarefa);
  fila = execucao.catch(() => {});
  return execucao;
}

async function extrairDaPagina(page) {
  return page.evaluate(() => {
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
      precoAnteriorTexto: primeiroTexto([
        '[data-testid="price-original"]',
        '[data-testid="original-price"]',
        '[data-testid*="price-original"]',
        's',
        'del'
      ]),
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
      corpo: texto(document.body?.innerText || '').slice(0, 25000)
    };
  });
}

function normalizarDadosPagina(dados, linkOriginal, linkCompleto) {
  const produto = limparTitulo(dados?.titulo || '');
  let precoAtual = numeroDeMoeda(dados?.precoLd || dados?.precoMeta || dados?.precoTexto || '');
  let precoAnterior = numeroDeMoeda(dados?.precoAnteriorTexto || '');

  const corpo = String(dados?.corpo || '');
  if (!precoAtual) {
    const por = corpo.match(/(?:por|à vista|no pix)\s*R\$\s*([\d.]+,\d{2})/i) ||
      corpo.match(/R\$\s*([\d.]+,\d{2})/i);
    precoAtual = numeroDeMoeda(por?.[1] || '');
  }
  if (!precoAnterior) {
    const de = corpo.match(/(?:de|preço anterior)\s*R\$\s*([\d.]+,\d{2})/i);
    precoAnterior = numeroDeMoeda(de?.[1] || '');
  }
  if (precoAnterior && precoAtual && precoAnterior <= precoAtual) precoAnterior = 0;

  const tituloInvalido = !produto || produto.length < 5 || /partner_id|promoter_id|onelink|^https?:/i.test(produto);
  if (tituloInvalido) {
    return {
      ok: false,
      error: 'A Magalu abriu o link, mas não entregou o nome do produto.',
      detalhe: `Página final: ${linkCompleto || linkOriginal}`
    };
  }

  return {
    ok: true,
    loja: 'Magalu',
    produto,
    precoDe: formatarMoeda(precoAnterior),
    precoPor: formatarMoeda(precoAtual),
    cupom: '',
    desconto: precoAnterior > precoAtual && precoAtual > 0
      ? `${Math.floor(((precoAnterior - precoAtual) / precoAnterior) * 100)}% OFF`
      : '',
    linkOriginal,
    linkCompleto,
    origem: 'magalu-playwright',
    aviso: precoAtual ? '' : 'O produto foi localizado, mas a Magalu não exibiu o preço para esta sessão.'
  };
}

export async function buscarProdutoMagalu(valor) {
  const linkOriginal = extrairLink(valor);
  if (!linkOriginal) return { ok: false, error: 'Informe o link da Magalu.' };
  if (!/(?:magazineluiza|magalu)(?:\.onelink)?\./i.test(linkOriginal)) {
    return { ok: false, error: 'O endereço informado não parece ser um link da Magalu.' };
  }

  const linkResolvidoLeve = await resolverLeve(linkOriginal);

  return executarEmFila(async () => {
    let context;
    try {
      const browser = await obterBrowser();
      context = await browser.newContext({
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1365, height: 900 },
        extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' }
      });

      const page = await context.newPage();
      await page.route('**/*', route => {
        const tipo = route.request().resourceType();
        if (['image', 'media', 'font'].includes(tipo)) return route.abort();
        return route.continue();
      });

      const candidatos = coletarUrlsAninhadas(linkOriginal);
      coletarUrlsAninhadas(linkResolvidoLeve, candidatos);
      page.on('framenavigated', frame => coletarUrlsAninhadas(frame.url(), candidatos));
      page.on('request', request => coletarUrlsAninhadas(request.url(), candidatos));

      await page.goto(linkResolvidoLeve, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null);
      await page.waitForTimeout(4000);
      coletarUrlsAninhadas(page.url(), candidatos);

      const destinoProduto = Array.from(candidatos).find(ehUrlProdutoMagalu);
      if (destinoProduto && page.url() !== destinoProduto) {
        await page.goto(destinoProduto, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null);
        await page.waitForTimeout(3500);
      }

      const dados = await extrairDaPagina(page);
      const linkCompleto = [dados.canonical, dados.ogUrl, page.url(), destinoProduto, linkResolvidoLeve]
        .map(extrairLink)
        .find(ehUrlMagalu) || linkResolvidoLeve;

      return normalizarDadosPagina(dados, linkOriginal, linkCompleto);
    } catch (error) {
      if (/browser.*closed|target page.*closed|connection closed|disconnected/i.test(String(error?.message || ''))) {
        await fecharBrowser();
      }
      return {
        ok: false,
        error: 'Não consegui abrir o produto da Magalu.',
        detalhe: String(error?.message || error)
      };
    } finally {
      await context?.close().catch(() => {});
      if (browserCompartilhado?.isConnected?.()) programarFechamento();
    }
  });
}

export async function fecharMagaluBrowser() {
  await fecharBrowser();
}
