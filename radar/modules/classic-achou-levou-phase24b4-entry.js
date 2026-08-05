(() => {
  'use strict';

  const VERSION = '3.0.0';
  const B3_ENTRY = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b3-entry.js?v=1';
  const VERIFIED_TRANSFER = 'https://carvalho832-glitch.github.io/Bot-afiliados/verified-bot-transfer.js?v=2';
  const REHYDRATE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b4-rehydrate.js?v=1';
  const B4_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b4-v2.js?v=2';
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

      await loadScript(REHYDRATE, 'achou-levou-phase24b4-rehydrate');
      const recovery = await root.phase24B4RestoreOffers?.();
      if (recovery && !recovery.ok) {
        console.warn('[FASE 24B.4] Recuperação parcial:', recovery);
      }

      await loadScript(B4_MODULE, 'achou-levou-phase24b4-v2');
      root.achouLevouPhase24B4Entry = {
        version: VERSION,
        b3Preserved: true,
        verifiedTransferPreserved: true,
        persistentReview: true,
        recoveredCompletedBatch: true,
        restoredSharedOffers: true,
        recovery: recovery || null,
        supervisedTransfer: true,
        loadedAt: Date.now()
      };
    } catch (error) {
      console.error('[FASE 24B.4] Não foi possível iniciar o módulo:', error);
    }
  })();
})();
