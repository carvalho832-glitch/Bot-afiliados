import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import tar from 'tar';

const __filename = fileURLToPath(import.meta.url);
const APP_DIR = path.dirname(__filename);
const profile = String(process.env.BOT_PROFILE || 'julio').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'julio';
const bucket = String(process.env.R2_BUCKET || '').trim();
const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
const key = String(process.env.R2_BACKUP_KEY || `achou-levou/${profile}/state.tar.gz`).trim();

function configured() {
  return Boolean(bucket && accountId && accessKeyId && secretAccessKey && key);
}

function client() {
  if (!configured()) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

async function streamToFile(body, target) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const stream = body?.transformToWebStream ? body.transformToWebStream() : body;
  if (!stream) throw new Error('R2 retornou um objeto sem conteúdo.');

  if (stream.getReader) {
    const reader = stream.getReader();
    const out = fs.createWriteStream(target);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!out.write(Buffer.from(value))) await new Promise(resolve => out.once('drain', resolve));
      }
    } finally {
      out.end();
      await new Promise((resolve, reject) => {
        out.once('finish', resolve);
        out.once('error', reject);
      });
    }
    return;
  }

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(target);
    stream.pipe(out);
    stream.once('error', reject);
    out.once('error', reject);
    out.once('finish', resolve);
  });
}

async function existsRemote(s3) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return false;
    throw error;
  }
}

async function restore() {
  const s3 = client();
  if (!s3) {
    console.log('[R2] Backup não configurado; restauração ignorada.');
    return { ok: true, skipped: true };
  }
  if (!(await existsRemote(s3))) {
    console.log(`[R2] Primeiro uso do perfil ${profile}; nenhum backup remoto encontrado.`);
    return { ok: true, empty: true };
  }

  const tmp = path.join(os.tmpdir(), `achou-levou-${profile}-restore-${process.pid}.tar.gz`);
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    await streamToFile(result.Body, tmp);
    await tar.x({ file: tmp, cwd: APP_DIR, gzip: true, preservePaths: false });
    console.log(`[R2] Estado do perfil ${profile} restaurado com sucesso.`);
    return { ok: true, restored: true };
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    s3.destroy();
  }
}

async function backup() {
  const s3 = client();
  if (!s3) {
    console.log('[R2] Backup não configurado; gravação ignorada.');
    return { ok: true, skipped: true };
  }

  const candidates = ['.wwebjs_auth', 'data'].filter(name => fs.existsSync(path.join(APP_DIR, name)));
  if (!candidates.length) {
    console.log(`[R2] Nada para salvar no perfil ${profile}.`);
    s3.destroy();
    return { ok: true, empty: true };
  }

  const tmp = path.join(os.tmpdir(), `achou-levou-${profile}-backup-${process.pid}.tar.gz`);
  try {
    await tar.c({ file: tmp, cwd: APP_DIR, gzip: true, portable: true }, candidates);
    const stat = await fsp.stat(tmp);
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(tmp),
      ContentType: 'application/gzip',
      Metadata: {
        profile,
        savedat: new Date().toISOString()
      }
    }));
    console.log(`[R2] Backup do perfil ${profile} salvo (${Math.ceil(stat.size / 1024)} KB).`);
    return { ok: true, bytes: stat.size };
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    s3.destroy();
  }
}

const command = String(process.argv[2] || 'backup').toLowerCase();
try {
  if (command === 'restore') await restore();
  else if (command === 'backup') await backup();
  else throw new Error(`Comando desconhecido: ${command}`);
} catch (error) {
  console.error(`[R2] ${command} falhou:`, error?.stack || error);
  process.exitCode = 1;
}
