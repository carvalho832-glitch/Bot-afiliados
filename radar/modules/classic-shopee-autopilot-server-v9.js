(() => {
  'use strict';

  const VERSION = '9.1.0';
  const API = 'https://bot-afiliados-1fwi.onrender.com';
  const RUNS = `${API}/phase24/autopilot/runs`;
  const CORE_URL = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-shopee-autopilot-clean-v7.js?v=4';
  const ACHOU = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/achou-levou-direct-v11.html?v=1&safe=1';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.shopeeServerAutopilotVersion === VERSION) return;
  root.shopeeServerAutopilotVersion = VERSION;

  const state = {
    busy: false,
    timer: 0,
    enrichTimer: 0,
    cooldowns: new Map(),
    navigating: false
  };

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

  function labelOf(element) {
    return clean(
      element?.innerText || element?.textContent || element?.value ||
      element?.getAttribute?.('aria-label') || element?.getAttribute?.('title')
    );
  }

  function linkButtons() {
    return [...document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]')]
      .filter(element => /obter\s*link/i.test(labelOf(element)) && !/massa/i.test(labelOf(element)));
  }

  function cardFor(button) {
    let node = button;
    for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      const text = clean(node.innerText || node.textContent);
      if (text.length >= 20 && text.length <= 2200 && /R\$|comiss(?:ã|a)o|vendid|vendas?/i.test(text) && node.querySelector?.('img')) {
        const linkCount = [...node.querySelectorAll('button,[role="button"],a,input')]
          .filter(element => /obter\s*link/i.test(labelOf(element)) && !/massa/i.test(labelOf(element))).length;
        if (linkCount <= 2) return node;
      }
    }
    return button.parentElement;
  }

  function parseIds(value = '') {
    const text = String(value || '').replace(/&amp;/gi, '&').replace(/\\u002F/gi, '/');
    const directPatterns = [
      /\/product\/(\d{4,})\/(\d{4,})/i,
      /-i\.(\d{4,})\.(\d{4,})/i,
      /[?&]shop_?id=(\d{4,}).*?[?&]item_?id=(\d{4,})/i,
      /[?&]shopId=(\d{4,}).*?[?&]itemId=(\d{4,})/i,
      /["']shop_?id["']\s*:\s*["']?(\d{4,})["']?.{0,500}?["']item_?id["']\s*:\s*["']?(\d{4,})/i,
      /["']shopId["']\s*:\s*["']?(\d{4,})["']?.{0,500}?["']itemId["']\s*:\s*["']?(\d{4,})/i
    ];
    for (const pattern of directPatterns) {
      const match = text.match(pattern);
      if (match) return { shopId: match[1], itemId: match[2] };
    }

    const reversePatterns = [
      /[?&]item_?id=(\d{4,}).*?[?&]shop_?id=(\d{4,})/i,
      /[?&]itemId=(\d{4,}).*?[?&]shopId=(\d{4,})/i,
      /["']item_?id["']\s*:\s*["']?(\d{4,})["']?.{0,500}?["']shop_?id["']\s*:\s*["']?(\d{4,})/i,
      /["']itemId["']\s*:\s*["']?(\d{4,})["']?.{0,500}?["']shopId["']\s*:\s*["']?(\d{4,})/i
    ];
    for (const pattern of reversePatterns) {
      const match = text.match(pattern);
      if (match) return { shopId: match[2], itemId: match[1] };
    }
    return null;
  }

  function idsFromObject(start) {
    if (!start || (typeof start !== 'object' && typeof start !== 'function')) return null;
    const queue = [{ value: start, depth: 0 }];
    const visited = new WeakSet();
    let scanned = 0;

    while (queue.length && scanned < 500) {
      const { value, depth } = queue.shift();
      if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
      if (visited.has(value)) continue;
      visited.add(value);
      scanned += 1;

      let entries = [];
      try { entries = Object.entries(value); } catch { continue; }
      let shopId = '';
      let itemId = '';
      for (const [key, raw] of entries) {
        const normalized = norm(key).replace(/[^a-z0-9]/g, '');
        const scalar = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
        if (/^shopid$/.test(normalized) && /^\d{4,}$/.test(scalar)) shopId = scalar;
        if (/^itemid$/.test(normalized) && /^\d{4,}$/.test(scalar)) itemId = scalar;
        if (scalar) {
          const parsed = parseIds(scalar);
          if (parsed) return parsed;
        }
      }
      if (shopId && itemId) return { shopId, itemId };

      if (depth >= 5) continue;
      for (const [, raw] of entries) {
        if (raw && (typeof raw === 'object' || typeof raw === 'function')) {
          queue.push({ value: raw, depth: depth + 1 });
        }
      }
    }
    return null;
  }

  function reactIds(element) {
    if (!element) return null;
    let keys = [];
    try { keys = Object.keys(element); } catch {}
    for (const key of keys) {
      if (!/^__(?:react|vue|svelte|ng)/i.test(key)) continue;
      const found = idsFromObject(element[key]);
      if (found) return found;
    }
    return null;
  }

  function idsFromCard(card, button) {
    const links = [...card.querySelectorAll('a[href]')];
    for (const link of links) {
      const found = parseIds(link.href);
      if (found) return found;
    }

    const elements = [card, button, ...card.querySelectorAll('*')].slice(0, 350);
    let attributes = '';
    for (const element of elements) {
      try {
        for (const name of element.getAttributeNames?.() || []) {
          attributes += ` ${name}=${element.getAttribute(name)}`;
        }
      } catch {}
    }

    return parseIds(`${attributes} ${card.outerHTML || ''}`) || reactIds(button) || reactIds(card);
  }

  function enrichProductAnchors() {
    let enriched = 0;
    let recognized = 0;
    for (const button of linkButtons()) {
      const card = cardFor(button);
      if (!card) continue;
      const existing = [...card.querySelectorAll('a[href]')]
        .map(anchor => ({ anchor, ids: parseIds(anchor.href) }))
        .find(entry => entry.ids);
      const ids = existing?.ids || idsFromCard(card, button);
      if (!ids) continue;
      recognized += 1;

      if (!card.querySelector(':scope > .radar-product-url-v9')) {
        const anchor = document.createElement('a');
        anchor.className = 'radar-product-url-v9';
        anchor.href = `https://shopee.com.br/product/${ids.shopId}/${ids.itemId}`;
        anchor.textContent = 'produto';
        anchor.setAttribute('aria-hidden', 'true');
        anchor.style.cssText = 'position:absolute;width:1px;height:1px;opacity:.001;pointer-events:none;overflow:hidden';
        card.appendChild(anchor);
        enriched += 1;
      }
    }
    return { recognized, enriched };
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
        status('⚠️ O card não entregou o endereço real do produto. A página foi mantida para diagnóstico.', 'warn');
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

  async function initialize() {
    status('🧩 Preparando os endereços reais dos produtos para gerar links no servidor...');
    let diagnostics = { recognized: 0, enriched: 0 };
    for (let attempt = 0; attempt < 16; attempt += 1) {
      diagnostics = enrichProductAnchors();
      if (diagnostics.recognized > 0) break;
      await sleep(250);
    }

    status(diagnostics.recognized
      ? `✅ ${diagnostics.recognized} endereços de produto preparados. Iniciando o garimpo...`
      : '🔎 Aguardando os cards. O leitor continuará procurando os endereços reais.',
      diagnostics.recognized ? 'done' : 'work');

    loadCore();
    clearInterval(state.enrichTimer);
    state.enrichTimer = setInterval(enrichProductAnchors, 1200);
    clearInterval(state.timer);
    state.timer = setInterval(monitor, 700);
    setTimeout(monitor, 900);
  }

  root.shopeeServerAutopilot = {
    version: VERSION,
    officialServerLink: true,
    recoversProductIds: true,
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
