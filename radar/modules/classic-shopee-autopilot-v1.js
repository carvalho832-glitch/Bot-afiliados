(() => {
  'use strict';
  const VERSION = '1.0.1';
  const API = 'https://bot-afiliados-1fwi.onrender.com';
  const RUNS = `${API}/phase24/autopilot/runs`;
  const ACHOU = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/achou-levou-direct-v11.html?v=1&safe=1';
  const MAX_ATTEMPTS = 3;
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};
  if (root.shopeeAutopilotVersion === VERSION) return;
  root.shopeeAutopilotVersion = VERSION;

  const state = { busy: false, timer: 0, copied: '' };
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function status(message, kind = 'work') {
    let box = document.getElementById('radar-autopilot-shopee-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'radar-autopilot-shopee-status';
      box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:178px;z-index:2147483647;padding:12px 15px;border-radius:15px;font:800 13px/1.4 system-ui;text-align:center;box-shadow:0 12px 36px #0009;';
      document.documentElement.appendChild(box);
    }
    const color = kind === 'error' ? 'background:#7f1d1d;color:#fee2e2' : kind === 'done' ? 'background:#064e3b;color:#d1fae5' : kind === 'warn' ? 'background:#78350f;color:#ffedd5' : 'background:#082f49;color:#e0f2fe';
    box.style.cssText += `;${color}`;
    box.textContent = message;
  }

  async function request(url, options = {}, timeout = 35000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        mode: 'cors', cache: 'no-store', credentials: 'omit', signal: controller.signal,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
      });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A operação demorou demais para responder.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  const getRun = async () => (await request(`${RUNS}?active=1&t=${Date.now()}`, {}, 25000)).run || null;
  const patchRun = async (run, data) => (await request(`${RUNS}/${encodeURIComponent(run.id)}`, { method: 'PATCH', body: JSON.stringify(data) })).run;
  const patchItem = async (run, item, data) => request(`${RUNS}/${encodeURIComponent(run.id)}/items/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify(data) });
  const open = url => window.RadarNative?.openUrl ? window.RadarNative.openUrl(url) : location.assign(url);

  function buttons() {
    return [...document.querySelectorAll('button,[role="button"],a')]
      .filter(element => /obter\s*link/i.test(clean(element.innerText || element.textContent)));
  }

  function card(button) {
    let node = button;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      const text = clean(node.innerText || node.textContent);
      if (text.length >= 25 && text.length <= 2200 && (/R\$|vendas?|comiss/i.test(text) || node.querySelector?.('a[href]'))) return node;
    }
    return button.closest('[class*="card"],[class*="item"],li,article,section,div');
  }

  function number(value) {
    const match = clean(value).toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(mil|k|mi|m)?/);
    if (!match) return null;
    let result = Number(match[1].replace(/\./g, '').replace(',', '.'));
    if (match[2] === 'mil' || match[2] === 'k') result *= 1000;
    if (match[2] === 'mi' || match[2] === 'm') result *= 1000000;
    return Number.isFinite(result) ? result : null;
  }

  function products() {
    const seen = new Set();
    return buttons().map((button, position) => {
      const box = card(button);
      if (!box) return null;
      const anchors = [...box.querySelectorAll('a[href]')];
      const url = (anchors.find(a => /product|offer|item/i.test(a.href)) || anchors[0])?.href || '';
      const titleNode = [...box.querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="name"],a[href]')]
        .find(element => element !== button && !element.contains(button) && clean(element.getAttribute('title') || element.textContent).length >= 8);
      const title = clean(titleNode?.getAttribute('title') || titleNode?.textContent || clean(box.textContent).split(/R\$|vendid|comiss/i)[0]);
      if (!title || !url || seen.has(url)) return null;
      seen.add(url);
      const text = clean(box.innerText || box.textContent);
      const price = text.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
      const sold = text.match(/([\d.,]+\s*(?:mil|k|mi|m)?)\s*(?:vendid[oa]s?|vendas?)/i);
      const rating = norm(text).match(/(?:nota|avaliacao|rating)\s*[:\-]?\s*([0-5](?:[.,]\d)?)/i);
      return {
        sourceId: url.match(/(?:product|item|offer)[^\d]*(\d{4,})/i)?.[1] || '',
        position, title, url,
        image: box.querySelector('img')?.currentSrc || box.querySelector('img')?.src || '',
        priceText: price ? `R$ ${price[1]}` : '',
        priceValue: price ? Number(price[1].replace(/\./g, '').replace(',', '.')) : null,
        soldText: sold ? clean(sold[0]) : '', soldCount: sold ? number(sold[1]) : null,
        rating: rating ? Number(rating[1].replace(',', '.')) : null,
        stage: 'candidate'
      };
    }).filter(Boolean);
  }

  function approved(item, filters = {}) {
    const terms = clean(filters.keywords).toLowerCase().split(/[,;\n]+/).map(v => v.trim()).filter(Boolean);
    if (terms.length && !terms.some(term => item.title.toLowerCase().includes(term))) return false;
    if (filters.minPrice != null && (item.priceValue == null || item.priceValue < Number(filters.minPrice))) return false;
    if (filters.maxPrice != null && (item.priceValue == null || item.priceValue > Number(filters.maxPrice))) return false;
    if (Number(filters.minSold || 0) && (item.soldCount == null || item.soldCount < Number(filters.minSold))) return false;
    if (Number(filters.minRating || 0) && (item.rating == null || item.rating < Number(filters.minRating))) return false;
    return true;
  }

  async function harvest(run) {
    status(`🤖 Garimpando produtos para completar ${run.target} ofertas...`);
    let last = -1, stable = 0;
    for (let round = 0; round < 24; round += 1) {
      const count = buttons().length;
      stable = count === last ? stable + 1 : 0;
      last = count;
      if (count >= Math.min(300, run.target + Math.max(20, Math.ceil(run.target / 2))) || stable >= 4) break;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(1100);
    }
    window.scrollTo(0, 0);
    await sleep(500);
    const read = products();
    if (!read.length) throw new Error('Nenhum produto foi reconhecido na página de ofertas.');
    const items = read.map(item => ({ ...item, decision: approved(item, run.filters) ? 'approved' : 'rejected', reason: approved(item, run.filters) ? 'Passou pelos filtros automáticos.' : 'Reprovado pelos filtros automáticos.' }));
    return patchRun(run, {
      status: 'running', stage: 'link', startedAt: run.startedAt || new Date().toISOString(), sourceUrl: location.href, appendItems: items,
      event: { type: 'garimpo', message: `${items.filter(i => i.decision === 'approved').length} candidato(s) aprovados entre ${items.length} produtos lidos.` }
    });
  }

  const words = title => norm(title).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 3).slice(0, 20);
  function matchButton(item) {
    const list = buttons();
    if (list.length === 1) return list[0];
    const ranked = list.map(button => {
      const box = card(button);
      const text = norm(box?.textContent);
      const hrefs = [...(box?.querySelectorAll?.('a[href]') || [])].map(a => a.href).join(' ');
      let score = words(item.title).filter(word => text.includes(word)).length;
      if (item.sourceId && hrefs.includes(item.sourceId)) score += 30;
      return { button, score };
    }).sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 2 ? ranked[0].button : null;
  }

  const strip = value => clean(value).replace(/^[\s"'(<\[]+/, '').replace(/[\s"')>\],.;:]+$/, '');
  const urls = value => [...String(value || '').matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(match => strip(match[0]));
  function affiliate(value, original = '') {
    try {
      const url = new URL(strip(value));
      const host = url.hostname.toLowerCase();
      if (['s.shopee.com.br', 'shope.ee', 'br.shp.ee', 'shp.ee'].includes(host)) return true;
      return host.endsWith('shopee.com.br') && strip(value) !== strip(original) && /affiliate|uls_trackid|share_channel|utm_campaign|smtt=/i.test(`${url.pathname}?${url.search}`);
    } catch { return false; }
  }

  function candidates(original) {
    const values = new Set(state.copied ? [state.copied] : []);
    const scopes = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="dialog"],[class*="popup"]')];
    for (const scope of (scopes.length ? scopes : [document.body])) {
      for (const element of scope.querySelectorAll('input,textarea,a,[data-clipboard-text],[data-copy],[data-url]')) {
        [element.value, element.href, element.textContent, element.getAttribute('data-clipboard-text'), element.getAttribute('data-copy'), element.getAttribute('data-url')].flatMap(urls).forEach(url => values.add(url));
      }
      urls(scope.innerText || scope.textContent).forEach(url => values.add(url));
    }
    return [...values].filter(url => affiliate(url, original)).sort((a, b) => a.length - b.length);
  }

  function installClipboard() {
    try {
      if (!navigator.clipboard?.writeText || navigator.clipboard.__radarAuto) return;
      const original = navigator.clipboard.writeText.bind(navigator.clipboard);
      Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async text => { if (affiliate(text)) state.copied = strip(text); return original(text); } });
      navigator.clipboard.__radarAuto = true;
    } catch {}
  }

  async function waitLink(item, startUrl) {
    let copied = false;
    for (let round = 0; round < 46; round += 1) {
      const found = candidates(item.url)[0];
      if (found) return found;
      if (!copied && round >= 4) {
        const copy = [...document.querySelectorAll('button,[role="button"],a')].find(element => /copiar(\s+link)?/i.test(clean(element.textContent)));
        if (copy) { copy.click(); copied = true; }
      }
      if (copied) {
        try { const value = await navigator.clipboard.readText(); if (affiliate(value, item.url)) return strip(value); } catch {}
      }
      if (round >= 6 && location.href !== startUrl) return '';
      await sleep(500);
    }
    return '';
  }

  const pending = run => (run.items || []).filter(item => item.decision === 'approved' && item.stage !== 'saved-verified' && !/^failed-/.test(item.stage));
  async function toAchou(run, item) {
    await patchRun(run, { status: 'running', stage: 'achou-levou', currentItemId: item.id, event: { type: 'navigation', itemId: item.id, message: 'Link pronto. Indo puxar o produto e gerar a oferta no Achou Levou.' } });
    status(`✅ Link capturado. Abrindo o Achou Levou para salvar a oferta ${run.successCount + 1}/${run.target}...`, 'done');
    await sleep(500);
    open(ACHOU);
  }

  async function generateLink(run, item) {
    if (item.affiliateUrl) return toAchou(run, item);
    const attempts = Number(item.attempts?.link || 0);
    if (attempts >= MAX_ATTEMPTS) {
      await patchItem(run, item, { stage: 'failed-link', lastError: item.lastError || 'Limite de tentativas atingido.', event: { type: 'failure', message: 'Produto ignorado após falhas ao gerar o link.' } });
      return schedule(100);
    }
    const button = matchButton(item);
    if (!button) {
      await patchRun(run, { status: 'running', stage: 'link', currentItemId: item.id, event: { type: 'navigation', itemId: item.id, message: 'Abrindo o produto para localizar o botão Obter link.' } });
      await patchItem(run, item, { stage: 'link-opening', reason: 'Abrindo a página do produto para gerar o link.' });
      status(`🔎 Abrindo o produto: ${item.title.slice(0, 64)}...`);
      await sleep(400);
      return open(item.url);
    }
    const nextAttempt = attempts + 1;
    state.copied = '';
    await patchRun(run, { status: 'running', stage: 'link', currentItemId: item.id });
    await patchItem(run, item, { stage: 'link-generating', attempts: { ...(item.attempts || {}), link: nextAttempt }, reason: `Gerando link afiliado, tentativa ${nextAttempt}.` });
    try {
      status(`🔗 Gerando link afiliado: ${item.title.slice(0, 64)}...`);
      button.scrollIntoView({ block: 'center' });
      await sleep(350);
      const start = location.href;
      button.click();
      const link = await waitLink(item, start);
      if (!link) { if (location.href !== start) return; throw new Error('A Shopee não apresentou um link afiliado reconhecível.'); }
      const result = await patchItem(run, item, { stage: 'affiliate-ready', affiliateUrl: link, lastError: '', reason: 'Link afiliado capturado e confirmado.', event: { type: 'link', message: 'Link afiliado capturado e confirmado.' } });
      return toAchou(result.run, result.item);
    } catch (error) {
      const final = nextAttempt >= MAX_ATTEMPTS;
      await patchItem(run, item, { stage: final ? 'failed-link' : 'candidate', attempts: { ...(item.attempts || {}), link: nextAttempt }, lastError: clean(error.message), reason: final ? 'Produto ignorado após falhar ao gerar o link.' : 'O link será tentado novamente.', event: { type: final ? 'failure' : 'retry', message: `Link não gerado na tentativa ${nextAttempt}: ${clean(error.message)}` } });
      status(`⚠️ ${clean(error.message)} ${final ? 'Seguindo para outro produto.' : 'Tentando novamente.'}`, 'warn');
      return schedule(1200);
    }
  }

  async function exhausted(run) {
    const next = [...document.querySelectorAll('button,a,[role="button"]')].find(element => {
      const label = norm(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title'));
      return !element.disabled && (label === 'proxima' || label === 'proximo' || label.includes('pagina seguinte') || label === 'next');
    });
    if (next) {
      await patchRun(run, { stage: 'garimpo', currentItemId: '', event: { type: 'garimpo', message: 'Abrindo a próxima página para continuar.' } });
      next.click();
      return;
    }
    await patchRun(run, { status: 'paused', stage: 'paused', currentItemId: '', lastError: 'Os produtos disponíveis terminaram antes da meta.', event: { type: 'paused', message: 'Produtos disponíveis terminaram antes da meta.' } });
    status('⏸️ Os produtos disponíveis terminaram antes da meta. Abra outra página de ofertas para continuar.', 'warn');
  }

  async function main() {
    if (state.busy) return;
    state.busy = true;
    try {
      installClipboard();
      let run = await getRun();
      if (!run) return status('Radar automático aguardando uma nova produção.', 'warn');
      if (run.status === 'completed') return status(`🎉 Meta concluída: ${run.successCount}/${run.target}. O piloto automático está parado.`, 'done');
      if (['cancelled', 'failed', 'paused'].includes(run.status)) return status(run.lastError || `Execução ${run.status}.`, run.status === 'paused' ? 'warn' : 'error');
      if (run.stage === 'achou-levou') return open(ACHOU);
      if (run.stage === 'garimpo' || !(run.items || []).length) run = await harvest(run);
      const items = pending(run);
      const item = items.find(entry => entry.id === run.currentItemId) || items.find(entry => entry.affiliateUrl) || items[0];
      if (!item) return exhausted(run);
      status(`🤖 Produção automática: ${run.successCount}/${run.target} salvas • ${run.failureCount} falha(s).`);
      await generateLink(run, item);
    } catch (error) {
      console.error('[RADAR-AUTOPILOT-SHOPEE]', error);
      status(`❌ ${clean(error.message || error)}`, 'error');
    } finally { state.busy = false; }
  }

  function schedule(delay = 500) { clearTimeout(state.timer); state.timer = setTimeout(main, delay); }
  window.addEventListener('pageshow', () => schedule(200));
  window.addEventListener('load', () => schedule(200));
  window.addEventListener('popstate', () => schedule(200));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(150); });
  new MutationObserver(() => { if (!state.busy) schedule(450); }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden && !state.busy) schedule(0); }, 5000);
  root.shopeeAutopilot = { version: VERSION, automatic: true, verifiedSuccessOnly: true, sendsWhatsapp: false, start: main, endpoint: RUNS, loadedAt: Date.now() };
  schedule(0);
})();
