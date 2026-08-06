(() => {
  'use strict';

  const VERSION = '9.0.0';
  const API = 'https://bot-afiliados-1fwi.onrender.com';
  const RUNS = `${API}/phase24/autopilot/runs`;
  const CORE_URL = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-shopee-autopilot-clean-v7.js?v=3';
  const ACHOU = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/achou-levou-direct-v11.html?v=1&safe=1';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.shopeeServerAutopilotVersion === VERSION) return;
  root.shopeeServerAutopilotVersion = VERSION;

  const state = {
    busy: false,
    timer: 0,
    cooldowns: new Map(),
    navigating: false
  };

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function status(message, kind = 'work') {
    let box = document.getElementById('radar-autopilot-server-v9-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'radar-autopilot-server-v9-status';
      document.documentElement.appendChild(box);
    }
    const palette = kind === 'error'
      ? 'background:#7f1d1dee;color:#fee2e2;border:1px solid #fb7185'
      : kind === 'done'
        ? 'background:#064e3bee;color:#d1fae5;border:1px solid #34d399'
        : kind === 'warn'
          ? 'background:#78350fee;color:#ffedd5;border:1px solid #fb923c'
          : 'background:#312e81ee;color:#eef2ff;border:1px solid #818cf8';
    box.style.cssText = `position:fixed;left:12px;right:12px;bottom:178px;z-index:2147483647;padding:12px 15px;border-radius:15px;font:800 13px/1.4 system-ui;text-align:center;box-shadow:0 12px 36px #0009;${palette}`;
    box.textContent = message;
  }

  async function request(url, options = {}, timeout = 35000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      if (!response.ok || !body?.ok) {
        throw new Error(body?.detalhe || body?.error || `HTTP ${response.status}`);
      }
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A geração oficial demorou além do limite.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function openAchou() {
    if (state.navigating) return;
    state.navigating = true;
    try {
      if (typeof window.RadarNative?.openUrl === 'function') window.RadarNative.openUrl(ACHOU);
      else location.assign(ACHOU);
    } catch {
      try { location.assign(ACHOU); } catch {}
    }
  }

  function pendingItem(run) {
    const items = Array.isArray(run?.items) ? run.items : [];
    return items.find(item => item.id === run.currentItemId && item.decision === 'approved') ||
      items.find(item => item.decision === 'approved' && item.stage === 'link-generating') ||
      items.find(item => item.decision === 'approved' && !item.affiliateUrl && !/^failed-/.test(item.stage));
  }

  async function generateOnServer(run, item) {
    const attempt = Number(item.attempts?.link || 0);
    const key = `${run.id}:${item.id}:${attempt}`;
    const blockedUntil = Number(state.cooldowns.get(key) || 0);
    if (Date.now() < blockedUntil) return;
    state.cooldowns.set(key, Date.now() + 30000);

    status(`☁️ Solicitando à Shopee o link oficial: ${clean(item.title).slice(0, 72)}...`);

    const generated = await request(
      `${RUNS}/${encodeURIComponent(run.id)}/items/${encodeURIComponent(item.id)}/affiliate-link`,
      { method: 'POST', body: JSON.stringify({ source: 'radar-shopee-v9' }) },
      35000
    );

    const shortLink = clean(generated.shortLink);
    if (!/^https:\/\/s\.shopee\.com\.br\//i.test(shortLink)) {
      throw new Error('O servidor respondeu sem o link curto oficial da Shopee.');
    }

    await request(`${RUNS}/${encodeURIComponent(run.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'running',
        stage: 'achou-levou',
        currentItemId: item.id,
        lastError: '',
        event: {
          type: 'navigation',
          itemId: item.id,
          message: 'Link oficial pronto. Abrindo o Achou Levou para gerar e salvar a oferta.'
        }
      })
    });

    status('✅ Link oficial gerado pelo servidor. Abrindo o Achou Levou...', 'done');
    await sleep(500);
    openAchou();
  }

  async function monitor() {
    if (state.busy || state.navigating || document.hidden) return;
    state.busy = true;
    try {
      const current = await request(`${RUNS}?active=1&t=${Date.now()}`, {}, 20000);
      const run = current.run;
      if (!run || ['completed', 'cancelled', 'failed', 'paused'].includes(run.status)) return;
      if (run.stage === 'achou-levou') {
        status('✅ Link pronto. Retomando o Achou Levou...', 'done');
        openAchou();
        return;
      }
      if (run.stage !== 'link') return;

      const item = pendingItem(run);
      if (!item || item.affiliateUrl) return;
      if (!['link-generating', 'candidate', 'captured'].includes(clean(item.stage))) return;

      await generateOnServer(run, item);
    } catch (error) {
      const message = clean(error.message || error);
      if (/endereço real do produto/i.test(message)) {
        status('⚠️ O card não entregou o endereço real do produto. Vou manter a página para diagnóstico.', 'warn');
      } else {
        status(`⚠️ Link oficial ainda não gerado: ${message}`, 'warn');
      }
      console.error('[RADAR-SHOPEE-SERVER-V9]', error);
    } finally {
      state.busy = false;
    }
  }

  function loadCore() {
    if (document.getElementById('radar-shopee-clean-v7-core')) return;
    const script = document.createElement('script');
    script.id = 'radar-shopee-clean-v7-core';
    script.src = CORE_URL;
    script.async = false;
    script.onerror = () => status('❌ Não foi possível carregar o leitor de produtos da Shopee.', 'error');
    (document.head || document.documentElement).appendChild(script);
  }

  function initialize() {
    status('🔎 Leitor limpo ativo. Os links serão gerados pelo servidor da Shopee.');
    loadCore();
    clearInterval(state.timer);
    state.timer = setInterval(monitor, 700);
    setTimeout(monitor, 900);
  }

  root.shopeeServerAutopilot = {
    version: VERSION,
    officialServerLink: true,
    clicksShopeeLinkButton: false,
    reloadsPage: false,
    sendsWhatsapp: false,
    endpoint: RUNS,
    start: monitor,
    loadedAt: Date.now()
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
