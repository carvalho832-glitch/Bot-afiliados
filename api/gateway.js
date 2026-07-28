import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { chromium } = await import('playwright');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = Number(process.env.INTERNAL_API_PORT || 3001);
const INTERNAL_URL = `http://127.0.0.1:${INTERNAL_PORT}`;
const BOT_PANEL_URL = String(process.env.BOT_PANEL_URL || 'https://bot.achoulevoubot.uk').replace(/\/+$/, '');
const BOT_PANEL_USER = process.env.BOT_PANEL_USER || 'julio';
const BOT_PANEL_PASSWORD = process.env.BOT_PANEL_PASSWORD || 'AchouLevou2026';
const PLAYWRIGHT_IDLE_MS = Math.max(30000, Number(process.env.PLAYWRIGHT_IDLE_MS || 90000));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const apiProcess = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(INTERNAL_PORT) },
  stdio: 'inherit'
});

apiProcess.on('exit', (code, signal) => {
  console.error(`API interna encerrou. code=${code} signal=${signal}`);
  process.exit(code || 1);
});

let sharedBrowser = null;
let browserLaunchPromise = null;
let browserIdleTimer = null;
let playwrightQueue = Promise.resolve();

function extrairLink(valor = '') {
  const texto = String(valor || '').trim();
  return texto.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.;]+$/, '') || texto;
}

