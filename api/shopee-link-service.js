import { chromium } from 'playwright';

const BROWSER_IDLE_MS = Math.max(30000, Number(process.env.SHOPEE_BROWSER_IDLE_MS || 90000));
const NAVIGATION_TIMEOUT_MS = Math.max(20000, Number(process.env.SHOPEE_NAVIGATION_TIMEOUT_MS || 35000));
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

let browserCompartilhado = null;
let browserPromise = null;
let browserIdleTimer = null;
let fila = Promise.resolve();

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

  // Novo formato observado em links de afiliado da Shopee:
  // https://shopee.com.br/<rota-ou-slug>/<shopId>/<itemId>?...
  try {
    const url = new URL(extrairLink(texto));
    if (/(^|\.)shopee\.com\.br$/i.test(url.hostname)) {
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
    }
  } catch {}

  return null;
}

function montarLinkCompleto(ids) {
  return ids?.shopId && ids?.itemId
    ? `https://shopee.com.br/product/${ids.shopId}/${ids.itemId}`
    : '';
}

function ehLinkCurtoShopee(valor = '') {
  return /s\.shopee\.com\.br|shp\.ee|collshp\.com/i.test(String(valor || ''));
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

async function resolverPorRedirect(linkOriginal) {
  let atual = linkOriginal;
  for (let etapa = 0; etapa < 8; etapa += 1) {
    const ids = extrairIdsShopee(atual);
    if (ids) return { ok: true, ids, linkCompleto: montarLinkCompleto(ids), metodo: 'redirect-leve', urlFinal: atual };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const resposta = await fetch(atual, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': MOBILE_UA,
          'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });

      const location = resposta.headers.get('location');
      if (!location) break;
      const proximo = new URL(location, atual).toString();
      if (proximo === atual) break;
      atual = proximo;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
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
      metodo: 'direto-novo-formato',
      urlFinal: linkOriginal
    };
  }

  const leve = await resolverPorRedirect(linkOriginal);
  if (leve?.ok) return leve;

  if (!ehLinkCurtoShopee(linkOriginal)) {
    return { ok: false, error: 'O link da Shopee não contém shopId e itemId reconhecíveis.' };
  }

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

      const candidatos = new Set([linkOriginal]);
      const adicionar = url => {
        if (url && /shopee\.com\.br/i.test(url)) candidatos.add(url);
      };
      page.on('framenavigated', frame => adicionar(frame.url()));
      page.on('request', request => adicionar(request.url()));
      page.on('response', response => adicionar(response.url()));

      await page.goto(linkOriginal, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null);
      await page.waitForTimeout(3000);
      adicionar(page.url());

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href').catch(() => '');
      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content').catch(() => '');
      adicionar(canonical);
      adicionar(ogUrl);

      for (const candidato of candidatos) {
        const ids = extrairIdsShopee(candidato);
        if (ids) {
          return {
            ok: true,
            ids,
            linkCompleto: montarLinkCompleto(ids),
            metodo: 'playwright-novo-formato',
            urlFinal: candidato
          };
        }
      }

      return {
        ok: false,
        error: 'A Shopee abriu o link, mas os códigos do produto não foram reconhecidos.',
        detalhe: `Página final: ${page.url()}`
      };
    } catch (error) {
      if (/browser.*closed|target page.*closed|connection closed|disconnected/i.test(String(error?.message || ''))) {
        await fecharBrowser();
      }
      return { ok: false, error: 'Não consegui converter o link curto da Shopee.', detalhe: String(error?.message || error) };
    } finally {
      await context?.close().catch(() => {});
      if (browserCompartilhado?.isConnected?.()) programarFechamento();
    }
  });
}

export async function fecharShopeeBrowser() {
  await fecharBrowser();
}
