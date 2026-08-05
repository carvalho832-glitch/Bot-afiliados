(() => {
  'use strict';

  const VERSION = '1.0.0';
  const BASE_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou.js?v=3';
  const PHASE_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b3.js?v=1';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B3EntryVersion === VERSION) return;
  root.achouLevouPhase24B3EntryVersion = VERSION;

  function loadScript(src, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-radar-module="${marker}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${marker}.`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.radarModule = marker;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Falha ao carregar ${marker}.`)), { once: true });
      (document.head || document.documentElement).appendChild(script);
    });
  }

  (async () => {
    try {
      if (!root.achouLevouVersion) {
        await loadScript(BASE_MODULE, 'achou-levou-shared-base');
      }
      await loadScript(PHASE_MODULE, 'achou-levou-phase24b3');
      root.achouLevouPhase24B3Entry = {
        version: VERSION,
        basePreserved: true,
        supervisedMessages: true,
        loadedAt: Date.now()
      };
    } catch (error) {
      console.error('[FASE 24B.3] Não foi possível iniciar o módulo:', error);
    }
  })();
})();
