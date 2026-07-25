import express from 'express';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = Number(process.env.INTERNAL_API_PORT || 3001);
const INTERNAL_URL = `http://127.0.0.1:${INTERNAL_PORT}`;

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

async function converterComPlaywright(linkOriginal) {
  const idsDiretos = extrairIdsShopee(linkOriginal);
  if (idsDiretos) {
    return { ok: true, ids: idsDiretos, linkCompleto: montarLinkCompleto(idsDiretos), metodo: 'direto' };
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
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
    const candidatos = new Set([linkOriginal]);

    page.on('framenavigated', frame => {
      const url = frame.url();
      if (url) candidatos.add(url);
    });

    page.on('request', request => {
      const url = request.url();
      if (/shopee\.com\.br/i.test(url)) candidatos.add(url);
    });

    await page.goto(linkOriginal, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(5000);

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
          metodo: 'playwright',
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
    return { ok: false, metodo: 'playwright-erro', detalhe: error.message };
  } finally {
    await browser?.close().catch(() => {});
  }
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
    if (valor !== undefined && valor !== null) params.set(chave, String(valor));
  }

  let conversao = null;
  if (linkOriginal && ehLinkCurtoShopee(linkOriginal)) {
    conversao = await converterComPlaywright(linkOriginal);
    if (conversao.ok) {
      params.set('url', conversao.linkCompleto);
      params.delete('link');
    }
  }

  try {
    const resposta = await fetch(`${INTERNAL_URL}/shopee/produto?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    const dados = await resposta.json();

    if (conversao?.ok) {
      dados.linkOriginal = linkOriginal;
      dados.linkCompleto = conversao.linkCompleto;
      dados.metodoConversao = conversao.metodo;
    } else if (conversao && !conversao.ok && dados?.origem === 'shopee-fallback') {
      dados.aviso = `O navegador do Render não conseguiu converter o link curto: ${conversao.detalhe || 'sem detalhes'}`;
      dados.metodoConversao = conversao.metodo;
    }

    return res.status(resposta.status).json(dados);
  } catch (error) {
    return res.status(502).json({ ok: false, error: `Falha ao consultar a API interna: ${error.message}` });
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
});

function encerrar() {
  if (!apiProcess.killed) apiProcess.kill('SIGTERM');
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
