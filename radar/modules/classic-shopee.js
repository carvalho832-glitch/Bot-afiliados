(() => {
  'use strict';

  const VERSION = '1.0.0';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};
  if (root.shopeeVersion === VERSION) return;

  root.shopeeVersion = VERSION;
  root.selectors = root.selectors || {};
  root.selectors.shopee = {
    cards: [
      '[class*="product-card"]',
      '[class*="ProductCard"]',
      '[class*="offer-item"]',
      '[class*="product-item"]'
    ],
    obtainLinkButtons: [
      'button',
      '[role="button"]',
      'a'
    ],
    productLinks: [
      'a[href*="/offer/"]',
      'a[href*="product"]'
    ]
  };

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  root.probeShopee = () => {
    const body = clean(document.body?.innerText || '');
    const buttons = [...document.querySelectorAll('button, [role="button"], a')];
    const obtainLinks = buttons.filter((element) => /obter\s*link/i.test(clean(element.innerText || element.textContent)));
    return {
      handled: true,
      version: VERSION,
      url: location.href,
      title: document.title,
      obtainLinkButtons: obtainLinks.length,
      hasOfferGrid: /oferta de produto/i.test(body),
      loadedAt: Date.now()
    };
  };

  root.beforeReadProducts = () => {
    const candidates = [...document.querySelectorAll('button, [role="button"], a')]
      .filter((element) => /obter\s*link/i.test(clean(element.innerText || element.textContent)));

    candidates.forEach((button, index) => {
      button.dataset.radarObtainLink = String(index);
      const card = button.closest('[class*="card"], [class*="item"], li, article, section, div');
      if (card) card.dataset.radarProductCard = String(index);
    });

    return {
      handled: true,
      taggedButtons: candidates.length,
      version: VERSION
    };
  };

  root.findObtainLink = (payload) => {
    const title = clean(payload?.title).toLowerCase();
    const buttons = [...document.querySelectorAll('button, [role="button"], a')]
      .filter((element) => /obter\s*link/i.test(clean(element.innerText || element.textContent)));

    const match = buttons.find((button) => {
      const card = button.closest('[class*="card"], [class*="item"], li, article, section, div');
      const cardText = clean(card?.innerText || card?.textContent).toLowerCase();
      return title && cardText.includes(title.slice(0, 36));
    });

    if (!match) return { handled: false };
    match.scrollIntoView({ block: 'center', inline: 'center' });
    return { handled: true, index: buttons.indexOf(match) };
  };

  window.__radarClassicRemote = window.__radarClassicRemote || {};
  window.__radarClassicRemote.shopee = {
    version: VERSION,
    ready: true,
    loadedAt: Date.now()
  };
})();
