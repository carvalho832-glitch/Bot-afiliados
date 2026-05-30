import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import 'dotenv/config';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;

const app = express();
const PORT = process.env.PORT || 3010;

app.use(cors());
app.use(express.json());

let status = 'iniciando';
let qrDataUrl = null;
let qrRaw = null;
let readyAt = null;
let lastError = null;

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'achou-levou-julio' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async qr => {
  status = 'aguardando_qr';
  qrRaw = qr;
  qrDataUrl = await qrcode.toDataURL(qr);
  console.log('QR Code gerado. Abra http://localhost:3010/qr-page');
});

client.on('ready', () => {
  status = 'conectado';
  readyAt = new Date().toISOString();
  qrRaw = null;
  qrDataUrl = null;
  lastError = null;
  console.log('WhatsApp conectado ✅');
});

client.on('authenticated', () => {
  status = 'autenticado';
  console.log('WhatsApp autenticado...');
});

client.on('auth_failure', msg => {
  status = 'falha_autenticacao';
  lastError = String(msg || 'Falha de autenticação');
  console.log('Falha:', msg);
});

client.on('disconnected', reason => {
  status = 'desconectado';
  lastError = String(reason || 'Desconectado');
  console.log('Desconectado:', reason);
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou WhatsApp Bot',
    status,
    rotas: ['/status', '/qr-page', '/qr', '/groups']
  });
});

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    status,
    readyAt,
    hasQr: Boolean(qrDataUrl),
    lastError
  });
});

app.get('/qr', (req, res) => {
  res.json({
    ok: true,
    status,
    qr: qrRaw,
    qrDataUrl
  });
});

app.get('/qr-page', (req, res) => {
  if (!qrDataUrl) {
    return res.send(`
      <html>
        <body style="font-family: Arial; text-align:center; padding:40px; background:#0d1117; color:white;">
          <h2>Status: ${status}</h2>
          <p>Se ainda não apareceu QR, aguarde alguns segundos e atualize.</p>
          <a style="color:#58a6ff" href="/qr-page">Atualizar</a>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <body style="font-family: Arial; text-align:center; padding:30px; background:#0d1117; color:white;">
        <h2>Escaneie o QR Code</h2>
        <p>WhatsApp → Aparelhos conectados → Conectar aparelho</p>
        <img src="${qrDataUrl}" style="width:300px; max-width:90%; background:white; padding:12px; border-radius:12px;" />
        <p><a style="color:#58a6ff" href="/status">Ver status</a></p>
      </body>
    </html>
  `);
});

app.get('/groups', async (req, res) => {
  try {
    if (status !== 'conectado') {
      return res.status(400).json({
        ok: false,
        error: 'WhatsApp ainda não conectado.',
        status
      });
    }

    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(chat => ({
        id: chat.id._serialized,
        name: chat.name || 'Grupo sem nome'
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ ok: true, total: groups.length, groups });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

client.initialize();

app.listen(PORT, () => {
  console.log(`Bot rodando em http://localhost:${PORT}`);
});
