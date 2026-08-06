(() => {
  'use strict';

  const VERSION = '4.0.0';
  const DESKTOP_WIDTH = 1440;
  const TOGGLE_GUARD_KEY = 'radar_autopilot_desktop_toggle_guard_v4';
  const TOGGLE_GUARD_MS = 120000;
  const AUTOPILOT_URL = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-shopee-autopilot-v1.js?v=4';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.shopeeDesktopBootstrapVersion === VERSION) return;
  root.shopeeDesktopBootstrapVersion = VERSION;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function status(message, kind = 'work') {
    let box = document.getElementById('radar-autopilot-desktop-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'radar-autopilot-desktop-status';
      document.documentElement.appendChild(box);
    }
    const palette = kind === 'error'
      ? 'background:#7f1d1dee;color:#fee2e2;border:1px solid #fb7185'
      : kind === 'done'
        ? 'background:#064e3bee;color:#d1fae5;border:1px solid #34d399'
        : kind === 'warn'
          ? 'background:#78350fee;color:#ffedd5;border:1px solid #fb923c'
          : 'background:#082f49ee;color:#e0f2fe;border:1px solid #38bdf8';
    box.style.cssText = `position:fixed;left:12px;right:12px;bottom:178px;z-index:2147483647;padding:12px 15px;border-radius:15px;font:800 13px/1.4 system-ui;text-align:center;box-shadow:0 12px 36px #0009;${palette}`;
    box.textContent = message;
  }

  function applyDesktopViewport() {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head?.appendChild(viewport);
    }
    viewport?.setAttribute(
      'content',
      `width=${DESKTOP_WIDTH},initial-scale=0.25,minimum-scale=0.10,maximum-scale=5,user-scalable=yes`
    );

    let style = document.getElementById('radar-autopilot-desktop-layout');
    if (!style && document.head) {
      style = document.createElement('style');
      style.id = 'radar-autopilot-desktop-layout';
      document.head.appendChild(style);
    }
    if (style) {
      style.textContent = `
        html,body{min-width:${DESKTOP_WIDTH}px!important;width:${DESKTOP_WIDTH}px!important;max-width:none!important;overflow-x:auto!important}
        body>div,#app,#root{min-width:${DESKTOP_WIDTH}px!important;max-width:none!important}
        .radar-autopilot-link-bridge{position:absolute!important;width:2px!important;height:2px!important;opacity:.001!important;overflow:hidden!important;pointer-events:auto!important;z-index:-1!important}
      `;
    }

    document.documentElement.style.minWidth = `${DESKTOP_WIDTH}px`;
    if (document.body) {
      document.body.style.minWidth = `${DESKTOP_WIDTH}px`;
      document.body.style.width = `${DESKTOP_WIDTH}px`;
    }
    document.documentElement.dataset.radarDesktopMode = 'true';
  }

  function readToggleGuard() {
    try {
      const value = Number(localStorage.getItem(TOGGLE_GUARD_KEY) || 0);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  function writeToggleGuard() {
    try {
      const now = Date.now();
      localStorage.setItem(TOGGLE_GUARD_KEY, String(now));
      sessionStorage.setItem(TOGGLE_GUARD_KEY, String(now));
    } catch {}
  }

  function requestNativeDesktopOnce() {
    const native = window.RadarNative;
    if (!native || typeof native.isDesktopMode !== 'function' || typeof native.toggleDesktopMode !== 'function') {
      return { supported: false, active: false, toggled: false, guarded: false };
    }

    try {
      if (Boolean(native.isDesktopMode())) {
        return { supported: true, active: true, toggled: false, guarded: false };
      }

      const lastToggle = readToggleGuard();
      if (lastToggle && Date.now() - lastToggle < TOGGLE_GUARD_MS) {
        return { supported: true, active: false, toggled: false, guarded: true };
      }

      writeToggleGuard();
      status('🖥️ Ativando o modo PC uma única vez...');
      const enabled = Boolean(native.toggleDesktopMode());
      return { supported: true, active: enabled, toggled: true, guarded: false };
    } catch {
      return { supported: true, active: false, toggled: false, guarded: false };
    }
  }

  function findCard(node) {
    let current = node;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const text = clean(current.innerText || current.textContent);
      if (
        text.length >= 25 &&
        text.length <= 2400 &&
        /R\$|comiss(?:ã|a)o|vendid|vendas?/i.test(text) &&
        (current.querySelector?.('img') || current.querySelector?.('a[href]'))
      ) return current;
    }
    return node.closest?.('[class*="product"],[class*="Product"],[class*="card"],[class*="Card"],li,article') || null;
  }

  function bridgeButton(card, target, anchor) {
    if (!card || card.querySelector(':scope > .radar-autopilot-link-bridge')) return false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'radar-autopilot-link-bridge';
    button.dataset.radarAutopilotBridge = '1';
    button.textContent = 'Obter link';
    button.setAttribute('aria-label', 'Obter link');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (target && target !== button) {
        try { target.click(); return; } catch {}
      }
      const href = anchor?.href || anchor?.getAttribute?.('href') || '';
      if (href) location.assign(href);
    });
    card.appendChild(button);
    return true;
  }

  function installProductCompatibility() {
    let added = 0;
    const labelCandidates = [...document.querySelectorAll('button,a,[role="button"],input,span,div')]
      .filter(element => {
        const label = clean(
          element.innerText || element.textContent || element.value ||
          element.getAttribute('aria-label') || element.getAttribute('title')
        );
        return label.length <= 80 && /obter\s*link/i.test(label);
      });

    for (const label of labelCandidates) {
      const semantic = label.closest('button,a,[role="button"]') || label;
      if (semantic.matches?.('button,a,[role="button"]')) continue;
      const card = findCard(label);
      const anchor = card?.querySelector('a[href]');
      if (bridgeButton(card, semantic, anchor)) added += 1;
    }

    const currentButtons = [...document.querySelectorAll('button,a,[role="button"]')]
      .filter(element => /obter\s*link/i.test(clean(
        element.innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('title')
      )));

    if (!currentButtons.length) {
      const candidates = [...document.querySelectorAll('a[href],[class*="product"],[class*="Product"],[class*="offer"],[class*="Offer"]')];
      const seen = new Set();
      for (const node of candidates) {
        const anchor = node.closest?.('a[href]') || node.querySelector?.('a[href]');
        const href = anchor?.href || '';
        const card = findCard(node);
        const text = clean(card?.innerText || card?.textContent);
        if (!card || !href || text.length < 25 || seen.has(card)) continue;
        if (!/R\$|comiss(?:ã|a)o|vendid|vendas?/i.test(text)) continue;
        seen.add(card);
        if (bridgeButton(card, null, anchor)) added += 1;
        if (seen.size >= 120) break;
      }
    }

    return {
      added,
      buttons: [...document.querySelectorAll('button,a,[role="button"]')]
        .filter(element => /obter\s*link/i.test(clean(
          element.innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('title')
        ))).length,
      productNodes: document.querySelectorAll('a[href],[class*="product"],[class*="Product"]').length
    };
  }

  function loadAutopilot() {
    if (root.shopeeAutopilotVersion || document.getElementById('radar-shopee-autopilot-v1-loader')) return;
    const script = document.createElement('script');
    script.id = 'radar-shopee-autopilot-v1-loader';
    script.src = AUTOPILOT_URL;
    script.async = false;
    script.onload = () => {
      status('✅ Produtos preparados. Iniciando o garimpo automático...', 'done');
      setTimeout(() => document.getElementById('radar-autopilot-desktop-status')?.remove(), 2200);
    };
    script.onerror = () => status('❌ Não foi possível carregar o módulo de garimpo automático.', 'error');
    (document.head || document.documentElement).appendChild(script);
  }

  async function initialize() {
    status('🖥️ Preparando o modo PC sem recarregamento repetido...');
    applyDesktopViewport();
    const nativeState = requestNativeDesktopOnce();

    if (nativeState.toggled) {
      return;
    }

    if (nativeState.guarded) {
      status('🛑 Segundo recarregamento bloqueado. Continuando a leitura dos produtos...', 'warn');
      await sleep(1200);
    }

    let diagnostics = { added: 0, buttons: 0, productNodes: 0 };
    for (let attempt = 0; attempt < 30; attempt += 1) {
      applyDesktopViewport();
      diagnostics = installProductCompatibility();
      if (diagnostics.buttons > 0) break;
      status(`🔎 Aguardando os cards da Shopee... tentativa ${attempt + 1}/30`);
      await sleep(400);
    }

    if (!diagnostics.buttons) {
      status(`❌ Nenhum card clicável reconhecido. Nós de produto detectados: ${diagnostics.productNodes}.`, 'error');
      return;
    }

    status(`✅ ${diagnostics.buttons} produtos reconhecidos. Iniciando o piloto...`, 'done');
    loadAutopilot();
  }

  let compatibilityTimer = 0;
  new MutationObserver(() => {
    clearTimeout(compatibilityTimer);
    compatibilityTimer = setTimeout(() => {
      applyDesktopViewport();
      installProductCompatibility();
    }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });

  root.shopeeDesktopBootstrap = {
    version: VERSION,
    desktopWidth: DESKTOP_WIDTH,
    reloadLoopGuard: true,
    automatic: true,
    productCompatibility: true,
    start: initialize,
    loadedAt: Date.now()
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
