(() => {
  'use strict';

  const VERSION = '2.0.0';
  const DESKTOP_WIDTH = 1440;
  const AUTOPILOT_V1 = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-shopee-autopilot-v1.js?v=2';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.shopeeDesktopBootstrapVersion === VERSION) return;
  root.shopeeDesktopBootstrapVersion = VERSION;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
      `width=${DESKTOP_WIDTH}, initial-scale=0.25, minimum-scale=0.10, maximum-scale=5, user-scalable=yes`
    );
    document.documentElement.style.minWidth = `${DESKTOP_WIDTH}px`;
    if (document.body) document.body.style.minWidth = `${DESKTOP_WIDTH}px`;
    document.documentElement.dataset.radarDesktopMode = 'true';
  }

  function requestNativeDesktop() {
    const bridges = [
      window.RadarNative,
      window.Android,
      window.NativeBridge,
      window.WebViewBridge,
      window.AppBridge
    ].filter(Boolean);
    const methods = [
      'setDesktopMode',
      'setDesktopSite',
      'requestDesktopSite',
      'enableDesktopMode',
      'setRequestDesktopSite',
      'useDesktopMode',
      'setPcMode',
      'enablePcMode'
    ];
    let called = false;
    for (const bridge of bridges) {
      for (const method of methods) {
        if (typeof bridge?.[method] !== 'function') continue;
        try {
          bridge[method](true);
          called = true;
        } catch {
          try {
            bridge[method]();
            called = true;
          } catch {}
        }
      }
    }
    try {
      localStorage.setItem('radar_desktop_mode', 'true');
      localStorage.setItem('radar_pc_mode', 'true');
      sessionStorage.setItem('radar_desktop_mode', 'true');
    } catch {}
    try {
      const detail = { enabled: true, width: DESKTOP_WIDTH, scale: 0.25, host: location.hostname };
      window.dispatchEvent(new CustomEvent('radar:desktop-mode', { detail }));
      document.dispatchEvent(new CustomEvent('radar:request-desktop', { detail }));
      window.postMessage({ type: 'radar.desktop-mode', ...detail }, '*');
    } catch {}
    return called;
  }

  function loadAutopilot() {
    if (root.shopeeAutopilotVersion || document.getElementById('radar-shopee-autopilot-v1-loader')) return;
    const script = document.createElement('script');
    script.id = 'radar-shopee-autopilot-v1-loader';
    script.src = AUTOPILOT_V1;
    script.async = false;
    script.onload = () => {
      status('✅ Modo PC preparado. Iniciando o garimpo automático...', 'done');
      setTimeout(() => document.getElementById('radar-autopilot-desktop-status')?.remove(), 2200);
    };
    script.onerror = () => status('❌ Não foi possível carregar o módulo de garimpo automático.', 'error');
    (document.head || document.documentElement).appendChild(script);
  }

  async function initialize() {
    status('🖥️ Ativando o modo PC antes de abrir o garimpo...');
    applyDesktopViewport();
    requestNativeDesktop();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await sleep(500);
      applyDesktopViewport();
      requestNativeDesktop();
    }

    loadAutopilot();
  }

  root.shopeeDesktopBootstrap = {
    version: VERSION,
    desktopWidth: DESKTOP_WIDTH,
    automatic: true,
    start: initialize,
    loadedAt: Date.now()
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
