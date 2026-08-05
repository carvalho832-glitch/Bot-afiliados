(() => {
  'use strict';

  const VERSION = '1.0.0';
  const B3_ENTRY = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b3-entry.js?v=1';
  const VERIFIED_TRANSFER = 'https://carvalho832-glitch.github.io/Bot-afiliados/verified-bot-transfer.js?v=2';
  const B4_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b4.js?v=1';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B4EntryVersion === VERSION) return;
  root.achouLevouPhase24B4EntryVersion = VERSION;

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
      if (!root.achouLevouPhase24B3EntryVersion) {
        await loadScript(B3_ENTRY, 'achou-levou-phase24b3-entry');
      }
      if (!window.AchouLevouVerifiedBotTransfer?.transferOffers) {
        await loadScript(VERIFIED_TRANSFER, 'achou-levou-verified-transfer');
      }
      await loadScript(B4_MODULE, 'achou-levou-phase24b4');
      root.achouLevouPhase24B4Entry = {
        version: VERSION,
        b3Preserved: true,
        verifiedTransferPreserved: true,
        persistentReview: true,
        supervisedTransfer: true,
        loadedAt: Date.now()
      };
    } catch (error) {
      console.error('[FASE 24B.4] Não foi possível iniciar o módulo:', error);
    }
  })();
})();
