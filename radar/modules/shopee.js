(() => {
  'use strict';
  const VERSION = '1.0.0';
  if (window.__radarShopeeModuleVersion === VERSION) return;
  window.__radarShopeeModuleVersion = VERSION;

  const native = window.RadarNative;
  const send = (payload) => { try { native?.emit(JSON.stringify(payload)); } catch (_) {} };
  const text = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();

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
    if (document.getElementById('radar-remote-tools')) return;
    const bar = document.createElement('div');
    bar.id = 'radar-remote-tools';
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:18px;z-index:2147483647;display:flex;gap:8px;padding:9px;border:1px solid #2bd4ff66;border-radius:16px;background:#07111fee;box-shadow:0 12px 40px #0008;font-family:system-ui';
    bar.innerHTML = '<button data-radar="read">Ler produtos</button><button data-radar="panel">Painel Radar</button><span style="margin-left:auto;color:#74dfff;font-size:11px;align-self:center">módulo '+VERSION+'</span>';
    [...bar.querySelectorAll('button')].forEach(btn => btn.style.cssText = 'border:0;border-radius:11px;padding:10px 12px;background:#153653;color:white;font-weight:700');
    bar.addEventListener('click', (event) => {
      const action = event.target?.dataset?.radar;
      if (action === 'read') findProducts();
      if (action === 'panel') native?.openPanel();
    });
    document.documentElement.appendChild(bar);
  }

  mount();
  send({ type: 'module.ready', module: 'shopee', version: VERSION, message: 'Ferramentas remotas da Shopee carregadas.' });
})();
