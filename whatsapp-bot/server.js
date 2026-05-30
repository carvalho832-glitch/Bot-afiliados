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
  qrRaw = qr