import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { buscarProdutoMagalu, fecharMagaluBrowser } = await import('./magalu-service.js');
const { buscarProdutoMagazineVoce } = await import('./magazinevoce-service.js');
const { resolverLinkShopee, fecharShopeeBrowser } = await import('./shopee-link-service.js');
const { gerarLinkRastreadoShopee } = await import('./shopee-affiliate-service.js');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const GATEWAY_PORT = Number(process.env.GATEWAY_INTERNAL_PORT || 3099);
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const BOT_URL = String(process.env.BOT_PANEL_URL || 'https://bot.achoulevoubot.uk').replace(/\/+$/, '');
const BOT_USER = process.env.BOT_PANEL_USER || 'julio';
const BOT_PASSWORD = process.env.BOT_PANEL_PASSWORD || 'AchouLevou2026';
const SHOPEE_TRACKING_TOKEN = String(process.env.SHOPEE_TRACKING_TOKEN || '').trim();
const SHOPEE_TRACKING_LIMIT = Math.max(20, Number(process.env.SHOPEE_TRACKING_LIMIT_PER_10_MIN || 120));
const trackingRequests = [];

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));
app.options('*', cors());
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));

const gatewayProcess = spawn(process.execPath, ['gateway.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(GATEWAY_PORT) },
  stdio: 'inherit'
});

gatewayProcess.on('exit', (code, signal) => {
  console.error(`Gateway interno encerrou. code=${code} signal=${signal}`);
  process.exit(code || 1);
});

function authHeader() {
  return `Basic ${Buffer.from(`${BOT_USER}:${BOT_PASSWORD}`).toString('base64')}`;
}

