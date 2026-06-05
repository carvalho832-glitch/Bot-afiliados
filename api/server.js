import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL_ENV = (process.env.GEMINI_MODEL || '').trim();
const GEMINI_MODEL = !GEMINI_MODEL_ENV || GEMINI_MODEL_ENV.includes('1.5') ? 'gemini-2.5-flash' : GEMINI_MODEL_ENV;
const FALLBACK_MODELS = Array.from(new Set([GEMINI_MODEL, 'gemini-2.5-flash-lite', 'gemini-flash-latest']));

const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID || '';
const SHOPEE_SECRET = process.env.SHOPEE_SECRET || '';
const SHOPEE_GRAPHQL_URL = process.env.SHOPEE_GRAPHQL_URL || 'https://open-api.affiliate.shopee.com.br/graphql';

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Accept', 'Authorization'] }));
app.options('*', cors());
app.use(express.json({ limit: '1mb', type: ['application/json', 'application/*+json'] }));
app.use(express.text({ limit: '1mb', type: 'text/plain' }));

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  res.setHeader('Access