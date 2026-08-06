(() => {
  'use strict';

  const VERSION = '8.0.0';
  const API = 'https://bot-afiliados-1fwi.onrender.com';
  const RUNS = `${API}/phase24/autopilot/runs`;
  const ACHOU = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/achou-levou-direct-v11.html?v=1&safe=1';
  const CORE_URL = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-shopee-autopilot-clean-v7.js?v=2';
  const CAPTURE_INPUT_ID = 'radar-affiliate-link-capture-v8';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.shopeeLinkBridgeVersion === VERSION) return;
  root.shopeeLinkBridgeVersion = VERSION;

  const state = {
    captured: '',
    sending: false,
    originalClipboardWrite: null,
    originalExecCommand: null,
    originalElementClick: null,
    timer: 0
  };

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const strip = value => clean(value)
    .replace(/^[\s"'(<\[]+/, '')
    .replace(/[\s"')>\],.;:]+$/, '');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function labelOf(element) {
    return clean(
      element?.innerText || element?.textContent || element?.value ||
      element?.getAttribute?.('aria-label') || element?.getAttribute?.('title')
    );
  }

  function status(message, kind = 'work') {
    let box = document.getElementById('radar-autopilot-link-v8-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'radar-autopilot-link-v8-status';
      document.documentElement.appendChild(box);
    }
    const palette = kind === 'error'
      ? 'background:#7f1d1dee;color:#fee2e2;border:1px solid #fb7185'
      : kind === 'done'
        ? 'background:#064e3bee;color:#d1fae5;border:1px solid #34d399'
        : kind === 'warn'
          ? 'background:#78350fee;color:#ffedd5;border:1px solid #fb923c'
          : 'background:#312e81ee;color:#eef2ff;border:1px solid #818cf8';
    box.style.cssText = `position:fixed;left:12px;right:12px;bottom:178px;z-index:2147483647;padding:12px 15px;border-radius:15px;font:800 13px/1.4 system-ui;text-align:center;box-shadow:0 12px 36px #0009;${palette}`;
    box.textContent = message;
  }

  function urls(value) {
    return [...String(value || '').matchAll(/https?:\/\/[^\s"'<>]+/gi)]
      .map(match => strip(match[0]));
  }

  function isAffiliate(value) {
    try {
      const candidate = strip(value);
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (['s.shopee.com.br', 'shope.ee', 'br.shp.ee', 'shp.ee', 'collshp.com'].includes(host)) return true;
      if (!/(^|\.)shopee\.com\.br$/i.test(host)) return false;
      const tracking = `${url.pathname}?${url.search}`;
      return /affiliate|uls_trackid|share_channel|an_[a-z0-9]|utm_campaign|smtt=|af_siteid|sub[_-]?id|tracking|click_id/i.test(tracking);
    } catch {
      return false;
    }
  }

  function captureInput() {
    let input = document.getElementById(CAPTURE_INPUT_ID);
    if (!input) {
      input = document.createElement('input');
      input.id = CAPTURE_INPUT_ID;
      input.type = 'text';
      input.setAttribute('aria-hidden', 'true');
      input.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:1px;height:1px;opacity:.001;pointer-events:none';
      document.documentElement.appendChild(input);
    }
    return input;
  }

  async function request(url, options = {}, timeout = 30000) {
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
    } finally {
      clearTimeout(timer);
    }
  }

  async function sendCapturedLink(link) {
    if (state.sending || !isAffiliate(link)) return;
    state.sending = true;
    state.captured = strip(link);
    captureInput().value = state.captured;
    status('✅ Link afiliado detectado. Confirmando no lote automático...', 'done');

    try {
      const current = await request(`${RUNS}?active=1&t=${Date.now()}`, {}, 25000);
      const run = current.run;
      if (!run || ['completed', 'cancelled', 'failed', 'paused'].includes(run.status)) return;

      const items = Array.isArray(run.items) ? run.items : [];
      const item = items.find(entry => entry.id === run.currentItemId) ||
        items.find(entry => entry.decision === 'approved' && entry.stage === 'link-generating') ||
        items.find(entry => entry.decision === 'approved' && !entry.affiliateUrl && !/^failed-/.test(entry.stage));
      if (!item) throw new Error('Nenhum produto aguardando link foi encontrado.');

      const itemResult = await request(`${RUNS}/${encodeURIComponent(run.id)}/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'affiliate-ready',
          affiliateUrl: state.captured,
          lastError: '',
          reason: 'Link afiliado capturado pela ponte robusta V8.',
          event: { type: 'link', message: 'Link afiliado capturado e confirmado pela ponte V8.' }
        })
      });

      await request(`${RUNS}/${encodeURIComponent(run.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'running',
          stage: 'achou-levou',
          currentItemId: itemResult.item?.id || item.id,
          lastError: '',
          event: {
            type: 'navigation',
            itemId: itemResult.item?.id || item.id,
            message: 'Link confirmado. Abrindo o Achou Levou para gerar e salvar a oferta.'
          }
        })
      });

      status('✅ Link confirmado. Abrindo o Achou Levou...', 'done');
      await sleep(450);
      if (typeof window.RadarNative?.openUrl === 'function') window.RadarNative.openUrl(ACHOU);
      else location.assign(ACHOU);
    } catch (error) {
      console.error('[RADAR-LINK-BRIDGE-V8]', error);
      status(`⚠️ O link apareceu, mas não foi confirmado: ${clean(error.message || error)}`, 'warn');
      state.sending = false;
    }
  }

  function consider(value) {
    for (const candidate of urls(value)) {
      if (!isAffiliate(candidate)) continue;
      sendCapturedLink(candidate);
      return candidate;
    }
    const direct = strip(value);
    if (isAffiliate(direct)) {
      sendCapturedLink(direct);
      return direct;
    }
    return '';
  }

  function scanRoot(rootNode) {
    if (!rootNode?.querySelectorAll || state.sending) return;
    const selector = 'input,textarea,a,[href],[value],[data-url],[data-link],[data-copy],[data-clipboard-text],[data-short-link],[data-tracking-url]';
    for (const element of rootNode.querySelectorAll(selector)) {
      const values = [
        element.value,
        element.href,
        element.textContent,
        element.getAttribute?.('href'),
        element.getAttribute?.('value'),
        element.getAttribute?.('data-url'),
        element.getAttribute?.('data-link'),
        element.getAttribute?.('data-copy'),
        element.getAttribute?.('data-clipboard-text'),
        element.getAttribute?.('data-short-link'),
        element.getAttribute?.('data-tracking-url')
      ];
      for (const value of values) {
        if (consider(value)) return;
      }
      if (element.shadowRoot) scanRoot(element.shadowRoot);
    }

    const dialogs = rootNode.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="Modal"],[class*="dialog"],[class*="Dialog"],[class*="popup"],[class*="Popup"]');
    for (const dialog of dialogs) {
      if (consider(dialog.innerText || dialog.textContent)) return;
      if (dialog.shadowRoot) scanRoot(dialog.shadowRoot);
    }
  }

  function installClipboardHooks() {
    document.addEventListener('copy', event => {
      try {
        consider(event.clipboardData?.getData('text/plain'));
        consider(window.getSelection?.().toString());
        consider(document.activeElement?.value);
      } catch {}
    }, true);

    try {
      const clipboard = navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function' && !clipboard.__radarV8) {
        state.originalClipboardWrite = clipboard.writeText.bind(clipboard);
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: async text => {
            consider(text);
            return state.originalClipboardWrite(text);
          }
        });
        clipboard.__radarV8 = true;
      }
    } catch {}

    try {
      if (typeof document.execCommand === 'function') {
        state.originalExecCommand = document.execCommand.bind(document);
        document.execCommand = function radarExecCommand(command, ...args) {
          if (/copy/i.test(String(command))) {
            try {
              consider(window.getSelection?.().toString());
              consider(document.activeElement?.value);
            } catch {}
          }
          return state.originalExecCommand(command, ...args);
        };
      }
    } catch {}
  }

  function dispatchRealisticSequence(element) {
    if (!element?.dispatchEvent) return;
    const rect = element.getBoundingClientRect?.() || { left: 0, top: 0, width: 1, height: 1 };
    const clientX = rect.left + Math.max(1, rect.width / 2);
    const clientY = rect.top + Math.max(1, rect.height / 2);
    const pointerOptions = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX, clientY };
    const mouseOptions = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, clientX, clientY, view: window };

    for (const type of ['pointerover', 'pointerenter', 'pointerdown']) {
      try { element.dispatchEvent(new PointerEvent(type, pointerOptions)); } catch {}
    }
    for (const type of ['mouseover', 'mouseenter', 'mousedown']) {
      try { element.dispatchEvent(new MouseEvent(type, mouseOptions)); } catch {}
    }
    try { element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, composed: true })); } catch {}
    try { element.focus?.({ preventScroll: true }); } catch {}
    try { element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, composed: true })); } catch {}
    for (const type of ['pointerup', 'mouseup']) {
      try {
        const EventClass = type.startsWith('pointer') ? PointerEvent : MouseEvent;
        element.dispatchEvent(new EventClass(type, type.startsWith('pointer') ? pointerOptions : mouseOptions));
      } catch {}
    }
  }

  function installClickBridge() {
    try {
      const prototype = HTMLElement.prototype;
      if (prototype.__radarV8Click) return;
      state.originalElementClick = prototype.click;
      prototype.click = function radarV8Click(...args) {
        const label = labelOf(this);
        if (/obter\s*link|copiar(?:\s+link)?/i.test(label)) {
          dispatchRealisticSequence(this);
          setTimeout(() => scanRoot(document), 80);
          setTimeout(() => scanRoot(document), 450);
          setTimeout(() => scanRoot(document), 1200);
        }
        return state.originalElementClick.apply(this, args);
      };
      prototype.__radarV8Click = true;
    } catch {}
  }

  function loadCore() {
    if (document.getElementById('radar-shopee-clean-v7-core')) return;
    const script = document.createElement('script');
    script.id = 'radar-shopee-clean-v7-core';
    script.src = CORE_URL;
    script.async = false;
    script.onload = () => status('🔗 Leitor V7 carregado com captura de links V8.', 'done');
    script.onerror = () => status('❌ Não foi possível carregar o leitor de produtos.', 'error');
    (document.head || document.documentElement).appendChild(script);
  }

  function initialize() {
    captureInput();
    installClipboardHooks();
    installClickBridge();

    const observer = new MutationObserver(() => {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => scanRoot(document), 100);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'value', 'data-url', 'data-link', 'data-copy', 'data-clipboard-text', 'data-short-link', 'data-tracking-url']
    });

    setInterval(() => {
      if (!document.hidden && !state.sending) scanRoot(document);
    }, 500);

    root.shopeeLinkBridge = {
      version: VERSION,
      acceptsLongTrackedLinks: true,
      watchesClipboard: true,
      watchesShadowDom: true,
      realisticClickSequence: true,
      start: () => scanRoot(document),
      loadedAt: Date.now()
    };

    loadCore();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
