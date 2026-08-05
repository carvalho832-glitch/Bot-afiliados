(() => {
  'use strict';

  const VERSION = '1.0.0';
  const API = 'https://bot-afiliados-1fwi.onrender.com';
  const BASE_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-shopee.js?v=5';
  const BUTTON_ID = 'radar-phase24-link-button';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};
  if (root.shopeeLinksVersion === VERSION) return;
  root.shopeeLinksVersion = VERSION;

  const state = {
    batch: null,
    busy: false,
    clipboardCandidate: '',
    firstConfirmation: true
  };

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function toast(message, kind = 'ok', duration = 7000) {
    document.getElementById('radar-phase24-toast')?.remove();
    const box = document.createElement('div');
    box.id = 'radar-phase24-toast';
    box.textContent = message;
    box.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:188px', 'transform:translateX(-50%)',
      'z-index:2147483647', 'max-width:calc(100% - 28px)', 'padding:12px 16px',
      'border-radius:14px', 'font:700 13px system-ui', 'text-align:center',
      kind === 'error'
        ? 'background:#7f1d1d;color:#fee2e2;border:1px solid #fb7185'
        : kind === 'warning'
          ? 'background:#78350f;color:#ffedd5;border:1px solid #fb923c'
          : 'background:#e6fff5;color:#052e21;border:1px solid #34d399',
      'box-shadow:0 12px 36px #0008'
    ].join(';');
    document.documentElement.appendChild(box);
    setTimeout(() => box.remove(), duration);
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${API}${path}`, {
        ...options,
        mode: 'cors',
        cache: 'no-store',
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
    } finally {
      clearTimeout(timer);
    }
  }

  function obtainButtons() {
    return [...document.querySelectorAll('button, [role="button"], a')]
      .filter(element => /obter\s*link/i.test(clean(element.innerText || element.textContent)));
  }

  function approvedItems() {
    return (state.batch?.items || []).filter(item => item.decision === 'approved');
  }

  function pendingItems() {
    return approvedItems().filter(item => !item.affiliateUrl);
  }

  function readyItems() {
    return approvedItems().filter(item => item.affiliateUrl);
  }

  async function loadBatch(showMessage = true) {
    const body = await request(`/phase24/batches?profile=julio&current=1&t=${Date.now()}`);
    state.batch = body.batch || null;
    if (!state.batch) {
      if (showMessage) toast('Nenhum lote da Fase 24B foi encontrado.', 'warning');
      updateButton();
      return null;
    }
    if (!approvedItems().length) {
      if (showMessage) toast('O lote ainda não possui produtos aprovados.', 'warning');
    } else if (!['approved', 'processing'].includes(state.batch.status)) {
      if (showMessage) toast('Confirme o lote no Painel antes de gerar links.', 'warning');
    } else if (showMessage) {
      toast(`Lote carregado: ${readyItems().length} link(s) pronto(s) e ${pendingItems().length} pendente(s).`);
    }
    updateButton();
    return state.batch;
  }

  function titleWords(value) {
    return normalize(value).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length >= 3).slice(0, 18);
  }

  function cardForButton(button) {
    let node = button;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const text = clean(node.innerText || node.textContent);
      if (text.length >= 25 && text.length <= 1800 && node.querySelectorAll?.('a[href]')?.length) return node;
    }
    return button.closest('[class*="card"], [class*="item"], li, article, section, div');
  }

  function scoreItem(item, button) {
    const card = cardForButton(button);
    if (!card) return -1;
    const cardText = normalize(card.innerText || card.textContent);
    const hrefs = [...card.querySelectorAll('a[href]')].map(anchor => anchor.href || '').join(' ');
    let score = titleWords(item.title).reduce((sum, word) => sum + (cardText.includes(word) ? 1 : 0), 0);
    if (item.sourceId && hrefs.includes(item.sourceId)) score += 30;
    if (normalize(item.title).slice(0, 34) && cardText.includes(normalize(item.title).slice(0, 34))) score += 15;
    return score;
  }

  function nextMatch() {
    const buttons = obtainButtons();
    for (const item of pendingItems()) {
      const ranked = buttons.map(button => ({ button, score: scoreItem(item, button) })).sort((a, b) => b.score - a.score);
      const minimum = Math.min(4, Math.max(2, titleWords(item.title).length / 3));
      if (ranked[0]?.score >= minimum) return { item, button: ranked[0].button };
    }
    return null;
  }

  function stripUrl(value) {
    return clean(value).replace(/^[\s"'(<\[]+/, '').replace(/[\s"')>\],.;:]+$/, '');
  }

  function urlsFrom(value) {
    return [...String(value || '').matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(match => stripUrl(match[0]));
  }

  function isAffiliateUrl(candidate, originalUrl = '') {
    let url;
    try { url = new URL(stripUrl(candidate)); } catch { return false; }
    const host = url.hostname.toLowerCase();
    if (['s.shopee.com.br', 'shope.ee', 'br.shp.ee', 'shp.ee'].includes(host)) return true;
    if (!host.endsWith('shopee.com.br') || stripUrl(candidate) === stripUrl(originalUrl)) return false;
    return /affiliate|uls_trackid|share_channel|an_[a-z0-9]|utm_campaign|smtt=|af_siteid/i.test(`${url.pathname}?${url.searchParams}`);
  }

  function scopes() {
    const dialogs = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="dialog"],[class*="popup"]')]
      .filter(element => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
    return dialogs.length ? dialogs : [document.body];
  }

  function collectCandidates(originalUrl) {
    const candidates = new Set(state.clipboardCandidate ? [state.clipboardCandidate] : []);
    for (const scope of scopes()) {
      for (const element of scope.querySelectorAll('input,textarea,a,[data-clipboard-text],[data-copy],[data-url],[value]')) {
        [element.value, element.href, element.textContent,
          element.getAttribute('data-clipboard-text'), element.getAttribute('data-copy'),
          element.getAttribute('data-url'), element.getAttribute('value')]
          .flatMap(urlsFrom).forEach(url => candidates.add(url));
      }
      urlsFrom(scope.innerText || scope.textContent).forEach(url => candidates.add(url));
    }
    return [...candidates].filter(url => isAffiliateUrl(url, originalUrl)).sort((a, b) => a.length - b.length);
  }

  function clickCopyButton() {
    const button = [...document.querySelectorAll('button,[role="button"],a')].find(element => {
      const label = normalize(element.innerText || element.textContent || element.getAttribute('aria-label'));
      return label.includes('copiar link') || label === 'copiar';
    });
    button?.click();
    return Boolean(button);
  }

  async function clipboardRead(originalUrl) {
    try {
      const value = await navigator.clipboard?.readText?.();
      return isAffiliateUrl(value, originalUrl) ? stripUrl(value) : '';
    } catch { return ''; }
  }

  async function waitForLink(originalUrl) {
    let copied = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const direct = collectCandidates(originalUrl)[0];
      if (direct) return direct;
      if (!copied && attempt >= 3) copied = clickCopyButton();
      if (copied && attempt >= 4) {
        const clipboard = await clipboardRead(originalUrl);
        if (clipboard) return clipboard;
      }
      await delay(500);
    }
    return '';
  }

  function captureClipboardWrites() {
    try {
      const clipboard = navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') {
        const original = clipboard.writeText.bind(clipboard);
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: async text => {
            if (isAffiliateUrl(text)) state.clipboardCandidate = stripUrl(text);
            return original(text);
          }
        });
      }
    } catch {}
  }

  async function patchItem(item, payload) {
    const body = await request(`/phase24/batches/${encodeURIComponent(state.batch.id)}/items/${encodeURIComponent(item.id)}`, {
      method: 'PATCH', body: JSON.stringify(payload)
    });
    state.batch = body.batch || state.batch;
  }

  async function markProcessing() {
    if (state.batch.status === 'processing') return;
    const body = await request(`/phase24/batches/${encodeURIComponent(state.batch.id)}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'processing' })
    });
    state.batch = body.batch || state.batch;
  }

  function closeDialog() {
    const button = [...document.querySelectorAll('button,[role="button"],[aria-label]')].find(element => {
      const label = normalize(element.innerText || element.textContent || element.getAttribute('aria-label'));
      return label === 'fechar' || label === 'close' || label === 'cancelar' || label.includes('fechar');
    });
    button?.click();
  }

  async function generateNext(button) {
    if (state.busy) return;
    state.busy = true;
    state.clipboardCandidate = '';
    button.disabled = true;
    try {
      if (!state.batch) await loadBatch(false);
      if (!state.batch) throw new Error('Nenhum lote aprovado foi encontrado.');
      if (!['approved', 'processing'].includes(state.batch.status)) throw new Error('Confirme o lote no Painel antes de gerar links.');
      if (!pendingItems().length) {
        toast(`✅ Todos os ${readyItems().length} links aprovados já estão prontos.`);
        return;
      }
      if (state.firstConfirmation) {
        const confirmed = confirm(
          `Gerar somente 1 link afiliado agora?\n\n` +
          `Pendentes: ${pendingItems().length}\n` +
          `Nenhuma oferta será enviada ao WhatsApp.`
        );
        if (!confirmed) return;
        state.firstConfirmation = false;
      }
      const match = nextMatch();
      if (!match) throw new Error('Nenhum aprovado foi localizado nos cartões visíveis. Volte à mesma página usada no garimpo.');
      const { item, button: obtainButton } = match;
      button.textContent = `⏳ ${clean(item.title).slice(0, 22)}...`;
      await markProcessing();
      await patchItem(item, { stage: 'link_generating', reason: 'Obter link acionado pela Fase 24B.2 supervisionada.' });
      obtainButton.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      await delay(350);
      obtainButton.click();
      toast(`🔗 Obter link acionado para: ${clean(item.title).slice(0, 65)}`);
      const affiliateUrl = await waitForLink(item.url);
      if (!affiliateUrl) {
        await patchItem(item, { stage: 'link_error', reason: 'O link afiliado não pôde ser confirmado na página da Shopee.' });
        throw new Error('O link não foi confirmado. O produto ficou disponível para nova tentativa.');
      }
      await patchItem(item, {
        stage: 'link_ready', affiliateUrl,
        reason: 'Link afiliado capturado e verificado na página da Shopee.'
      });
      closeDialog();
      toast(`✅ Link salvo. Prontos: ${readyItems().length}. Restam: ${pendingItems().length}.`, 'ok', 8500);
      root.phase24Links = {
        batchId: state.batch.id, ready: readyItems().length,
        remaining: pendingItems().length, lastItemId: item.id, updatedAt: Date.now()
      };
    } catch (error) {
      toast(`Fase 24B.2: ${error.message}`, 'error', 9000);
    } finally {
      state.busy = false;
      button.disabled = false;
      updateButton();
    }
  }

  function updateButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    if (!state.batch) button.textContent = '🔗 Carregar lote aprovado';
    else if (!approvedItems().length) button.textContent = '🔗 Nenhum aprovado';
    else if (!pendingItems().length) button.textContent = `✅ Links prontos (${readyItems().length})`;
    else button.textContent = `🔗 Gerar próximo link (${pendingItems().length})`;
  }

  function mountButton() {
    if (!document.body || document.getElementById(BUTTON_ID) || !obtainButtons().length) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = '🔗 Carregar lote aprovado';
    button.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:182px', 'z-index:2147483646',
      'border:1px solid #a5f3fcaa', 'border-radius:15px', 'padding:12px 15px',
      'background:linear-gradient(135deg,#047857,#16a34a)', 'color:#fff',
      'font:800 13px system-ui', 'box-shadow:0 12px 32px #0009', 'max-width:220px'
    ].join(';');
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.batch) {
        button.disabled = true;
        button.textContent = '⏳ Buscando aprovados...';
        try { await loadBatch(true); }
        catch (error) { toast(`Não foi possível carregar o lote: ${error.message}`, 'error'); }
        finally { button.disabled = false; updateButton(); }
      } else {
        generateNext(button);
      }
    });
    document.documentElement.appendChild(button);
  }

  function loadBaseModule() {
    if (root.shopeeVersion === '2.1.0' || document.querySelector(`script[src="${BASE_MODULE}"]`)) return;
    const script = document.createElement('script');
    script.src = BASE_MODULE;
    script.async = true;
    document.documentElement.appendChild(script);
  }

  captureClipboardWrites();
  loadBaseModule();
  mountButton();
  let timer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(mountButton, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  root.shopeeLinks = {
    version: VERSION,
    supervised: true,
    oneAtATime: true,
    autoLoop: false,
    whatsappAutoStart: false,
    loadBatch: () => loadBatch(true),
    loadedAt: Date.now()
  };
})();
