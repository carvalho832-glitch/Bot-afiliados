(() => {
  'use strict';

  const VERSION = '1.0.0';
  const BASE_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-shopee-phase24b2.js?v=2';
  const LINK_BUTTON_ID = 'radar-phase24-link-button';
  const ROOT = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (ROOT.shopeeBackRemountVersion === VERSION) return;
  ROOT.shopeeBackRemountVersion = VERSION;

  let loadPromise = null;
  let scheduled = 0;
  let lastAutomaticBatchLoad = 0;

  function hasBaseModule() {
    return Boolean(ROOT.shopeeLinks?.detailPageResume);
  }

  function hasObtainLinkButton() {
    return [...document.querySelectorAll('button,[role="button"],a')].some(element =>
      /obter\s*link/i.test(String(element.innerText || element.textContent || '').trim())
    );
  }

  function loadBaseModule() {
    if (hasBaseModule()) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-radar-phase24b2-base="true"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = BASE_MODULE;
      script.async = true;
      script.dataset.radarPhase24b2Base = 'true';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Não foi possível carregar o módulo da Fase 24B.2.')), { once: true });
      (document.head || document.documentElement).appendChild(script);
    }).finally(() => {
      loadPromise = null;
    });

    return loadPromise;
  }

  function pulseBaseObserver() {
    if (!document.documentElement) return;
    const marker = document.createComment('radar-phase24b2-remount');
    document.documentElement.appendChild(marker);
    marker.remove();
  }

  async function restoreButtonAndBatch() {
    try {
      await loadBaseModule();
      pulseBaseObserver();

      if (!hasObtainLinkButton()) return;

      const button = document.getElementById(LINK_BUTTON_ID);
      if (!button) {
        pulseBaseObserver();
        return;
      }

      const needsBatchReload = /carregar\s+lote\s+aprovado/i.test(button.textContent || '');
      const now = Date.now();
      if (needsBatchReload && now - lastAutomaticBatchLoad > 4000) {
        lastAutomaticBatchLoad = now;
        await ROOT.shopeeLinks?.loadBatch?.();
        pulseBaseObserver();
      }
    } catch (error) {
      console.warn('[FASE 24B.2] Não foi possível restaurar o botão após a navegação.', error);
    }
  }

  function scheduleRestore(delay = 250) {
    clearTimeout(scheduled);
    scheduled = setTimeout(restoreButtonAndBatch, delay);
  }

  window.addEventListener('pageshow', () => scheduleRestore(100));
  window.addEventListener('popstate', () => scheduleRestore(100));
  window.addEventListener('hashchange', () => scheduleRestore(100));
  window.addEventListener('load', () => scheduleRestore(100));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRestore(100);
  });

  const observer = new MutationObserver(() => scheduleRestore(250));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const interval = setInterval(() => {
    if (!document.documentElement?.isConnected) {
      clearInterval(interval);
      observer.disconnect();
      return;
    }
    restoreButtonAndBatch();
  }, 1200);

  ROOT.shopeeBackRemount = {
    version: VERSION,
    automaticBatchReload: true,
    pageshowRestore: true,
    pollingFallback: true,
    loadedAt: Date.now()
  };

  scheduleRestore(0);
})();
