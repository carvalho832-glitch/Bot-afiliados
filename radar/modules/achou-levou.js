(() => {
  'use strict';
  const VERSION = '1.0.0';
  if (window.__radarAchouModuleVersion === VERSION) return;
  window.__radarAchouModuleVersion = VERSION;
  try { window.RadarNative?.emit(JSON.stringify({ type: 'module.ready', module: 'achou-levou', version: VERSION, message: 'Integração remota do Achou Levou carregada.' })); } catch (_) {}
})();
