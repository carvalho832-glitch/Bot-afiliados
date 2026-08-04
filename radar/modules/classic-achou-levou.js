(() => {
  'use strict';

  const VERSION = '1.0.0';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};
  if (root.achouLevouVersion === VERSION) return;

  root.achouLevouVersion = VERSION;
  root.selectors = root.selectors || {};
  root.selectors.achouLevou = {
    link: 'input-link',
    title: 'display-produto',
    oldPrice: 'display-de',
    price: 'display-por',
    coupon: 'display-cupom',
    message: 'msg-preview',
    generate: 'btn-gerar',
    save: 'btn-salvar'
  };

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  root.probeAchouLevou = () => {
    const ids = root.selectors.achouLevou;
    const present = Object.fromEntries(
      Object.entries(ids).map(([key, id]) => [key, !!document.getElementById(id)])
    );
    return {
      handled: true,
      version: VERSION,
      url: location.href,
      fields: present,
      message: clean(document.getElementById(ids.message)?.innerText || ''),
      loadedAt: Date.now()
    };
  };

  root.beforePrepareAchouLevou = () => {
    const ids = root.selectors.achouLevou;
    const required = [ids.link, ids.title, ids.price, ids.message];
    return {
      handled: required.every((id) => !!document.getElementById(id)),
      missing: required.filter((id) => !document.getElementById(id)),
      version: VERSION
    };
  };

  window.__radarClassicRemote = window.__radarClassicRemote || {};
  window.__radarClassicRemote.achouLevou = {
    version: VERSION,
    ready: true,
    loadedAt: Date.now()
  };
})();
