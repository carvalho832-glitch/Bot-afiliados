(() => {
  'use strict';

  const VERSION = '2.1.0';
  const API = 'https://bot-afiliados-1fwi.onrender.com';
  const BUTTON_ID = 'radar-phase24-capture-button';
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
    obtainLinkButtons: ['button', '[role="button"]', 'a'],
    productLinks: ['a[href*="/offer/"]', 'a[href*="product"]']
  };

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  function toast(message, kind = 'ok') {
    document.getElementById('radar-phase24-toast')?.remove();
    const box = document.createElement('div');
    box.id = 'radar-phase24-toast';
    box.textContent = message;
    box.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:188px', 'transform:translateX(-50%)',
      'z-index:2147483647', 'max-width:calc(100% - 28px)', 'padding:12px 16px',
      'border-radius:14px', 'font:700 13px system-ui', 'text-align:center',
      kind === 'error' ? 'background:#7f1d1d;color:#fee2e2' : 'background:#e6fff5;color:#052e21',
      'box-shadow:0 12px 36px #0008'
    ].join(';');
    document.documentElement.appendChild(box);
    setTimeout(() => box.remove(), 6000);
  }

  function parseLocalizedNumber(value) {
    const text = clean(value).toLowerCase();
    const match = text.match(/(\d+(?:[.,]\d+)?)\s*(mil|k|mi|m)?/i);
    if (!match) return null;
    let number = Number(match[1].replace(/\./g, '').replace(',', '.'));
    const suffix = match[2];
    if (suffix === 'mil' || suffix === 'k') number *= 1000;
    if (suffix === 'mi' || suffix === 'm') number *= 1000000;
    return Number.isFinite(number) ? number : null;
  }

  function parsePrice(text) {
    const match = clean(text).match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
    if (!match) return { text: '', value: null };
    const value = Number(match[1].replace(/\./g, '').replace(',', '.'));
    return { text: `R$ ${match[1]}`, value: Number.isFinite(value) ? value : null };
  }

  function parseSold(text) {
    const match = clean(text).match(/([\d.,]+\s*(?:mil|k|mi|m)?)\s*(?:vendid[oa]s?|vendas?)/i);
    if (!match) return { text: '', count: null };
    return { text: clean(match[0]), count: parseLocalizedNumber(match[1]) };
  }

  function parseRating(text) {
    const patterns = [
      /(?:nota|avalia(?:ç|c)ão|rating)\s*[:\-]?\s*([0-5](?:[.,]\d)?)/i,
      /([0-5](?:[.,]\d)?)\s*(?:estrelas?|⭐)/i
    ];
    for (const pattern of patterns) {
      const match = clean(text).match(pattern);
      if (!match) continue;
      const value = Number(match[1].replace(',', '.'));
      if (Number.isFinite(value) && value <= 5) return value;
    }
    return null;
  }

  function parseCommission(text) {
    const match = clean(text).match(/(?:comiss(?:ã|a)o|ganhe)\s*[:\-]?\s*(R\$\s*[\d.,]+|\d+(?:[.,]\d+)?%)/i);
    return match ? clean(match[1]) : '';
  }

  function cardForButton(button) {
    let node = button;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const text = clean(node.innerText || node.textContent);
      const links = node.querySelectorAll?.('a[href]')?.length || 0;
      if (text.length >= 25 && text.length <= 1800 && links) return node;
    }
    return button.closest('[class*="card"], [class*="item"], li, article, section, div');
  }

  function titleFromCard(card, button) {
    const candidates = [...card.querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="name"],a[href]')];
    for (const element of candidates) {
      if (element === button || element.contains(button)) continue;
      const value = clean(element.getAttribute('title') || element.innerText || element.textContent);
      if (value.length >= 8 && value.length <= 300 && !/obter\s*link|comiss(?:ã|a)o/i.test(value)) return value;
    }
    return clean(card.innerText || card.textContent)
      .replace(/obter\s*link/ig, '')
      .split(/R\$|vendid|comiss/i)[0]
      .slice(0, 300)
      .trim();
  }

  function productUrlFromCard(card) {
    const anchors = [...card.querySelectorAll('a[href]')];
    const preferred = anchors.find(anchor => /product|offer|item/i.test(anchor.href));
    return (preferred || anchors[0])?.href || '';
  }

  function extractProducts() {
    const buttons = [...document.querySelectorAll('button, [role="button"], a')]
      .filter(element => /obter\s*link/i.test(clean(element.innerText || element.textContent)));
    const seen = new Set();
    const items = [];

    buttons.forEach((button, index) => {
      if (items.length >= 40) return;
      const card = cardForButton(button);
      if (!card) return;
      const title = titleFromCard(card, button);
      const url = productUrlFromCard(card);
      if (!title || !url || seen.has(url)) return;
      seen.add(url);
      const cardText = clean(card.innerText || card.textContent);
      const price = parsePrice(cardText);
      const sold = parseSold(cardText);
      const image = card.querySelector('img')?.currentSrc || card.querySelector('img')?.src || '';
      const productIdMatch = url.match(/(?:product|item|offer)[^\d]*(\d{4,})/i);
      items.push({
        sourceId: productIdMatch?.[1] || '',
        position: index,
        title,
        url,
        image,
        priceText: price.text,
        priceValue: price.value,
        soldText: sold.text,
        soldCount: sold.count,
        rating: parseRating(cardText),
        commissionText: parseCommission(cardText),
        decision: 'pending',
        stage: 'captured'
      });
    });
    return items;
  }

  async function uploadBatch(items, button = null) {
    if (!items.length) {
      toast('Nenhum produto foi encontrado para a Fase 24B.', 'error');
      return false;
    }

    const originalLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = `⏳ Enviando ${items.length}...`;
    }

    try {
      const response = await fetch(`${API}/phase24/batches`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          profile: 'julio',
          source: 'radar-classic-shopee-direct',
          sourceUrl: location.href,
          replaceCurrent: true,
          filters: { maxItems: 15, minSold: 0, minRating: 0 },
          items
        })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP ${response.status}`);

      const total = body.batch?.summary?.total || items.length;
      toast(`✅ Fase 24B: ${total} produtos salvos. Volte ao Painel e toque em Buscar lote.`);
      window.__radarClassicRemote = window.__radarClassicRemote || {};
      window.__radarClassicRemote.phase24 = {
        batchId: body.batch?.id,
        total,
        capturedAt: Date.now()
      };
      if (button) button.textContent = `✅ Lote salvo (${total})`;
      return true;
    } catch (error) {
      toast(`Fase 24B não salvou o lote: ${error.message}`, 'error');
      if (button) button.textContent = '⚠️ Tentar enviar à revisão';
      return false;
    } finally {
      if (button) {
        button.disabled = false;
        setTimeout(() => {
          if (button.isConnected) button.textContent = originalLabel || '📦 Enviar à revisão 24B';
        }, 5000);
      }
    }
  }

  function hasProductGrid() {
    return [...document.querySelectorAll('button, [role="button"], a')]
      .some(element => /obter\s*link/i.test(clean(element.innerText || element.textContent)));
  }

  function mountCaptureButton() {
    if (!document.body || document.getElementById(BUTTON_ID) || !hasProductGrid()) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = '📦 Enviar à revisão 24B';
    button.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:182px', 'z-index:2147483646',
      'border:1px solid #55e8ff99', 'border-radius:15px', 'padding:12px 15px',
      'background:linear-gradient(135deg,#0e7490,#2563eb)', 'color:#fff',
      'font:800 13px system-ui', 'box-shadow:0 12px 32px #0008'
    ].join(';');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      uploadBatch(extractProducts(), button);
    });
    document.documentElement.appendChild(button);
  }

  root.probeShopee = () => {
    const body = clean(document.body?.innerText || '');
    const buttons = [...document.querySelectorAll('button, [role="button"], a')];
    const obtainLinks = buttons.filter(element => /obter\s*link/i.test(clean(element.innerText || element.textContent)));
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

  root.capturePhase24Batch = () => {
    const items = extractProducts();
    uploadBatch(items);
    return { handled: true, captured: items.length, asynchronous: true, version: VERSION };
  };

  root.beforeReadProducts = () => {
    const candidates = [...document.querySelectorAll('button, [role="button"], a')]
      .filter(element => /obter\s*link/i.test(clean(element.innerText || element.textContent)));
    candidates.forEach((button, index) => {
      button.dataset.radarObtainLink = String(index);
      const card = cardForButton(button);
      if (card) card.dataset.radarProductCard = String(index);
    });
    return {
      handled: true,
      taggedButtons: candidates.length,
      phase24Captured: 0,
      directCaptureButton: true,
      version: VERSION
    };
  };

  root.findObtainLink = payload => {
    const title = clean(payload?.title).toLowerCase();
    const buttons = [...document.querySelectorAll('button, [role="button"], a')]
      .filter(element => /obter\s*link/i.test(clean(element.innerText || element.textContent)));
    const match = buttons.find(button => {
      const card = cardForButton(button);
      const cardText = clean(card?.innerText || card?.textContent).toLowerCase();
      return title && cardText.includes(title.slice(0, 36));
    });
    if (!match) return { handled: false };
    match.scrollIntoView({ block: 'center', inline: 'center' });
    return { handled: true, index: buttons.indexOf(match) };
  };

  mountCaptureButton();
  let mountTimer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(mountTimer);
    mountTimer = setTimeout(mountCaptureButton, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.__radarClassicRemote = window.__radarClassicRemote || {};
  window.__radarClassicRemote.shopee = {
    version: VERSION,
    ready: true,
    phase24: true,
    directCaptureButton: true,
    loadedAt: Date.now()
  };
})();
