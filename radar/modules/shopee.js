(() => {
  'use strict';

  const VERSION = '1.2.0';
  const DESKTOP_WIDTH = 1440;
  const DESKTOP_SCALE = 0.25;
  const VIEWPORT_ID = 'radar-desktop-viewport';
  const STYLE_ID = 'radar-desktop-layout';
  const SCROLL_KEY = 'radar_desktop_scroll';

  if (window.__radarShopeeModuleVersion === VERSION) return;
  window.__radarShopeeModuleVersion = VERSION;

  document.getElementById('radar-remote-tools')?.remove();

  const native = window.RadarNative;
  const send = (payload) => {
    try { native?.emit(JSON.stringify(payload)); } catch (_) {}
  };
  const text = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();

  function shellVersion() {
    try { return Number(native?.getShellVersion?.() || 0); } catch (_) { return 0; }
  }

  function desktopSupported() {
    return !!native && shellVersion() >= 1801;
  }

  function isDesktopMode() {
    if (!desktopSupported()) return false;
    try { return !!native.isDesktopMode(); } catch (_) { return false; }
  }

  function viewportMeta() {
    let meta = document.querySelector(`meta#${VIEWPORT_ID}`);
    if (!meta) {
      meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.dataset.radarOriginalContent = meta.getAttribute('content') || '';
      else {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head?.appendChild(meta);
      }
      meta.id = VIEWPORT_ID;
    }
    return meta;
  }

  function applyDesktopLayout() {
    if (!document.head || !document.documentElement) return;

    const meta = viewportMeta();
    meta.setAttribute(
      'content',
      `width=${DESKTOP_WIDTH},initial-scale=${DESKTOP_SCALE},minimum-scale=0.20,maximum-scale=2.5,user-scalable=yes`
    );

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      html, body {
        min-width: ${DESKTOP_WIDTH}px !important;
        width: ${DESKTOP_WIDTH}px !important;
        max-width: none !important;
        overflow-x: auto !important;
      }
      body > div, #app, #root {
        min-width: ${DESKTOP_WIDTH}px !important;
        max-width: none !important;
      }
      #radar-remote-tools {
        position: fixed !important;
        left: 12px !important;
        right: auto !important;
        width: auto !important;
        min-width: 560px !important;
        transform-origin: left bottom !important;
      }
    `;

    document.documentElement.dataset.radarDesktop = '1';
    document.documentElement.style.minWidth = `${DESKTOP_WIDTH}px`;
    if (document.body) {
      document.body.style.minWidth = `${DESKTOP_WIDTH}px`;
      document.body.style.width = `${DESKTOP_WIDTH}px`;
    }
  }

  function removeDesktopLayout() {
    const meta = document.querySelector(`meta#${VIEWPORT_ID}`);
    if (meta) {
      const original = meta.dataset.radarOriginalContent;
      meta.setAttribute(
        'content',
        original || 'width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes'
      );
      meta.removeAttribute('id');
    }
    document.getElementById(STYLE_ID)?.remove();
    delete document.documentElement.dataset.radarDesktop;
    document.documentElement.style.removeProperty('min-width');
    if (document.body) {
      document.body.style.removeProperty('min-width');
      document.body.style.removeProperty('width');
    }
  }

  function applyCurrentLayout() {
    if (isDesktopMode()) applyDesktopLayout();
    else removeDesktopLayout();
  }

  function saveScroll() {
    try {
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ x: window.scrollX || 0, y: window.scrollY || 0, at: Date.now() })
      );
    } catch (_) {}
  }

  function restoreScroll() {
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY);
      if (!raw) return;
      sessionStorage.removeItem(SCROLL_KEY);
      const saved = JSON.parse(raw);
      if (Date.now() - Number(saved.at || 0) > 120000) return;
      let attempts = 0;
      const restore = () => {
        window.scrollTo(Number(saved.x || 0), Number(saved.y || 0));
        if (++attempts < 8) setTimeout(restore, 250);
      };
      setTimeout(restore, 350);
    } catch (_) {}
  }

  function desktopButtonLabel() {
    if (!desktopSupported()) return '💻 PC';
    return isDesktopMode() ? '📱 Celular' : '💻 PC';
  }

  function findProducts() {
    const candidates = [...document.querySelectorAll('a[href], [class*=product], [class*=Product]')];
    const seen = new Set();
    const items = [];
    for (const node of candidates) {
      const anchor = node.closest('a[href]') || node.querySelector?.('a[href]');
      const href = anchor?.href || '';
      const title = text(node).slice(0, 220);
      if (!href || title.length < 8 || seen.has(href)) continue;
      if (!/shopee|product|offer/i.test(href + ' ' + node.className)) continue;
      seen.add(href);
      items.push({ title, url: href, status: 'Lido pela versão remota' });
      if (items.length >= 40) break;
    }
    send({
      type: 'queue.replace',
      items,
      message: `${items.length} produtos encontrados pela ferramenta remota.`
    });
    return items.length;
  }

  function mountToolbar() {
    const bar = document.createElement('div');
    bar.id = 'radar-remote-tools';
    bar.style.cssText = [
      'position:fixed',
      'left:8px',
      'right:8px',
      'bottom:max(12px,env(safe-area-inset-bottom))',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'padding:8px',
      'border:1px solid #2bd4ff66',
      'border-radius:16px',
      'background:#07111ff2',
      'box-shadow:0 12px 40px #0008',
      'font-family:system-ui',
      'box-sizing:border-box'
    ].join(';');

    bar.innerHTML = `
      <button data-radar="read">Ler produtos</button>
      <button data-radar="desktop">${desktopButtonLabel()}</button>
      <button data-radar="panel">Painel</button>
      <span style="margin-left:auto;color:#74dfff;font-size:10px;white-space:nowrap">v${VERSION}</span>
    `;

    [...bar.querySelectorAll('button')].forEach((button) => {
      button.style.cssText =
        'border:0;border-radius:11px;padding:10px 11px;background:#153653;color:white;font-weight:700;white-space:nowrap';
    });

    const desktopButton = bar.querySelector('[data-radar="desktop"]');
    if (!desktopSupported() && desktopButton) {
      desktopButton.disabled = true;
      desktopButton.style.opacity = '0.45';
      desktopButton.title = 'A ponte instalada ainda não oferece o modo PC';
    }

    bar.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-radar]');
      const action = button?.dataset?.radar;

      if (action === 'read') findProducts();
      if (action === 'panel') native?.openPanel();

      if (action === 'desktop' && desktopSupported()) {
        saveScroll();
        try {
          const enabled = !!native.toggleDesktopMode();
          button.textContent = enabled ? '📱 Celular' : '💻 PC';
          send({
            type: 'display.mode',
            desktop: enabled,
            message: enabled
              ? 'Visualização PC real ativada: 1440 px em visão geral.'
              : 'Visualização celular ativada.'
          });
        } catch (_) {
          send({ type: 'display.error', message: 'Não foi possível alternar a visualização agora.' });
        }
      }
    });

    document.documentElement.appendChild(bar);
  }

  applyCurrentLayout();
  mountToolbar();
  restoreScroll();

  let layoutTimer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      if (isDesktopMode()) applyDesktopLayout();
      if (!document.getElementById('radar-remote-tools')) mountToolbar();
    }, 180);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('pageshow', () => {
    applyCurrentLayout();
    restoreScroll();
  });

  send({
    type: 'module.ready',
    module: 'shopee',
    version: VERSION,
    message: isDesktopMode()
      ? 'Modo PC real aplicado: 1440 px e visão geral de 25%.'
      : 'Ferramentas remotas da Shopee carregadas.'
  });
})();