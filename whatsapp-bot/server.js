import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import 'dotenv/config';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;

const app = express();
const PORT = process.env.PORT || 3010;

const GRUPO_TESTE_ID = '120363426800905804@g.us';
const GRUPO_TESTE_NOME = 'Grupo teste';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