function comparacaoSegura(recebido = '', esperado = '') {
  const a = Buffer.from(String(recebido || ''));
  const b = Buffer.from(String(esperado || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function rastreamentoAutorizado(req) {
  const recebido = String(req.get('authorization') || '').trim();
  if (SHOPEE_TRACKING_TOKEN) {
    return comparacaoSegura(recebido, `Bearer ${SHOPEE_TRACKING_TOKEN}`);
  }
  return comparacaoSegura(recebido, authHeader());
}

function dentroDoLimiteDeRastreamento() {
  const agora = Date.now();
  const inicio = agora - 10 * 60 * 1000;
  while (trackingRequests.length && trackingRequests[0] < inicio) trackingRequests.shift();
  if (trackingRequests.length >= SHOPEE_TRACKING_LIMIT) return false;
  trackingRequests.push(agora);
  return true;
}

function ehLinkProdutoMagalu(valor = '') {
  try {
    const url = new URL(String(valor || '').trim());
    const dominioValido = /(^|\.)(?:magazineluiza|magalu|magazinevoce)\.com\.br$/i.test(url.hostname);
    return dominioValido && /\/p\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function ehLinkMagazineVoce(valor = '') {
  try {
    const url = new URL(String(valor || '').trim());
    return /(^|\.)magazinevoce\.com\.br$/i.test(url.hostname) && /\/p\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function ehLinkCurtoShopee(valor = '') {
  return /s\.shopee\.com\.br|shp\.ee|collshp\.com/i.test(String(valor || ''));
}

function precisaConsultaAssistida(resultado = {}) {
  const texto = `${resultado.error || ''} ${resultado.detalhe || ''}`.toLowerCase();
  return texto.includes('url pública') ||
    texto.includes('url publica') ||
    texto.includes('apenas o aplicativo') ||
    texto.includes('rota de aplicativo') ||
    texto.includes('não revelou a página web') ||
    texto.includes('nao revelou a pagina web');
}

async function fetchComTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function lerJsonDoBot(caminho, res) {
  try {
    const separador = caminho.includes('?') ? '&' : '?';
    const resposta = await fetchComTimeout(`${BOT_URL}${caminho}${separador}t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader()
      },
      cache: 'no-store'
    }, 15000);

    const corpo = await resposta.text();
    let dados = null;
    try { dados = JSON.parse(corpo); } catch {}

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    if (!resposta.ok) {
      return res.status(resposta.status).json({
        ok: false,
        error: dados?.error || `O robô respondeu com HTTP ${resposta.status}.`,
        detalhe: corpo.slice(0, 300)
      });
    }

    if (!dados) {
      return res.status(502).json({
        ok: false,
        error: 'O robô respondeu sem JSON válido.',
        detalhe: corpo.slice(0, 300)
      });
    }

    return res.json(dados);
  } catch (error) {
    const detalhe = error?.name === 'AbortError' ? 'Tempo limite ao consultar o robô.' : error.message;
    return res.status(502).json({ ok: false, error: 'Não foi possível consultar o robô.', detalhe });
  }
}

app.post('/shopee/rastrear', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  if (!rastreamentoAutorizado(req)) {
    return res.status(401).json({ ok: false, error: 'Rastreamento não autorizado.' });
  }
  if (!dentroDoLimiteDeRastreamento()) {
    return res.status(429).json({ ok: false, error: 'Limite temporário de geração de links atingido.' });
  }

  const linkOriginal = String(req.body?.originUrl || req.body?.url || req.body?.link || '').trim();
  const subIds = Array.isArray(req.body?.subIds) ? req.body.subIds : [];
  if (!linkOriginal) return res.status(400).json({ ok: false, error: 'Informe o link da Shopee.' });
  if (!subIds.length) return res.status(400).json({ ok: false, error: 'Informe os Sub_ids do rastreamento.' });

  try {
    let linkDestino = linkOriginal;
    let resolucao = 'link-original';

    if (ehLinkCurtoShopee(linkOriginal)) {
      const conversao = await resolverLinkShopee(linkOriginal);
      if (conversao?.ok && conversao.linkCompleto) {
        linkDestino = conversao.linkCompleto;
        resolucao = conversao.metodo || 'link-curto-resolvido';
      }
    }

    const resultado = await gerarLinkRastreadoShopee({ originUrl: linkDestino, subIds });
    return res.json({
      ok: true,
      shortLink: resultado.shortLink,
      subIds: resultado.subIds,
      resolucao
    });
  } catch (error) {
    const detalhe = error?.name === 'AbortError'
      ? 'A Shopee demorou além do limite para responder.'
      : String(error?.message || error);
    console.error('[SHOPEE-TRACKING] Falha ao gerar link oficial:', detalhe);
    return res.status(502).json({
      ok: false,
      error: 'A Shopee não conseguiu gerar o link rastreado agora.',
      detalhe
    });
  }
});

app.get('/bot/queue', (_req, res) => lerJsonDoBot('/queue', res));

app.post('/bot/queue/add', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Nenhuma oferta foi recebida.' });

  try {
    const resposta = await fetchComTimeout(`${BOT_URL}/queue/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader()
      },
      body: JSON.stringify({ text })
    });

    const corpo = await resposta.text();
    let dados = null;
    try { dados = JSON.parse(corpo); } catch {}

    if (!resposta.ok) {
      return res.status(resposta.status).json({
        ok: false,
        error: dados?.error || `O robô respondeu com HTTP ${resposta.status}.`,
        detalhe: corpo.slice(0, 300)
      });
    }

    return res.json(dados || { ok: true, message: 'Ofertas enviadas para a fila.' });
  } catch (error) {
    const detalhe = error?.name === 'AbortError' ? 'Tempo limite ao falar com o robô.' : error.message;
    return res.status(502).json({ ok: false, error: 'Não foi possível enviar as ofertas ao robô.', detalhe });
  }
});

app.get('/shopee/produto', async (req, res) => {
  const linkOriginal = String(req.query.url || req.query.link || '').trim();
  const params = new URLSearchParams();

  for (const [chave, valor] of Object.entries(req.query)) {
    if (valor !== undefined && valor !== null && !String(chave).startsWith('_')) {
      params.set(chave, String(valor));
    }
  }

  let conversao = null;

  try {
    if (linkOriginal && ehLinkCurtoShopee(linkOriginal)) {
      conversao = await resolverLinkShopee(linkOriginal);
      if (!conversao.ok) {
        return res.status(422).json({
          ok: false,
          error: conversao.error || 'Não consegui converter esse link curto da Shopee.',
          detalhe: conversao.detalhe || 'A página abriu, mas os códigos do produto não foram reconhecidos.'
        });
      }

      params.set('url', conversao.linkCompleto);
      params.delete('link');
      params.delete('id');
      params.delete('codigo');
    }

    const resposta = await fetchComTimeout(`${GATEWAY_URL}/shopee/produto?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }, 130000);

    const corpo = await resposta.text();
    let dados = null;
    try { dados = JSON.parse(corpo); } catch {}

    if (!dados) {
      return res.status(502).json({
        ok: false,
        error: 'A consulta da Shopee devolveu uma resposta inválida.',
        detalhe: corpo.slice(0, 300)
      });
    }

    if (conversao?.ok) {
      dados.linkOriginal = linkOriginal;
      dados.linkCompleto = conversao.linkCompleto;
      dados.link = linkOriginal;
      dados.linkOferta = linkOriginal;
      dados.metodoConversao = conversao.metodo;
      dados.urlResolvida = conversao.urlFinal;
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    return res.status(resposta.status).json(dados);
  } catch (error) {
    const detalhe = error?.name === 'AbortError'
      ? 'A consulta da Shopee ultrapassou o tempo limite.'
      : String(error?.message || error);
    return res.status(502).json({ ok: false, error: 'Não foi possível concluir a busca da Shopee.', detalhe });
  }
});

app.get('/magalu/produto', async (req, res) => {
  const linkAfiliado = String(req.query.url || req.query.link || '').trim();
  const linkConsulta = String(req.query.consulta || req.query.linkConsulta || '').trim();

  if (!linkAfiliado) {
    return res.status(400).json({ ok: false, error: 'Informe o link da Magalu.' });
  }

  if (linkConsulta && !ehLinkProdutoMagalu(linkConsulta)) {
    return res.status(400).json({
      ok: false,
      error: 'O link usado para consulta não parece ser uma página de produto da Magalu.',
      detalhe: 'Cole um endereço de magazineluiza.com.br, magalu.com.br ou magazinevoce.com.br que contenha /p/.'
    });
  }

  try {
    const alvoConsulta = linkConsulta || linkAfiliado;
    const resultado = linkConsulta && ehLinkMagazineVoce(linkConsulta)
      ? await buscarProdutoMagazineVoce(linkConsulta)
      : await buscarProdutoMagalu(alvoConsulta);

    if (linkConsulta) {
      resultado.linkOriginal = linkAfiliado;
      resultado.linkCompleto = resultado.linkCompleto || linkConsulta;
      resultado.linkConsulta = linkConsulta;
      resultado.consultaAssistida = true;
    } else if (!resultado.ok && precisaConsultaAssistida(resultado)) {
      resultado.precisaLinkConsulta = true;
      resultado.orientacao = 'Cole o link completo da página do produto no campo de consulta. O OneLink de afiliado continuará sendo usado na mensagem.';
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    return res.status(resultado.ok ? 200 : 422).json(resultado);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: 'A ponte da Magalu não conseguiu concluir a busca.',
      detalhe: String(error?.message || error)
    });
  }
});

app.use(async (req, res) => {
  try {
    const destino = `${GATEWAY_URL}${req.originalUrl}`;
    const headers = {
      'Content-Type': req.get('content-type') || 'application/json',
      'Accept': req.get('accept') || 'application/json'
    };
    if (req.get('authorization')) headers.Authorization = req.get('authorization');

    const opcoes = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) opcoes.body = JSON.stringify(req.body || {});

    const resposta = await fetchComTimeout(destino, opcoes, 130000);
    const tipo = resposta.headers.get('content-type') || 'application/json';
    const corpo = Buffer.from(await resposta.arrayBuffer());
    res.status(resposta.status).type(tipo).send(corpo);
  } catch (error) {
    res.status(502).json({ ok: false, error: `Gateway principal indisponível: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Ponte frontal do Achou Levou rodando na porta ${PORT}`);
  console.log(`Gateway principal interno: ${GATEWAY_URL}`);
});

async function encerrar() {
  await Promise.all([
    fecharMagaluBrowser().catch(() => {}),
    fecharShopeeBrowser().catch(() => {})
  ]);
  if (!gatewayProcess.killed) gatewayProcess.kill('SIGTERM');
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
