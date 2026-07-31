'use strict';

const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverFile, 'utf8');
const marker = "from './gemini-service.mjs'";

if (source.includes(marker)) {
  console.log('[GEMINI] Integração já aplicada ao server.js.');
  process.exit(0);
}

const importMarker = "import crypto from 'crypto';";
if (!source.includes(importMarker)) {
  throw new Error('[GEMINI] Import esperado não encontrado em server.js.');
}

source = source.replace(
  importMarker,
  `${importMarker}\nimport { gerarMensagemComGemini } from './gemini-service.mjs';`
);

const routeBefore = `app.post('/gerar-mensagem', (req, res) => {
  const dados = req.body || {};
  return res.json({ ok: true, model: 'local', mensagem: montarMensagem(dados) });
});`;

const routeAfter = `app.post('/gerar-mensagem', async (req, res) => {
  try {
    const resultado = await gerarMensagemComGemini(req.body || {}, { clientId: req.ip });
    return res.json({ ok: true, ...resultado });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    console.error('[GEMINI] Falha ao gerar mensagem:', error?.stack || error);
    return res.status(status).json({ ok: false, error: String(error?.message || error) });
  }
});`;

if (!source.includes(routeBefore)) {
  throw new Error('[GEMINI] Rota antiga /gerar-mensagem não encontrada. Nenhuma alteração aplicada.');
}
source = source.replace(routeBefore, routeAfter);

if (!source.includes(marker) || !source.includes("app.post('/gerar-mensagem', async")) {
  throw new Error('[GEMINI] Validação da integração falhou.');
}

const backupFile = `${serverFile}.backup-antes-gemini`;
if (!fs.existsSync(backupFile)) fs.copyFileSync(serverFile, backupFile);

const temporary = `${serverFile}.tmp-${process.pid}`;
fs.writeFileSync(temporary, source);
fs.renameSync(temporary, serverFile);
console.log('[GEMINI] Rota de geração conectada ao Gemini com fallback local seguro.');
