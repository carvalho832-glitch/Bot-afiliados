(() => {
  'use strict';

  const VERSION = '6.0.0';
  const AUTOPILOT_URL = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-shopee-autopilot-v1.js?v=5';
  const RELOAD_KEY = 'radar_shopee_blank_reload_v6';
  const RELOAD_GUARD_MS = 120000;
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.shopeeStableBootstrapVersion === VERSION) return;
  root.shopeeStableBootstrapVersion = VERSION;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function status(message, kind = 'work') {
    let box = document.getElementById('radar-autopilot-stable-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'radar-autopilot-stable-status';
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

  function desktopActive() {
    try {
      return typeof window.RadarNative?.isDesktopMode === 'function'
        ? Boolean(window.RadarNative.isDesktopMode())
        : null;
    } catch {
      return null;
    }
  }

  function linkButtons() {
    return [...document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')]
      .filter(element => {
        const label = clean(
          element.innerText || element.textContent || element.value ||
          element.getAttribute('aria-label') || element.getAttribute('title')
        );
        return /obter\s*link/i.test(label);
      });
  }

  function findCard(node) {
    let current = node;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const text = clean(current.innerText || current.textContent);
      if (
        text.length >= 20 && text.length <= 2600 &&
        /R\$|comiss(?:ã|a)o|vendid|vendas?/i.test(text) &&
        (current.querySelector?.('img') || current.querySelector?.('a[href]'))
      ) return current;
    }
    return null;
  }

  function productCards() {
    const cards = new Set();
    const nodes = [...document.querySelectorAll(
      'a[href*="product"],a[href*="item"],a[href*="offer"],[class*="product"],[class*="Product"],[class*="offer"],[class*="Offer"],[class*="card"],[class*="Card"]'
    )];
    for (const node of nodes) {
      const card = findCard(node);
      if (card) cards.add(card);
      if (cards.size >= 150) break;
    }
    return [...cards];
  }

  function installBridge(card) {
    if (!card || card.querySelector(':scope > .radar-autopilot-link-bridge-v6')) return false;
    const anchor = [...card.querySelectorAll('a[href]')]
      .find(link => /product|item|offer/i.test(link.href)) || card.querySelector('a[href]');
    if (!anchor?.href) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'radar-autopilot-link-bridge-v6';
    button.textContent = 'Obter link';
    button.setAttribute('aria-label', 'Obter link');
    button.style.cssText = 'position:absolute;width:2px;height:2px;opacity:.001;overflow:hidden;pointer-events:auto;z-index:-1';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      try { anchor.click(); } catch { location.assign(anchor.href); }
    });
    card.appendChild(button);
    return true;
  }

  function prepareCards() {
    let buttons = linkButtons();
    const cards = productCards();
    if (!buttons.length && cards.length) {
      cards.forEach(installBridge);
      buttons = linkButtons();
    }
    return { buttons: buttons.length, cards: cards.length };
  }

  function loadAutopilot() {
    if (root.shopeeAutopilotVersion || document.getElementById('radar-shopee-autopilot-v1-loader')) return;
    const script = document.createElement('script');
    script.id = 'radar-shopee-autopilot-v1-loader';
    script.src = AUTOPILOT_URL;
    script.async = false;
    script.onload = () => {
      status('✅ Produtos carregados. Iniciando o garimpo automático...', 'done');
      setTimeout(() => document.getElementById('radar-autopilot-stable-status')?.remove(), 2200);
    };
    script.onerror = () => status('❌ Não foi possível carregar o piloto automático.', 'error');
    (document.head || document.documentElement).appendChild(script);
  }

  function reloadedRecently() {
    try {
      const timestamp = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      return Boolean(timestamp && Date.now() - timestamp < RELOAD_GUARD_MS);
    } catch {
      return false;
    }
  }

  function markReload() {
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch {}
  }

  async function initialize() {
    const pc = desktopActive();
    status(pc === false
      ? '⚠️ A Shopee abriu sem o modo PC. Continuando sem alternar a tela novamente...'
      : '🔎 Aguardando a grade de produtos da Shopee...', pc === false ? 'warn' : 'work');

    let diagnostics = { buttons: 0, cards: 0 };
    for (let attempt = 0; attempt < 44; attempt += 1) {
      diagnostics = prepareCards();
      if (diagnostics.buttons > 0) {
        status(`✅ ${diagnostics.buttons} produtos reconhecidos. Preparando o piloto...`, 'done');
        loadAutopilot();
        return;
      }
      if (attempt === 16) {
        status(`🔎 A Shopee ainda está carregando a grade... cards encontrados: ${diagnostics.cards}.`);
      }
      await sleep(500);
    }

    if (!reloadedRecently()) {
      markReload();
      status('🔄 A Shopee abriu sem a grade. Recarregando a página uma única vez...', 'warn');
      await sleep(700);
      location.reload();
      return;
    }

    status(`❌ A Shopee abriu, mas não carregou os produtos. Cards detectados: ${diagnostics.cards}. O Radar não fará novos recarregamentos.`, 'error');
  }

  root.shopeeStableBootstrap = {
    version: VERSION,
    togglesDesktop: false,
    reloadOnce: true,
    productCompatibility: true,
    automatic: true,
    start: initialize,
    loadedAt: Date.now()
  };

  if (document.readyState === 'loading') {
    window.addEventListener('load', initialize, { once: true });
  } else {
    initialize();
  }
})();
