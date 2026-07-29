import { chromium } from 'playwright';

const BROWSER_IDLE_MS = Math.max(30000, Number(process.env.MAGALU_BROWSER_IDLE_MS || 90000));
const NAVIGATION_TIMEOUT_MS = Math.max(20000, Number(process.env.MAGALU_NAVIGATION_TIMEOUT_MS || 40000));
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

function ehLinkAfiliadoMagalu(valor = '') {
  return /magazineluiza\.onelink\.me/i.test(String(valor));
}

function ehUrlMagalu(valor = '') {
  return /(?:magazineluiza|magalu)\.com\.br/i.test(String(valor));
}

function ehUrlProdutoMagalu(valor = '') {
  const texto = String(valor || '');
  return ehUrlMagalu(texto) && /\/p\//i.test(texto);
}

function ehHttp(valor = '') {
  return /^https?:\/\//i.test(String(valor || ''));
}

function normalizarUrl(valor, base = '') {
  const texto = decodificar(String(valor || '').replace(/^['"]|['"]$/g, '').trim());
  if (!texto) return '';

  try {
    return new URL(texto, base || undefined).toString();
  } catch {
    return texto;
  }
}

function adicionarCandidato(saida, valor, base = '') {
  const normalizado = normalizarUrl(valor, base);
  if (!normalizado || saida.has(normalizado)) return;
  saida.add(normalizado);
}

function coletarIntent(valor, saida) {
  const texto = decodificar(valor);
  if (!texto) return;

  const fallbackRegex = /(?:^|[;?&#])(?:S\.)?(?:browser_fallback_url|af_web_dp|af_android_url|af_ios_url|af_dp|deep_link_value|redirect|redirect_url|url)=([^;#&\s]+)/gi;
  for (const match of texto.matchAll(fallbackRegex)) {
    adicionarCandidato(saida, match[1]);
  }

  const intent = texto.match(/^intent:\/\/([^#]+)#Intent;([\s\S]+);end$/i);
  if (intent) {
    const corpo = intent[2];
    const scheme = corpo.match(/(?:^|;)scheme=([^;]+)/i)?.[1] || '';
    const fallback = corpo.match(/(?:^|;)S\.browser_fallback_url=([^;]+)/i)?.[1] || '';
    if (fallback) adicionarCandidato(saida, fallback);
    if (/^https?$/i.test(scheme)) adicionarCandidato(saida, `${scheme}://${intent[1]}`);
  }
}

function coletarUrlsAninhadas(valor, saida = new Set(), profundidade = 0, base = '') {
  if (profundidade > 5) return saida;
  const texto = decodificar(valor);
  if (!texto) return saida;

  coletarIntent(texto, saida);

  const urls = texto.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
  for (const urlBruta of urls) {
    const url = normalizarUrl(urlBruta.replace(/[),.;]+$/, ''), base);
    if (!url || saida.has(url)) continue;
    saida.add(url);
    coletarUrlsAninhadas(url, saida, profundidade + 1, url);
  }

  const atribuicoes = /(?:location(?:\.href)?|window\.location|document\.location|url|redirect|redirect_url|af_web_dp|browser_fallback_url)\s*[:=]\s*["']([^"']+)["']/gi;
  for (const match of texto.matchAll(atribuicoes)) {
    const url = normalizarUrl(match[1], base);
    if (url && !saida.has(url)) {
      saida.add(url);
      coletarUrlsAninhadas(url, saida, profundidade + 1, url);
    }
  }

  try {
    const url = new URL(texto, base || undefined);
    saida.add(url.toString());
    for (const valorParametro of url.searchParams.values()) {
      coletarUrlsAninhadas(valorParametro, saida, profundidade + 1, url.toString());
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

function ehPaginaDeErro(url = '', titulo = '', corpo = '') {
  const texto = `${url} ${titulo} ${corpo}`.toLowerCase();
  return /chrome-error:\/\/|chromewebdata|about:blank|não é possível acessar a página|nao e possivel acessar a pagina|this site can.?t be reached|err_[a-z_]+|dns_probe_finished|não foi possível acessar|nao foi possivel acessar/.test(texto);
}

async function fetchManual(url, userAgent, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': userAgent,
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

async function resolverCadeia(linkOriginal, userAgent, candidatos) {
  let atual = linkOriginal;

  for (let etapa = 0; etapa < 8; etapa += 1) {
    adicionarCandidato(candidatos, atual);
    if (!ehHttp(atual)) break;

    let resposta;
    try {
      resposta = await fetchManual(atual, userAgent);
    } catch {
      break;
    }

    adicionarCandidato(candidatos, resposta.url || atual, atual);
    const localizacao = resposta.headers.get('location') || '';
    if (localizacao) {
      const proxima = normalizarUrl(localizacao, atual);
      adicionarCandidato(candidatos, proxima, atual);
      coletarUrlsAninhadas(localizacao, candidatos, 0, atual);

      const produto = Array.from(candidatos).find(ehUrlProdutoMagalu);
      if (produto) return produto;

      if (ehHttp(proxima) && proxima !== atual) {
        atual = proxima;
        continue;
      }
    }

    const tipo = resposta.headers.get('content-type') || '';
    if (/text|html|json|javascript/i.test(tipo)) {
      const corpo = await resposta.text().catch(() => '');
      coletarUrlsAninhadas(corpo, candidatos, 0, resposta.url || atual);

      const refresh = corpo.match(/http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>]+)/i)?.[1] || '';
      if (refresh) adicionarCandidato(candidatos, refresh, resposta.url || atual);
    }

    const produto = Array.from(candidatos).find(ehUrlProdutoMagalu);
    if (produto) return produto;

    const paginaMagalu = Array.from(candidatos).find(url => ehUrlMagalu(url) && !ehLinkAfiliadoMagalu(url));
    if (paginaMagalu && paginaMagalu !== atual) {
      atual = paginaMagalu;
      continue;
    }

    break;
  }

  return '';
}

async function resolverLeve(linkOriginal) {
  const candidatos = coletarUrlsAninhadas(linkOriginal);

  for (const userAgent of [MOBILE_UA, DESKTOP_UA]) {
    const produto = await resolverCadeia(linkOriginal, userAgent, candidatos);
    if (produto) return { linkResolvido: produto, candidatos };
  }

  const linkResolvido = Array.from(candidatos).find(ehUrlProdutoMagalu) ||
    Array.from(candidatos).find(url => ehUrlMagalu(url) && !ehLinkAfiliadoMagalu(url)) ||
    linkOriginal;

  return { linkResolvido, candidatos };
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
      corpo: texto(document.body?.innerText || '').slice(0, 25000),
      url: location.href,
      tituloDocumento: document.title
    };
  });
}

function normalizarDadosPagina(dados, linkOriginal, linkCompleto) {
  const produto = limparTitulo(dados?.titulo || '');
  let precoAtual = numeroDeMoeda(dados?.precoLd || dados?.precoMeta || dados?.precoTexto || '');
  let precoAnterior = numeroDeMoeda(dados?.precoAnteriorTexto || '');

  const corpo = String(dados?.corpo || '');
  if (ehPaginaDeErro(dados?.url || linkCompleto, dados?.tituloDocumento || produto, corpo)) {
    return {
      ok: false,
      error: 'O OneLink da Magalu abriu uma rota de aplicativo sem página web acessível.',
      detalhe: 'A ponte ainda não encontrou a URL pública do produto dentro do redirecionamento.'
    };
  }

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

  const tituloInvalido = !produto || produto.length < 5 || /partner_id|promoter_id|onelink|^https?:|não é possível acessar|nao e possivel acessar|this site can.?t be reached/i.test(produto);
  if (tituloInvalido) {
    return {
      ok: false,
      error: 'A Magalu abriu o link, mas não entregou um nome de produto válido.',
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

  const resolucao = await resolverLeve(linkOriginal);

  return executarEmFila(async () => {
    let context;
    try {
      const browser = await obterBrowser();
      context = await browser.newContext({
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        userAgent: MOBILE_UA,
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

      const candidatos = new Set(resolucao.candidatos);
      coletarUrlsAninhadas(linkOriginal, candidatos);
      coletarUrlsAninhadas(resolucao.linkResolvido, candidatos);
      page.on('framenavigated', frame => coletarUrlsAninhadas(frame.url(), candidatos));
      page.on('request', request => coletarUrlsAninhadas(request.url(), candidatos));
      page.on('response', response => {
        coletarUrlsAninhadas(response.url(), candidatos);
        const location = response.headers()?.location || '';
        if (location) coletarUrlsAninhadas(location, candidatos, 0, response.url());
      });

      const navegar = async destino => {
        if (!ehHttp(destino)) return;
        await page.goto(destino, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null);
        await page.waitForTimeout(3500);
        coletarUrlsAninhadas(page.url(), candidatos);
        const html = await page.content().catch(() => '');
        coletarUrlsAninhadas(html, candidatos, 0, page.url());
      };

      await navegar(resolucao.linkResolvido);

      let destinoProduto = Array.from(candidatos).find(ehUrlProdutoMagalu);
      if (!destinoProduto && resolucao.linkResolvido !== linkOriginal) {
        await navegar(linkOriginal);
        destinoProduto = Array.from(candidatos).find(ehUrlProdutoMagalu);
      }

      if (destinoProduto && page.url() !== destinoProduto) {
        await navegar(destinoProduto);
      }

      const dados = await extrairDaPagina(page);
      const paginaErro = ehPaginaDeErro(dados.url, dados.tituloDocumento, dados.corpo);
      if (paginaErro && !destinoProduto) {
        return {
          ok: false,
          error: 'O OneLink da Magalu abriu apenas o aplicativo e não revelou a página web do produto.',
          detalhe: 'Tente gerar no Parceiro Magalu um link que também abra no navegador, ou copie o link completo da página do produto para a consulta.'
        };
      }

      const linkCompleto = [dados.canonical, dados.ogUrl, page.url(), destinoProduto, resolucao.linkResolvido]
        .map(extrairLink)
        .find(ehUrlMagalu) || resolucao.linkResolvido;

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
