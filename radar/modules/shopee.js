(() => {
  'use strict';
  const VERSION = '1.1.0';
  if (window.__radarShopeeModuleVersion === VERSION) return;
  window.__radarShopeeModuleVersion = VERSION;

  const previousBar = document.getElementById('radar-remote-tools');
  if (previousBar) previousBar.remove();

  const native = window.RadarNative;
  const send = (payload) => { try { native?.emit(JSON.stringify(payload)); } catch (_) {} };
  const text = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  const desktopSupported = typeof native?.toggleDesktopMode === 'function' && typeof native?.isDesktopMode === 'function';

  function desktopButtonLabel() {
    if (!desktopSupported) return '💻 PC';
    try { return native.isDesktopMode() ? '📱 Celular' : '💻 PC'; } catch (_) { return '💻 PC'; }
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
    send({ type: 'queue.replace', items, message: `${items.length} produtos encontrados pela ferramenta remota.` });
    return items.length;
  }

  function mount() {
    const bar = document.createElement('div');
    bar.id = 'radar-remote-tools';
    bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;display:flex;align-items:center;gap:6px;padding:8px;border:1px solid #2bd4ff66;border-radius:16px;background:#07111ff2;box-shadow:0 12px 40px #0008;font-family:system-ui;box-sizing:border-box';
    bar.innerHTML = '<button data-radar="read">Ler produtos</button><button data-radar="desktop">'+desktopButtonLabel()+'</button><button data-radar="panel">Painel</button><span style="margin-left:auto;color:#74dfff;font-size:10px;white-space:nowrap">v'+VERSION+'</span>';

    [...bar.querySelectorAll('button')].forEach(btn => {
      btn.style.cssText = 'border:0;border-radius:11px;padding:10px 11px;background:#153653;color:white;font-weight:700;white-space:nowrap';
    });

    const desktopButton = bar.querySelector('[data-radar="desktop"]');
    if (!desktopSupported && desktopButton) {
      desktopButton.disabled = true;
      desktopButton.style.opacity = '0.45';
      desktopButton.title = 'Atualize o APK-casca para ativar o modo PC';
    }

    bar.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-radar]');
      const action = button?.dataset?.radar;
      if (action === 'read') findProducts();
      if (action === 'panel') native?.openPanel();
      if (action === 'desktop' && desktopSupported) {
        try {
          const enabled = native.toggleDesktopMode();
          button.textContent = enabled ? '📱 Celular' : '💻 PC';
          send({ type: 'display.mode', desktop: enabled, message: enabled ? 'Visualização PC ativada.' : 'Visualização celular ativada.' });
        } catch (_) {
          send({ type: 'display.error', message: 'Não foi possível alternar a visualização agora.' });
        }
      }
    });
    document.documentElement.appendChild(bar);
  }

  mount();
  send({ type: 'module.ready', module: 'shopee', version: VERSION, message: 'Ferramentas remotas da Shopee carregadas.' });
})();
