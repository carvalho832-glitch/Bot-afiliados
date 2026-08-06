(() => {
  'use strict';

  const VERSION = '5.0.0';
  const SHOPEE_URL = 'https://affiliate.shopee.com.br/offer/product_offer';
  const NAV_GUARD_KEY = 'radar_phase24_navigation_v5';
  let navigating = false;

  function isStillOnPanel() {
    return location.hostname === 'carvalho832-glitch.github.io' && /\/Bot-afiliados\/radar\/?(?:index\.html)?$/i.test(location.pathname);
  }

  function recordNavigation() {
    try {
      sessionStorage.setItem(NAV_GUARD_KEY, JSON.stringify({ at: Date.now(), url: SHOPEE_URL }));
    } catch {}
  }

  function nativeOpen() {
    const native = window.RadarNative;
    if (!native || typeof native.openUrl !== 'function') return false;
    try {
      native.openUrl(SHOPEE_URL);
      return true;
    } catch {
      return false;
    }
  }

  function anchorOpen() {
    try {
      const anchor = document.createElement('a');
      anchor.href = SHOPEE_URL;
      anchor.target = '_self';
      anchor.rel = 'noreferrer';
      anchor.style.display = 'none';
      document.documentElement.appendChild(anchor);
      anchor.click();
      setTimeout(() => anchor.remove(), 1000);
      return true;
    } catch {
      return false;
    }
  }

  function navigate() {
    if (navigating || !isStillOnPanel()) return;
    navigating = true;
    recordNavigation();

    nativeOpen();

    setTimeout(() => {
      if (!isStillOnPanel()) return;
      anchorOpen();
    }, 450);

    setTimeout(() => {
      if (!isStillOnPanel()) return;
      try { location.assign(SHOPEE_URL); } catch {}
    }, 1100);

    setTimeout(() => {
      if (!isStillOnPanel()) return;
      try { location.replace(SHOPEE_URL); } catch {}
    }, 2200);

    setTimeout(() => {
      if (!isStillOnPanel()) return;
      navigating = false;
      const status = document.getElementById('phase24-status');
      if (status) {
        status.dataset.kind = 'error';
        status.textContent = 'A produção foi criada, mas o Android bloqueou a abertura automática. Toque em Shopee Afiliados para continuar a mesma produção.';
      }
    }, 4000);
  }

  function observeStatus() {
    const status = document.getElementById('phase24-status');
    if (!status) return;

    const check = () => {
      const message = String(status.textContent || '');
      if (/Execução criada\. Abrindo a Shopee/i.test(message)) navigate();
    };

    new MutationObserver(check).observe(status, {
      childList: true,
      characterData: true,
      subtree: true
    });
    check();
  }

  function initialize() {
    observeStatus();
    window.RadarPhase24Navigation = {
      version: VERSION,
      openShopee: navigate,
      url: SHOPEE_URL
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
