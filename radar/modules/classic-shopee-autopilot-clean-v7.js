(() => {
  'use strict';

  const VERSION = '7.0.0';
  const API = 'https://bot-afiliados-1fwi.onrender.com';
  const RUNS = `${API}/phase24/autopilot/runs`;
  const ACHOU = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/achou-levou-direct-v11.html?v=1&safe=1';
  const MAX_ATTEMPTS = 3;
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.shopeeCleanAutopilotVersion === VERSION) return;
  root.shopeeCleanAutopilotVersion = VERSION;

  const state = { busy: false, timer: 0, copied: '' };
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function status(message, kind = 'work') {
    let box = document.getElementById('radar-autopilot-clean-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'radar-autopilot-clean-status';
      document.documentElement.appendChild(box);
    }
    const palette = kind === 'error'
      ? 'background:#7f1d1dee;color:#fee2e2;border:1px solid #fb7185'
      : kind === 'done'
        ? 'background:#064e3bee;color:#d1fae5;border:1px solid #34d399'
        : kind === 'warn'
          ? 'background:#78350fee;color:#ffedd5;border:1px solid #fb923c'
          : 'background:#082f49ee;color:#e0f2fe;border:1px solid #38bdf8';
    box.style.cssText = `position:fixed;left:12px;right:12px;bottom:178px;z-index:2147483647;padding:12px 15px;border-radius:15px;font:800 13px/1.4 system-ui;text-align:center;box-shadow:0 12px 36px #0009;${palette}`;
    box.textContent = message;
  }

  async function request(url, options = {}, timeout = 35000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A operação demorou demais para responder.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const getRun = async () => (await request(`${RUNS}?active=1&t=${Date.now()}`, {}, 25000)).run || null;
  const patchRun = async (run, data) => (await request(`${RUNS}/${encodeURIComponent(run.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })).run;
  const patchItem = async (run, item, data) => request(`${RUNS}/${encodeURIComponent(run.id)}/items/${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  const open = url => window.RadarNative?.openUrl ? window.RadarNative.openUrl(url) : location.assign(url);

  function visible(element) {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect?.();
    const style = getComputedStyle(element);
    return Boolean(rect && rect.width >= 1 && rect.height >= 1 && style.display !== 'none' && style.visibility !== 'hidden');
  }

  function labelOf(element) {
    return clean(
      element?.innerText || element?.textContent || element?.value ||
      element?.getAttribute?.('aria-label') || element?.getAttribute?.('title')
    );
  }

  function linkButtons() {
    return [...document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]')]
      .filter(element => visible(element) && /obter\s*link/i.test(labelOf(element)) && !element.classList?.contains('radar-autopilot-link-bridge'));
  }

  function cardFor(button) {
    let node = button;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      const text = clean(node.innerText || node.textContent);
      if (text.length < 20 || text.length > 1800) continue;
      const hasPrice = /R\$\s*[\d.]+(?:,\d{1,2})?/i.test(text);
      const hasProductSignal = /comiss(?:ã|a)o|vendid|vendas?|R\$/i.test(text);
      const hasMedia = Boolean(node.querySelector?.('img'));
      const buttonsInside = [...(node.querySelectorAll?.('button,[role="button"],a,input') || [])]
        .filter(element => /obter\s*link/i.test(labelOf(element))).length;
      if (hasPrice && hasProductSignal && hasMedia && buttonsInside <= 2) return node;
    }
    return button.closest('[class*="product"],[class*="Product"],[class*="card"],[class*="Card"],li,article') || button.parentElement;
  }

  function simpleHash(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function number(value) {
    const match = clean(value).toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(mil|k|mi|m)?/);
    if (!match) return null;
    let result = Number(match[1].replace(/\./g, '').replace(',', '.'));
    if (match[2] === 'mil' || match[2] === 'k') result *= 1000;
    if (match[2] === 'mi' || match[2] === 'm') result *= 1000000;
    return Number.isFinite(result) ? result : null;
  }

  function titleFrom(card, button) {
    const imageAlt = [...card.querySelectorAll('img[alt]')]
      .map(image => clean(image.getAttribute('alt')))
      .find(value => value.length >= 8 && !/shopee|imagem|produto$/i.test(value));
    if (imageAlt) return imageAlt;

    const titled = [...card.querySelectorAll('[title]')]
      .map(element => clean(element.getAttribute('title')))
      .find(value => value.length >= 8 && !/obter\s*link/i.test(value));
    if (titled) return titled;

    const heading = [...card.querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="Title"],[class*="name"],[class*="Name"]')]
      .map(element => clean(element.textContent))
      .find(value => value.length >= 8 && !/obter\s*link/i.test(value));
    if (heading) return heading;

    const raw = clean(card.innerText || card.textContent)
      .replace(labelOf(button), ' ')
      .split(/R\$|taxa\s+de\s+comiss|comiss(?:ã|a)o|vendid|vendas?/i)[0];
    return clean(raw).slice(0, 500);
  }

  function pageMarker() {
    const current = [...document.querySelectorAll('[aria-current="page"],[class*="active"],[class*="Active"]')]
      .map(element => clean(element.textContent))
      .find(value => /^\d{1,4}$/.test(value));
    return current || '1';
  }

  function products() {
    const buttons = linkButtons();
    const seenCards = new Set();
    const seenKeys = new Set();
    const marker = pageMarker();
    const items = [];

    buttons.forEach((button, position) => {
      const card = cardFor(button);
      if (!card || seenCards.has(card)) return;
      seenCards.add(card);

      const title = titleFrom(card, button);
      const text = clean(card.innerText || card.textContent);
      const image = card.querySelector('img')?.currentSrc || card.querySelector('img')?.src || '';
      if (!title || title.length < 8 || !/R\$/i.test(text)) return;

      const key = simpleHash(`${title}|${image}|${marker}|${position}`);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const realAnchor = [...card.querySelectorAll('a[href]')]
        .find(anchor => /product|item/i.test(anchor.href) && /shopee/i.test(anchor.hostname || anchor.href));
      const url = realAnchor?.href || `https://affiliate.shopee.com.br/offer/product_offer?radar_item=${key}&page=${encodeURIComponent(marker)}`;
      const price = text.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
      const sold = text.match(/([\d.,]+\s*(?:mil|k|mi|m)?)\s*(?:vendid[oa]s?|vendas?)/i);
      const rating = norm(text).match(/(?:nota|avaliacao|rating)\s*[:\-]?\s*([0-5](?:[.,]\d)?)/i);

      items.push({
        sourceId: key,
        position,
        title,
        url,
        image,
        priceText: price ? `R$ ${price[1]}` : '',
        priceValue: price ? Number(price[1].replace(/\./g, '').replace(',', '.')) : null,
        soldText: sold ? clean(sold[0]) : '',
        soldCount: sold ? number(sold[1]) : null,
        rating: rating ? Number(rating[1].replace(',', '.')) : null,
        stage: 'candidate'
      });
    });

    return items;
  }

  function termsOf(filters = {}) {
    return clean(filters.keywords)
      .toLowerCase()
      .split(/[,;\n]+/)
      .map(value => value.trim())
      .filter(Boolean);
  }

  function numericApproved(item, filters = {}) {
    if (filters.minPrice != null && (item.priceValue == null || item.priceValue < Number(filters.minPrice))) return false;
    if (filters.maxPrice != null && (item.priceValue == null || item.priceValue > Number(filters.maxPrice))) return false;
    if (Number(filters.minSold || 0) && (item.soldCount == null || item.soldCount < Number(filters.minSold))) return false;
    if (Number(filters.minRating || 0) && (item.rating == null || item.rating < Number(filters.minRating))) return false;
    return true;
  }

  async function harvest(run) {
    status('🔎 Lendo somente os produtos visíveis, sem rolar nem recarregar a página...');

    let read = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      read = products();
      if (read.length) break;
      await sleep(250);
    }

    if (!read.length) throw new Error('Nenhum produto visível foi reconhecido. A página será mantida como está para diagnóstico.');

    const terms = termsOf(run.filters);
    const hasLiteralKeywordMatch = terms.length > 0 && read.some(item => terms.some(term => norm(item.title).includes(norm(term))));
    const items = read.map(item => {
      const numericPass = numericApproved(item, run.filters);
      const keywordPass = !terms.length || !hasLiteralKeywordMatch || terms.some(term => norm(item.title).includes(norm(term)));
      const decision = numericPass && keywordPass ? 'approved' : 'rejected';
      const reason = decision === 'approved'
        ? (!terms.length || hasLiteralKeywordMatch ? 'Passou pelos filtros automáticos.' : 'Nenhum título correspondeu literalmente aos nichos; mantido como candidato para não travar a produção.')
        : 'Reprovado pelos filtros automáticos.';
      return { ...item, decision, reason };
    });

    const approvedCount = items.filter(item => item.decision === 'approved').length;
    status(`✅ ${items.length} produtos reconhecidos, ${approvedCount} aprovados.`, approvedCount ? 'done' : 'warn');

    return patchRun(run, {
      status: 'running',
      stage: 'link',
      startedAt: run.startedAt || new Date().toISOString(),
      sourceUrl: location.href,
      appendItems: items,
      event: {
        type: 'garimpo',
        message: `${approvedCount} candidato(s) aprovados entre ${items.length} produtos visíveis. A página não foi rolada nem recarregada.`
      }
    });
  }

  const words = title => norm(title).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length >= 3).slice(0, 24);

  function matchButton(item) {
    const ranked = linkButtons().map(button => {
      const card = cardFor(button);
      const text = norm(card?.innerText || card?.textContent);
      const score = words(item.title).filter(word => text.includes(word)).length;
      return { button, score };
    }).sort((a, b) => b.score - a.score);

    return ranked[0]?.score >= 1 ? ranked[0].button : null;
  }

  const strip = value => clean(value).replace(/^[\s"'(<\[]+/, '').replace(/[\s"')>\],.;:]+$/, '');
  const urls = value => [...String(value || '').matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(match => strip(match[0]));

  function affiliate(value, original = '') {
    try {
      const url = new URL(strip(value));
      const host = url.hostname.toLowerCase();
      if (['s.shopee.com.br', 'shope.ee', 'br.shp.ee', 'shp.ee'].includes(host)) return true;
      return host.endsWith('shopee.com.br') && strip(value) !== strip(original) && /affiliate|uls_trackid|share_channel|utm_campaign|smtt=/i.test(`${url.pathname}?${url.search}`);
    } catch {
      return false;
    }
  }

  function candidates(original) {
    const values = new Set(state.copied ? [state.copied] : []);
    const scopes = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="Modal"],[class*="dialog"],[class*="Dialog"],[class*="popup"],[class*="Popup"]')];
    for (const scope of (scopes.length ? scopes : [document.body])) {
      for (const element of scope.querySelectorAll('input,textarea,a,[data-clipboard-text],[data-copy],[data-url]')) {
        [
          element.value,
          element.href,
          element.textContent,
          element.getAttribute('data-clipboard-text'),
          element.getAttribute('data-copy'),
          element.getAttribute('data-url')
        ].flatMap(urls).forEach(url => values.add(url));
      }
      urls(scope.innerText || scope.textContent).forEach(url => values.add(url));
    }
    return [...values].filter(url => affiliate(url, original)).sort((a, b) => a.length - b.length);
  }

  function installClipboard() {
    try {
      if (!navigator.clipboard?.writeText || navigator.clipboard.__radarCleanAuto) return;
      const original = navigator.clipboard.writeText.bind(navigator.clipboard);
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async text => {
          if (affiliate(text)) state.copied = strip(text);
          return original(text);
        }
      });
      navigator.clipboard.__radarCleanAuto = true;
    } catch {}
  }

  async function waitLink(item) {
    let copied = false;
    for (let round = 0; round < 50; round += 1) {
      const found = candidates(item.url)[0];
      if (found) return found;

      if (!copied && round >= 4) {
        const copy = [...document.querySelectorAll('button,[role="button"],a')]
          .find(element => /copiar(?:\s+link)?/i.test(labelOf(element)) && visible(element));
        if (copy) {
          copy.click();
          copied = true;
        }
      }

      if (copied) {
        try {
          const value = await navigator.clipboard.readText();
          if (affiliate(value, item.url)) return strip(value);
        } catch {}
      }

      await sleep(400);
    }
    return '';
  }

  const pending = run => (run.items || [])
    .filter(item => item.decision === 'approved' && item.stage !== 'saved-verified' && !/^failed-/.test(item.stage));

  async function toAchou(run, item) {
    await patchRun(run, {
      status: 'running',
      stage: 'achou-levou',
      currentItemId: item.id,
      event: { type: 'navigation', itemId: item.id, message: 'Link pronto. Indo gerar e salvar a oferta no Achou Levou.' }
    });
    status(`✅ Link capturado. Abrindo o Achou Levou para salvar a oferta ${run.successCount + 1}/${run.target}...`, 'done');
    await sleep(600);
    open(ACHOU);
  }

  async function failLink(run, item, message, attempts) {
    const final = attempts >= MAX_ATTEMPTS;
    await patchItem(run, item, {
      stage: final ? 'failed-link' : 'candidate',
      attempts: { ...(item.attempts || {}), link: attempts },
      lastError: clean(message),
      reason: final ? 'Produto ignorado após falhar ao gerar o link.' : 'O link será tentado novamente.',
      event: {
        type: final ? 'failure' : 'retry',
        message: final ? `Produto ignorado: ${clean(message)}` : `Nova tentativa de link: ${clean(message)}`
      }
    });
    status(`⚠️ ${clean(message)} ${final ? 'Seguindo para outro produto.' : 'Tentando novamente.'}`, 'warn');
    schedule(final ? 400 : 1400);
  }

  async function generateLink(run, item) {
    if (item.affiliateUrl) return toAchou(run, item);

    const attempts = Number(item.attempts?.link || 0);
    if (attempts >= MAX_ATTEMPTS) {
      await failLink(run, item, item.lastError || 'Limite de tentativas atingido.', attempts);
      return;
    }

    const button = matchButton(item);
    const nextAttempt = attempts + 1;
    if (!button) {
      await failLink(run, item, 'O card do produto não está mais visível nesta página.', nextAttempt);
      return;
    }

    state.copied = '';
    await patchRun(run, { status: 'running', stage: 'link', currentItemId: item.id });
    await patchItem(run, item, {
      stage: 'link-generating',
      attempts: { ...(item.attempts || {}), link: nextAttempt },
      reason: `Gerando link afiliado, tentativa ${nextAttempt}.`
    });

    try {
      status(`🔗 Gerando link afiliado: ${item.title.slice(0, 72)}...`);
      button.scrollIntoView({ block: 'center', behavior: 'auto' });
      await sleep(350);
      button.click();
      const link = await waitLink(item);
      if (!link) throw new Error('A Shopee não apresentou um link afiliado reconhecível.');

      const result = await patchItem(run, item, {
        stage: 'affiliate-ready',
        affiliateUrl: link,
        lastError: '',
        reason: 'Link afiliado capturado e confirmado.',
        event: { type: 'link', message: 'Link afiliado capturado e confirmado.' }
      });
      await toAchou(result.run, result.item);
    } catch (error) {
      await failLink(run, item, error.message, nextAttempt);
    }
  }

  function nextPageButton() {
    const candidates = [...document.querySelectorAll('button,a,[role="button"]')]
      .filter(element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true');
    return candidates.find(element => {
      const label = norm(`${labelOf(element)} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`);
      return label === 'proxima' || label === 'proximo' || label.includes('pagina seguinte') || label === 'next' || /^[›»>]$/.test(clean(element.textContent));
    }) || null;
  }

  async function exhausted(run) {
    const next = nextPageButton();
    if (next) {
      await patchRun(run, {
        status: 'running',
        stage: 'garimpo',
        currentItemId: '',
        event: { type: 'garimpo', message: 'Página atual concluída. Indo para a próxima página de produtos.' }
      });
      status('➡️ Página concluída. Abrindo a próxima página...', 'done');
      next.click();
      schedule(1800);
      return;
    }

    await patchRun(run, {
      status: 'paused',
      stage: 'paused',
      currentItemId: '',
      lastError: 'Os produtos visíveis terminaram antes da meta.',
      event: { type: 'paused', message: 'Os produtos visíveis terminaram antes da meta.' }
    });
    status('⏸️ Os produtos visíveis terminaram antes da meta. O Radar parou sem trocar de tela.', 'warn');
  }

  async function main() {
    if (state.busy) return;
    state.busy = true;
    try {
      installClipboard();
      let run = await getRun();
      if (!run) {
        status('Radar automático aguardando uma nova produção.', 'warn');
        return;
      }
      if (run.status === 'completed') {
        status(`🎉 Meta concluída: ${run.successCount}/${run.target}. O piloto automático está parado.`, 'done');
        return;
      }
      if (['cancelled', 'failed', 'paused'].includes(run.status)) {
        status(run.lastError || `Execução ${run.status}.`, run.status === 'paused' ? 'warn' : 'error');
        return;
      }
      if (run.stage === 'achou-levou') {
        open(ACHOU);
        return;
      }
      if (run.stage === 'garimpo' || !(run.items || []).length) run = await harvest(run);

      const items = pending(run);
      const item = items.find(entry => entry.id === run.currentItemId) || items.find(entry => entry.affiliateUrl) || items[0];
      if (!item) {
        await exhausted(run);
        return;
      }

      status(`🤖 Produção automática: ${run.successCount}/${run.target} salvas • ${run.failureCount} falha(s).`);
      await generateLink(run, item);
    } catch (error) {
      console.error('[RADAR-AUTOPILOT-CLEAN-V7]', error);
      status(`❌ ${clean(error.message || error)}`, 'error');
    } finally {
      state.busy = false;
    }
  }

  function schedule(delay = 500) {
    clearTimeout(state.timer);
    state.timer = setTimeout(main, delay);
  }

  window.addEventListener('pageshow', () => schedule(500));
  window.addEventListener('load', () => schedule(500));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(400);
  });
  setInterval(() => {
    if (!document.hidden && !state.busy) schedule(0);
  }, 5000);

  root.shopeeCleanAutopilot = {
    version: VERSION,
    automatic: true,
    reloadsPage: false,
    scrollsDuringHarvest: false,
    createsFakeProductLinks: false,
    verifiedSuccessOnly: true,
    sendsWhatsapp: false,
    start: main,
    endpoint: RUNS,
    loadedAt: Date.now()
  };

  schedule(700);
})();