function extrairIdsShopee(valor = '') {
  const texto = String(valor || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&');

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

  return invertido ? { shopId: invertido[2], itemId: invertido[1] } : null;
}

function montarLinkCompleto(ids) {
  return ids?.shopId && ids?.itemId
    ? `https://shopee.com.br/product/${ids.shopId}/${ids.itemId}`
    : '';
}

function ehLinkCurtoShopee(link = '') {
  return /s\.shopee\.com\.br|shp\.ee|collshp\.com/i.test(link);
}

function textoNormalizado(valor = '') {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizarStatusBot(dados = {}) {
  const aninhado = dados.whatsapp || dados.session || dados.client || dados.data || {};
  const fonte = { ...dados, ...aninhado };
  const flags = ['connected', 'isConnected', 'ready', 'isReady', 'authenticated', 'isAuthenticated', 'loggedIn', 'hasSession'];

  if (flags.some(chave => fonte[chave] === true)) return { status: 'conectado', connected: true };

  const bruto = fonte.status ?? fonte.state ?? fonte.connection ?? fonte.connectionState ?? fonte.sessionStatus ?? fonte.whatsappStatus ?? '';
  const status = textoNormalizado(bruto);
  const online = ['conectado', 'connected', 'online', 'ready', 'authenticated', 'autenticado', 'open', 'opened', 'logado', 'active', 'ativo'];
  const conectando = ['conectando', 'connecting', 'initializing', 'iniciando', 'loading', 'aguardando qr', 'qr', 'qr code'];

  if (online.includes(status)) return { status: 'conectado', connected: true };
  if (conectando.includes(status)) return { status: 'conectando', connected: false };
  return { status: status || 'offline', connected: false };
}

function statusPeloHtml(html = '') {
  const texto = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');

  const match = texto.match(/Status\s*:\s*([\p{L}\s._-]{2,30})/iu);
  const encontrado = textoNormalizado(match?.[1] || '');
  if (encontrado.includes('conectado')) return { status: 'conectado', connected: true };
  if (encontrado.includes('conectando')) return { status: 'conectando', connected: false };
  if (encontrado.includes('offline') || encontrado.includes('desconectado')) return { status: 'offline', connected: false };
  return null;
}

async function fetchBotComTimeout(caminho, aceitaJson = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const authorization = `Basic ${Buffer.from(`${BOT_PANEL_USER}:${BOT_PANEL_PASSWORD}`).toString('base64')}`;

  try {
    return await fetch(`${BOT_PANEL_URL}${caminho}`, {
      headers: {
        Authorization: authorization,
        Accept: aceitaJson ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,*/*'
      },
      cache: 'no-store',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function consultarStatusRealBot() {
  const rotasJson = ['/status', '/api/status', '/painel/status'];
  const tentativas = [];

  for (const rota of rotasJson) {
    try {
      const resposta = await fetchBotComTimeout(`${rota}?t=${Date.now()}`, true);
      const tipo = resposta.headers.get('content-type') || '';
      const corpo = await resposta.text();
      tentativas.push(`${rota}:${resposta.status}`);

      if (resposta.ok && /json/i.test(tipo)) {
        const json = JSON.parse(corpo);
        const normalizado = normalizarStatusBot(json);
        if (normalizado.status !== 'offline' || normalizado.connected) {
          return { ok: true, origem: rota, ...normalizado, dados: json };
        }
      }

      if (resposta.ok) {
        const peloHtml = statusPeloHtml(corpo);
        if (peloHtml) return { ok: true, origem: rota, ...peloHtml };
      }
    } catch (error) {
      tentativas.push(`${rota}:${error.name === 'AbortError' ? 'timeout' : error.message}`);
    }
  }

  try {
    const respostaPainel = await fetchBotComTimeout(`/painel?t=${Date.now()}`, false);
    const html = await respostaPainel.text();
    tentativas.push(`/painel:${respostaPainel.status}`);
    const peloHtml = statusPeloHtml(html);
    if (respostaPainel.ok && peloHtml) return { ok: true, origem: '/painel', ...peloHtml };
  } catch (error) {
    tentativas.push(`/painel:${error.name === 'AbortError' ? 'timeout' : error.message}`);
  }

  return { ok: false, status: 'offline', connected: false, detalhe: tentativas.join(' | ') };
}

async function fecharBrowserCompartilhado() {
  clearTimeout(browserIdleTimer);
  browserIdleTimer = null;
  const browser = sharedBrowser;
  sharedBrowser = null;
  browserLaunchPromise = null;
  if (browser) await browser.close().catch(() => {});
}

function programarFechamentoBrowser() {
  clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(() => {
    fecharBrowserCompartilhado().catch(() => {});
  }, PLAYWRIGHT_IDLE_MS);
  browserIdleTimer.unref?.();
}

async function obterBrowserCompartilhado() {
  if (sharedBrowser?.isConnected?.()) return sharedBrowser;
  if (browserLaunchPromise) return browserLaunchPromise;

  browserLaunchPromise = chromium.launch({
    headless: true,
    executablePath: chromium.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }).then(browser => {
    sharedBrowser = browser;
    browser.on('disconnected', () => {
      if (sharedBrowser === browser) sharedBrowser = null;
    });
    return browser;
  }).finally(() => {
    browserLaunchPromise = null;
  });

  return browserLaunchPromise;
}

function executarPlaywrightEmFila(tarefa) {
  const execucao = playwrightQueue.then(tarefa, tarefa);
  playwrightQueue = execucao.catch(() => {});
  return execucao;
}

async function converterComPlaywright(linkOriginal) {
  const idsDiretos = extrairIdsShopee(linkOriginal);
  if (idsDiretos) {
    return { ok: true, ids: idsDiretos, linkCompleto: montarLinkCompleto(idsDiretos), metodo: 'direto' };
  }

  return executarPlaywrightEmFila(async () => {
    let context;
    try {
      const browser = await obterBrowserCompartilhado();
      context = await browser.newContext({
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        extraHTTPHeaders: {
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        }
      });

      const page = await context.newPage();
      await page.route('**/*', route => {
        const type = route.request().resourceType();
        if (['image', 'media', 'font'].includes(type)) return route.abort();
        return route.continue();
      });

      const candidatos = new Set([linkOriginal]);
      page.on('framenavigated', frame => {
        const url = frame.url();
        if (url) candidatos.add(url);
      });
      page.on('request', request => {
        const url = request.url();
        if (/shopee\.com\.br/i.test(url)) candidatos.add(url);
      });

      await page.goto(linkOriginal, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
      await page.waitForTimeout(2500);

      candidatos.add(page.url());
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href').catch(() => null);
      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content').catch(() => null);
      if (canonical) candidatos.add(canonical);
      if (ogUrl) candidatos.add(ogUrl);

      const html = await page.content().catch(() => '');
      const urlsHtml = html.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
      for (const url of urlsHtml) candidatos.add(url);

      for (const candidato of candidatos) {
        const ids = extrairIdsShopee(candidato);
        if (ids) {
          return {
            ok: true,
            ids,
            linkCompleto: montarLinkCompleto(ids),
            metodo: 'playwright-reutilizado',
            urlNavegador: page.url()
          };
        }
      }

      return {
        ok: false,
        metodo: 'playwright-sem-ids',
        detalhe: `Navegador terminou em ${page.url()}`
      };
    } catch (error) {
      if (/browser.*closed|target page.*closed|connection closed|disconnected/i.test(String(error?.message || ''))) {
        await fecharBrowserCompartilhado();
      }
      return { ok: false, metodo: 'playwright-erro', detalhe: error.message };
    } finally {
      await context?.close().catch(() => {});
      if (sharedBrowser?.isConnected?.()) programarFechamentoBrowser();
    }
  });
}

async function consultarApiInterna(params, timeoutMs = 35000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resposta = await fetch(`${INTERNAL_URL}/shopee/produto?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    const corpo = await resposta.text();
    let dados = null;
    try { dados = JSON.parse(corpo); } catch {}
    if (!dados) throw new Error(`A API interna devolveu uma resposta inválida (HTTP ${resposta.status}).`);
    return { resposta, dados };
  } finally {
    clearTimeout(timer);
  }
}

function deveUsarPlaywrightComoFallback(dados) {
  if (dados?.origem !== 'shopee-fallback') return false;
  const aviso = textoNormalizado(dados?.aviso || dados?.error || '');
  if (aviso.includes('api oficial')) return false;
  return aviso.includes('converter o link') || aviso.includes('identificar itemid') || aviso.includes('shopid');
}

async function esperarApiInterna(tentativas = 30) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const resposta = await fetch(`${INTERNAL_URL}/health`);
      if (resposta.ok) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

const apiPronta = esperarApiInterna();

app.get('/bot/status', async (_req, res) => {
  const status = await consultarStatusRealBot();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return res.status(status.ok ? 200 : 503).json(status);
});

app.get('/shopee/converter-link', async (req, res) => {
  const link = extrairLink(req.query.url || req.query.link || '');
  if (!link) return res.status(400).json({ ok: false, error: 'Informe o link da Shopee.' });

  const conversao = await converterComPlaywright(link);
  return res.status(conversao.ok ? 200 : 422).json({ linkOriginal: link, ...conversao });
});

app.get('/shopee/produto', async (req, res) => {
  await apiPronta;
  const linkOriginal = extrairLink(req.query.url || req.query.link || '');
  const params = new URLSearchParams();

  for (const [chave, valor] of Object.entries(req.query)) {
    if (valor !== undefined && valor !== null && !String(chave).startsWith('_')) {
      params.set(chave, String(valor));
    }
  }

  try {
    // Primeiro usa o conversor leve da API interna. O Chromium só entra como
    // plano B quando o link curto realmente não revela shopId e itemId.
    const primeira = await consultarApiInterna(params);
    let dados = primeira.dados;
    let statusResposta = primeira.resposta.status;

    if (linkOriginal && ehLinkCurtoShopee(linkOriginal) && deveUsarPlaywrightComoFallback(dados)) {
      const conversao = await converterComPlaywright(linkOriginal);

      if (conversao.ok) {
        const paramsConvertidos = new URLSearchParams(params);
        paramsConvertidos.set('url', conversao.linkCompleto);
        paramsConvertidos.delete('link');
        paramsConvertidos.delete('id');
        paramsConvertidos.delete('codigo');

        const segunda = await consultarApiInterna(paramsConvertidos);
        dados = segunda.dados;
        statusResposta = segunda.resposta.status;
        dados.linkOriginal = linkOriginal;
        dados.linkCompleto = conversao.linkCompleto;
        dados.metodoConversao = conversao.metodo;
      } else {
        dados.aviso = `O navegador de recuperação não conseguiu converter o link curto: ${conversao.detalhe || 'sem detalhes'}`;
        dados.metodoConversao = conversao.metodo;
      }
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return res.status(statusResposta).json(dados);
  } catch (error) {
    const detalhe = error?.name === 'AbortError'
      ? 'A consulta interna demorou além do limite.'
      : error.message;
    return res.status(502).json({ ok: false, error: `Falha ao consultar a API interna: ${detalhe}` });
  }
});

app.use(async (req, res) => {
  await apiPronta;
  try {
    const destino = `${INTERNAL_URL}${req.originalUrl}`;
    const opcoes = {
      method: req.method,
      headers: { 'Content-Type': req.get('content-type') || 'application/json', Accept: req.get('accept') || 'application/json' }
    };
    if (!['GET', 'HEAD'].includes(req.method)) opcoes.body = JSON.stringify(req.body || {});

    const resposta = await fetch(destino, opcoes);
    const tipo = resposta.headers.get('content-type') || 'application/json';
    const corpo = Buffer.from(await resposta.arrayBuffer());
    res.status(resposta.status).type(tipo).send(corpo);
  } catch (error) {
    res.status(502).json({ ok: false, error: `Gateway indisponível: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Gateway Playwright do Achou Levou rodando na porta ${PORT}`);
  console.log(`PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`);
});

async function encerrar() {
  await fecharBrowserCompartilhado();
  if (!apiProcess.killed) apiProcess.kill('SIGTERM');
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
