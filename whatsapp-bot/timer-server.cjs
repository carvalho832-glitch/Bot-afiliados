const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.TIMER_PORT || process.env.PORT || 3011);
const TZ = 'America/Sao_Paulo';

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  } catch {
    return fallback;
  }
}

function validDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(date) {
  if (!date) return null;
  return date.toLocaleString('pt-BR', { timeZone: TZ });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function fmtDuration(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(ss).padStart(2, '0');
}

function getQueueItems(rawQueue) {
  if (Array.isArray(rawQueue)) return rawQueue;
  if (Array.isArray(rawQueue.items)) return rawQueue.items;
  if (Array.isArray(rawQueue.queue)) return rawQueue.queue;
  return [];
}

function normalizeStatus(status) {
  const s = String(status || 'pending').toLowerCase();
  if (s.includes('sent') || s.includes('enviado')) return 'sent';
  if (s.includes('error') || s.includes('erro')) return 'error';
  if (s.includes('pending') || s.includes('pendente')) return 'pending';
  return 'other';
}

function parseHHMM(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function nowMinutesSP() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}

function isInsideWindow(start, end) {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null) return null;

  const now = nowMinutesSP();

  if (s <= e) return now >= s && now <= e;
  return now >= s || now <= e;
}

async function getBotStatus() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('http://127.0.0.1:3010/status', {
      signal: controller.signal
    });

    clearTimeout(t);
    return await res.json();
  } catch {
    return null;
  }
}

async function getInfo() {
  const settings = readJson('data/settings.json', {});
  const rawQueue = readJson('data/queue.json', []);
  const items = getQueueItems(rawQueue);

  const queue = {
    total: items.length,
    pending: 0,
    sent: 0,
    error: 0,
    other: 0
  };

  const sentDates = [];

  for (const item of items) {
    const st = normalizeStatus(item.status);
    queue[st] = (queue[st] || 0) + 1;

    ['sentAt', 'lastSentAt', 'updatedAt'].forEach(key => {
      const d = validDate(item[key]);
      if (d && st === 'sent') sentDates.push(d);
    });
  }

  ['lastSendAt', 'lastSentAt'].forEach(key => {
    const d = validDate(settings[key]);
    if (d) sentDates.push(d);
  });

  const intervalMinutes = Number(
    settings.intervalMinutes ||
    settings.intervaloMinutos ||
    settings.interval ||
    0
  );

  const lastSend = sentDates.length
    ? new Date(Math.max(...sentDates.map(d => d.getTime())))
    : null;

  const now = new Date();

  let nextRun = lastSend && intervalMinutes
    ? new Date(lastSend.getTime() + intervalMinutes * 60000)
    : null;

  // TIMER_NEXT_RUN_FUTURE_V1
  // Se o próximo horário já passou, avança de intervalo em intervalo
  // até encontrar uma próxima rodada futura.
  if (nextRun && intervalMinutes) {
    let guard = 0;
    while (nextRun.getTime() <= now.getTime() && guard < 500) {
      nextRun = new Date(nextRun.getTime() + intervalMinutes * 60000);
      guard++;
    }
  }

  const remainingSeconds = nextRun
    ? Math.max(0, Math.ceil((nextRun.getTime() - now.getTime()) / 1000))
    : null;

  const remainingMinutes = remainingSeconds !== null
    ? Math.ceil(remainingSeconds / 60)
    : null;

  let statusText = 'Não calculada';

  if (nextRun) {
    if (remainingMinutes > 1) statusText = `Faltam ${remainingMinutes} minutos`;
    else if (remainingMinutes === 1) statusText = 'Falta 1 minuto';
    else statusText = 'Liberada ou próxima de iniciar';
  }

  const windowStart = settings.windowStart || settings.startTime || settings.horarioInicio || null;
  const windowEnd = settings.windowEnd || settings.endTime || settings.horarioFim || null;
  const insideWindow = isInsideWindow(windowStart, windowEnd);

  const groups =
    settings.selectedGroups ||
    settings.groups ||
    settings.targetGroups ||
    [];

  const botStatus = await getBotStatus();

  return {
    ok: true,
    enabled: !!settings.enabled,
    botStatus: botStatus?.status || null,
    queueRunning: botStatus?.queueRunning ?? null,
    queueProcessing: botStatus?.queueProcessing ?? null,
    lastError: botStatus?.lastError ?? null,
    intervalMinutes,
    windowStart,
    windowEnd,
    insideWindow,
    groupsCount: Array.isArray(groups) ? groups.length : 0,
    lastSendAt: fmt(lastSend),
    nextRunAt: fmt(nextRun),
    nextRunTs: nextRun ? nextRun.getTime() : null,
    remainingMinutes,
    remainingSeconds,
    statusText,
    queue,
    updatedAt: fmt(now)
  };
}

