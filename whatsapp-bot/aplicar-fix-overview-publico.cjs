'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let source = fs.readFileSync(file, 'utf8');

const routeOnly = `app.get('/overview', publicOverviewCors, async (req, res) => {
  function findExistingGetHandler(pathname) {
    const router = app._router || app.router;
    const stack = Array.isArray(router?.stack) ? router.stack : [];

    for (const layer of stack) {
      const route = layer?.route;
      if (!route?.methods?.get) continue;

      const configuredPath = route.path;
      const matches = Array.isArray(configuredPath)
        ? configuredPath.includes(pathname)
        : configuredPath === pathname;
      if (!matches) continue;

      const routeStack = Array.isArray(route.stack) ? route.stack : [];
      for (let index = routeStack.length - 1; index >= 0; index -= 1) {
        const handler = routeStack[index]?.handle;
        if (typeof handler === 'function') return handler;
      }
    }

    return null;
  }

  function callExistingGet(pathname) {
    return new Promise((resolve, reject) => {
      const handler = findExistingGetHandler(pathname);
      if (!handler) {
        reject(new Error(\`Rota interna \${pathname} não encontrada.\`));
        return;
      }

      let statusCode = 200;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(\`Tempo esgotado ao consultar \${pathname}.\`));
        }
      }, 8000);

      const finish = payload => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ statusCode, payload });
      };

      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error || 'Falha interna.')));
      };

      const fakeReq = Object.create(req);
      Object.defineProperties(fakeReq, {
        method: { value: 'GET', writable: true, configurable: true },
        url: { value: pathname, writable: true, configurable: true },
        originalUrl: { value: pathname, writable: true, configurable: true },
        path: { value: pathname, writable: true, configurable: true },
        query: { value: {}, writable: true, configurable: true }
      });

      const fakeRes = {
        status(code) {
          statusCode = Number(code) || statusCode;
          return this;
        },
        json(payload) {
          finish(payload);
          return this;
        },
        send(payload) {
          let normalized = payload;
          if (Buffer.isBuffer(normalized)) normalized = normalized.toString('utf8');
          if (typeof normalized === 'string') {
            try { normalized = JSON.parse(normalized); } catch {}
          }
          finish(normalized);
          return this;
        },
        end(payload) {
          finish(payload ?? null);
          return this;
        },
        sendStatus(code) {
          statusCode = Number(code) || 500;
          finish({ status: statusCode });
          return this;
        },
        setHeader() { return this; },
        header() { return this; },
        set() { return this; },
        type() { return this; }
      };

      const next = error => fail(error || new Error(\`A rota \${pathname} não produziu resposta.\`));

      try {
        const result = handler(fakeReq, fakeRes, next);
        if (result && typeof result.then === 'function') result.catch(fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  const [statusResult, queueResult] = await Promise.allSettled([
    callExistingGet('/status'),
    callExistingGet('/queue')
  ]);

  const statusPayload = statusResult.status === 'fulfilled'
    ? statusResult.value.payload
    : null;
  const queuePayload = queueResult.status === 'fulfilled'
    ? queueResult.value.payload
    : null;
  const queue = queuePayload?.queue || queuePayload || null;

  if (!statusPayload && !queue) {
    return res.status(502).json({
      ok: false,
      error: 'As rotas internas de status e fila não responderam.',
      details: {
        status: statusResult.status === 'rejected' ? String(statusResult.reason?.message || statusResult.reason) : null,
        queue: queueResult.status === 'rejected' ? String(queueResult.reason?.message || queueResult.reason) : null
      },
      checkedAt: new Date().toISOString()
    });
  }

  return res.json({
    ok: true,
    status: statusPayload,
    queue,
    partial: !(statusPayload && queue),
    errors: {
      status: statusResult.status === 'rejected' ? String(statusResult.reason?.message || statusResult.reason) : null,
      queue: queueResult.status === 'rejected' ? String(queueResult.reason?.message || queueResult.reason) : null
    },
    checkedAt: new Date().toISOString()
  });
});`;

const fullPublicRoute = `
// Leitura pública e somente leitura para o painel Achou Levou.
// Não expõe comandos de envio, configurações ou controle da fila.
function publicOverviewCors(req, res, next) {
  const origin = String(req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

app.options('/overview', publicOverviewCors);
${routeOnly}

`;

let updated = source;
const existingOverviewPattern = /app\.get\(\s*['"]\/overview['"]\s*,\s*publicOverviewCors\s*,[\s\S]*?\n\}\);/;

if (existingOverviewPattern.test(updated)) {
  updated = updated.replace(existingOverviewPattern, routeOnly);
  console.log('[OVERVIEW] Rota existente substituída pela versão compatível.');
} else {
  const anchors = [
    /app\.get\(\s*['"]\/['"]\s*,/,
    /app\.get\(\s*['"]\/painel['"]\s*,/,
    /app\.get\(\s*['"]\/status['"]\s*,/,
    /app\.get\(\s*['"]\/diagnostics['"]\s*,/,
    /app\.get\(\s*['"]\/queue['"]\s*,/
  ];

  let anchorIndex = -1;
  for (const pattern of anchors) {
    const match = pattern.exec(updated);
    if (match && (anchorIndex < 0 || match.index < anchorIndex)) anchorIndex = match.index;
  }

  if (anchorIndex < 0) {
    throw new Error('[OVERVIEW] Nenhuma rota Express conhecida foi localizada em server.js. Nada foi alterado.');
  }

  updated = updated.slice(0, anchorIndex) + fullPublicRoute + updated.slice(anchorIndex);
  console.log('[OVERVIEW] Nova rota compatível inserida.');
}

if (updated === source || !updated.includes("app.get('/overview'")) {
  throw new Error('[OVERVIEW] A validação da alteração falhou. Nada foi alterado.');
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const backup = `${file}.backup-overview-compat-${stamp}`;
fs.copyFileSync(file, backup);

const temporary = `${file}.tmp-${process.pid}`;
fs.writeFileSync(temporary, updated, 'utf8');
fs.renameSync(temporary, file);

console.log('[OVERVIEW] Ponte somente leitura instalada com sucesso.');
console.log(`[OVERVIEW] Backup criado em: ${backup}`);
