(() => {
  'use strict';

  const VERSION = '6.0.0';
  const SHOPEE_URL = 'https://affiliate.shopee.com.br/offer/product_offer';
  const API = 'https://bot-afiliados-1fwi.onrender.com';
  const PENDING_KEY = 'radar_phase24_desktop_before_shopee_v6';
  const MAX_PENDING_AGE = 120000;
  let preparing = false;
  let navigating = false;

  function onPanel() {
    return location.hostname === 'carvalho832-glitch.github.io' && /\/Bot-afiliados\/radar\/?(?:index\.html)?$/i.test(location.pathname);
  }

  function setStatus(message, kind = 'loading') {
    const box = document.getElementById('phase24-status');
    if (!box) return;
    box.dataset.kind = kind;
    box.textContent = message;
  }

  function savePending() {
    try {
      localStorage.setItem(PENDING_KEY, String(Date.now()));
    } catch {}
  }

  function readPending() {
    try {
      const value = Number(localStorage.getItem(PENDING_KEY) || 0);
      if (!value || Date.now() - value > MAX_PENDING_AGE) {
        localStorage.removeItem(PENDING_KEY);
        return 0;
      }
      return value;
    } catch {
      return 0;
    }
  }

  function clearPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch {}
  }

  async function hasActiveRun() {
    try {
      const profile = localStorage.getItem('radar_phase24_profile') || 'julio';
      const response = await fetch(`${API}/phase24/autopilot/runs?profile=${encodeURIComponent(profile)}&current=1&t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const body = await response.json();
      const run = body?.run;
      return Boolean(body?.ok && run && !['completed', 'cancelled', 'failed'].includes(run.status));
    } catch {
      return false;
    }
  }

  function openShopee() {
    if (navigating || !onPanel()) return;
    navigating = true;
    clearPending();
    setStatus('✅ Modo PC preparado. Abrindo Oferta de produto...', 'ok');

    const native = window.RadarNative;
    try {
      if (typeof native?.openUrl === 'function') {
        native.openUrl(SHOPEE_URL);
      } else {
        location.assign(SHOPEE_URL);
      }
    } catch {
      try { location.assign(SHOPEE_URL); } catch {}
    }

    setTimeout(() => {
      if (!onPanel()) return;
      try { location.replace(SHOPEE_URL); } catch {}
    }, 1800);
  }

  async function prepareDesktopThenOpen() {
    if (preparing || !onPanel()) return;
    preparing = true;
    const native = window.RadarNative;

    try {
      if (typeof native?.isDesktopMode === 'function' && typeof native?.toggleDesktopMode === 'function') {
        const active = Boolean(native.isDesktopMode());
        if (!active) {
          savePending();
          setStatus('🖥️ Ativando o modo PC antes de abrir a Shopee...', 'loading');
          native.toggleDesktopMode();

          setTimeout(async () => {
            if (!onPanel()) return;
            const runActive = await hasActiveRun();
            if (runActive) openShopee();
          }, 2200);
          return;
        }
      }
    } catch {}

    openShopee();
  }

  async function resumeAfterDesktopReload() {
    if (!onPanel() || !readPending()) return;
    setStatus('🖥️ Modo PC ativado. Retomando a abertura da Shopee...', 'loading');
    const active = await hasActiveRun();
    if (!active) {
      clearPending();
      return;
    }
    setTimeout(openShopee, 500);
  }

  function observeProductionStart() {
    const status = document.getElementById('phase24-status');
    if (!status) return;
    const check = () => {
      const message = String(status.textContent || '');
      if (/Execução criada\. Abrindo a Shopee/i.test(message)) prepareDesktopThenOpen();
    };
    new MutationObserver(check).observe(status, { childList: true, characterData: true, subtree: true });
    check();
  }

  function initialize() {
    observeProductionStart();
    resumeAfterDesktopReload();
    window.RadarPhase24Navigation = {
      version: VERSION,
      prepareShopee: prepareDesktopThenOpen,
      openShopee,
      url: SHOPEE_URL
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