function render(info) {
  const next = info.nextRunAt || 'Não calculada';
  const last = info.lastSendAt || 'Nenhum envio registrado';
  const intervalo = info.intervalMinutes ? `${info.intervalMinutes} minutos` : 'Não configurado';
  const janela = info.windowStart && info.windowEnd ? `${info.windowStart} até ${info.windowEnd}` : 'Não configurada';

  const bot = info.botStatus || 'não lido';
  let fila = 'não lida';

  if (info.queueProcessing === true) {
    fila = 'processando';
  } else if (info.queue && Number(info.queue.pending || 0) === 0) {
    fila = 'finalizada';
  } else if (info.queueRunning === true) {
    fila = 'ligada';
  } else if (info.queueRunning === false) {
    fila = 'pausada';
  }
  const processando = info.queueProcessing === true ? 'sim' : 'não';

  const janelaStatus =
    info.insideWindow === true ? 'Dentro do horário' :
    info.insideWindow === false ? 'Fora do horário' :
    'Horário não calculado';

  return `<!doctype html>
<html lang="pt-BR">
<head>\n\n  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Próxima rodada</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: #e5e7eb;
      padding: 18px;
    }
    .card {
      max-width: 720px;
      margin: 0 auto;
      background: #111827;
      border: 1px solid #334155;
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 12px 35px rgba(0,0,0,.35);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 25px;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 18px;
    }
    .big {
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 18px;
      margin: 14px 0;
    }
    .label {
      color: #94a3b8;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .value {
      font-size: 23px;
      font-weight: 700;
      line-height: 1.25;
    }
    .status {
      display: inline-block;
      margin-top: 10px;
      padding: 8px 12px;
      border-radius: 999px;
      background: #064e3b;
      color: #a7f3d0;
      font-weight: 700;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 14px;
    }
    .box {
      background: #1e293b;
      border-radius: 14px;
      padding: 12px;
    }
    .box span {
      color: #cbd5e1;
      font-size: 13px;
    }
    .box b {
      display: block;
      font-size: 18px;
      margin-top: 5px;
      word-break: break-word;
    }
    .footer {
      margin-top: 16px;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.5;
    }
    a {
      color: #38bdf8;
      text-decoration: none;
      font-weight: 700;
    }
    @media (max-width: 560px) {
      .grid { grid-template-columns: 1fr; }
      .value { font-size: 20px; }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>⏱️ Próxima rodada</h1>
    <div class="sub">Achou Levou Bot</div>

    <div class="big">
      <div class="label">Próximo envio previsto</div>
      <div class="value">${esc(next)}</div>
      <div class="status" id="timer-live-clock" data-target-ts="${info.nextRunTs || ''}">${info.remainingSeconds !== null ? '⏱️ ' + fmtDuration(info.remainingSeconds) : esc(info.statusText)}</div>
    </div>

    <div class="grid">
      <div class="box"><span>Último envio</span><b>${esc(last)}</b></div>
      <div class="box"><span>Intervalo</span><b>${esc(intervalo)}</b></div>
      <div class="box"><span>Janela</span><b>${esc(janela)}</b></div>
      <div class="box"><span>Status da janela</span><b>${esc(janelaStatus)}</b></div>
      <div class="box"><span>WhatsApp</span><b>${esc(bot)}</b></div>
      <div class="box"><span>Fila</span><b>${esc(fila)}</b></div>
      <div class="box"><span>Processando agora</span><b>${esc(processando)}</b></div>
      <div class="box"><span>Grupos</span><b>${esc(info.groupsCount)}</b></div>
      <div class="box"><span>Pendentes</span><b>${esc(info.queue.pending)}</b></div>
      <div class="box"><span>Enviadas</span><b>${esc(info.queue.sent)}</b></div>
      <div class="box"><span>Erros</span><b>${esc(info.queue.error)}</b></div>
      <div class="box"><span>Total na fila</span><b>${esc(info.queue.total)}</b></div>
    </div>

    <div class="footer">
      Atualizado em: ${esc(info.updatedAt)}<br>
      A página atualiza sozinha a cada 1 segundo.<br><br>
      <a href="/proxima-rodada">Atualizar agora</a> • <a href="/painel">Abrir painel</a>
    </div>
  </div>\n
\n

<script>
/* TIMER_CLOCK_TIMESTAMP_V1 */
(function () {
  function two(n) {
    return String(n).padStart(2, '0');
  }

  function format(ms) {
    if (ms <= 0) return '00:00:00';
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return two(h) + ':' + two(m) + ':' + two(s);
  }

  function startClock() {
    var el = document.getElementById('timer-live-clock');
    if (!el) return;

    var targetTs = Number(el.getAttribute('data-target-ts') || 0);
    if (!targetTs) return;

    el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    el.style.letterSpacing = '0.06em';
    el.style.minWidth = '170px';
    el.style.textAlign = 'center';

    function tick() {
      var diff = targetTs - Date.now();
      el.textContent = '⏱️ ' + format(diff);

      if (diff <= 0) {
        el.textContent = '⏱️ 00:00:00';
        setTimeout(function () {
          location.reload();
        }, 1200);
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startClock);
  } else {
    startClock();
  }
})();
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  // TIMER_NO_CACHE_V1
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/proxima-rodada') {
    const info = await getInfo();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(info, null, 2));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/proxima-rodada') {
    const info = await getInfo();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(render(info));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Página não encontrada');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Timer Achou Levou rodando em http://127.0.0.1:${PORT}/proxima-rodada`);
});
