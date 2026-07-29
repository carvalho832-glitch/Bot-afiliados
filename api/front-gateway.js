import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { buscarProdutoMagalu, fecharMagaluBrowser } = await import('./magalu-service.js');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const GATEWAY_PORT = Number(process.env.GATEWAY_INTERNAL_PORT || 3099);
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const BOT_URL = String(process.env.BOT_PANEL_URL || 'https://bot.achoulevoubot.uk').replace(/\/+$/, '');
const BOT_USER = process.env.BOT_PANEL_USER || 'julio';
const BOT_PASSWORD = process.env.BOT_PANEL_PASSWORD || 'AchouLevou2026';

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

function ehLinkProdutoMagalu(valor = '') {
  try {
    const url = new URL(String(valor || '').trim());
    return /(?:magazineluiza|magalu)\.com\.br$/i.test(url.hostname) && /\/p\//i.test(url.pathname);
  } catch {
    return false;
  }
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
      detalhe: 'Cole um endereço completo de magazineluiza.com.br que contenha /p/.'
    });
  }

  try {
    const alvoConsulta = linkConsulta || linkAfiliado;
    const resultado = await buscarProdutoMagalu(alvoConsulta);

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
  await fecharMagaluBrowser().catch(() => {});
  if (!gatewayProcess.killed) gatewayProcess.kill('SIGTERM');
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
