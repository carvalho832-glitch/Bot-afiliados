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