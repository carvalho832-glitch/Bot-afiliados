const TIME_ZONE = 'America/Sao_Paulo';

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function shouldKeepAlive(env, date = new Date()) {
  const parts = localParts(date);
  const isSunday = parts.weekday === 'Sun';
  const allowSunday = String(env.RUN_SUNDAY || '').toLowerCase() === 'true';
  if (isSunday && !allowSunday) return false;

  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const start = 7 * 60;
  // Último ping às 22:20. Sem novo tráfego, o Render Free pode dormir após 15 min.
  const lastPing = 22 * 60 + 20;
  return minutes >= start && minutes <= lastPing;
}

function cleanBase(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

async function ping(name, baseUrl) {
  const base = cleanBase(baseUrl);
  if (!base) return { name, skipped: true, reason: 'URL não configurada' };

  const started = Date.now();
  try {
    const response = await fetch(`${base}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Achou-Levou-Render-Keeper/1.0',
        'X-Achou-Levou-Keepalive': '1'
      }
    });
    return {
      name,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started
    };
  } catch (error) {
    return {
      name,
      ok: false,
      error: String(error?.message || error),
      ms: Date.now() - started
    };
  }
}

async function run(env) {
  if (!shouldKeepAlive(env)) {
    return { ok: true, sleepingWindow: true, at: new Date().toISOString() };
  }

  const results = await Promise.all([
    ping('julio', env.JULIO_RENDER_URL),
    ping('renata', env.RENATA_RENDER_URL)
  ]);

  return {
    ok: results.every(result => result.skipped || result.ok),
    sleepingWindow: false,
    results,
    at: new Date().toISOString()
  };
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(run(env).then(result => console.log(JSON.stringify(result))));
  },

  async fetch(_request, env) {
    const result = await run(env);
    return Response.json(result, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }
};
