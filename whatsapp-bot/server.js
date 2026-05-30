import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import 'dotenv/config';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;

const app = express();
const PORT = process.env.PORT || 3010;
const GRUPO_TESTE_ID = '120363426800905804@g.us';

app.use(cors());
app.use(express.json());

let status = 'iniciando';
let qrDataUrl = null;
let qrRaw = null;
let readyAt = null;
let lastError = null;

const client = new Client({
  auth