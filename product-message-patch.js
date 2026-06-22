window.addEventListener('load', function () {
  const inputLink = document.getElementById('input-link');
  const selectLoja = document.getElementById('select-loja');
  const displayProduto = document.getElementById('display-produto');
  const displayDe = document.getElementById('display-de');
  const displayPor = document.getElementById('display-por');
  const displayCupom = document.getElementById('display-cupom');
  const messageBox = document.getElementById('msg-preview');
  const btnGerar = document.getElementById('btn-gerar');

  if (!inputLink || !displayProduto || !messageBox || !btnGerar) return;

  function limpar(valor = '') { return String(valor || '').replace(/\s+/g, ' ').trim(); }
  function tituloCurto(produto = '') {
    return limpar(produto || 'Oferta especial')
      .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
      .replace(/\|\s?Mercado\s?Livre/gi, '')
      .replace(/- Mercado Livre/gi, '')
      .replace(/\|\s?Shopee Brasil/gi, '')
      .split(' ')
      .slice(0, 12)
      .join(' ');
  }
  function extrairLink(texto = '') { return String(texto || '').match(/https?:\/\/[^\s]+/)?.[0] || limpar(texto); }
  function moedaNumero(valor = '') { return parseFloat(String(valor || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0; }
  function temValor(valor = '') {
    const v = limpar(valor);
    return v && v !== 'R$ 0,00' && v !== '0' && v.toLowerCase() !== 'não informado';
  }
  function calcularDesconto(de, por) {
    const valorDe = moedaNumero(de);
    const valorPor = moedaNumero(por);
    if (valorDe > valorPor && valorPor > 0) return `${Math.floor(((valorDe - valorPor) / valorDe) * 100)}% OFF`;
    return '';
  }
  function detectarLoja(link = '') {
    const escolha = selectLoja?.value || 'auto';
    if (escolha !== 'auto') return escolha;
    const l = String(link).toLowerCase();
    if (l.includes('shopee') || l.includes('shp.ee') || l.includes('collshp')) return 'Shopee';
    if (l.includes('mercadolivre') || l.includes('mercado livre') || l.includes('meli.la')) return 'Mercado Livre';
    if (l.includes('amazon') || l.includes('amzn.to')) return 'Amazon';
    return 'Loja oficial';
  }

  btnGerar.onclick = function () {
    const produto = limpar(displayProduto.value || 'Oferta especial');
    const link = extrairLink(inputLink.value || '');
    const precoDe = displayDe?.value || '';
    const precoPor = displayPor?.value || '';
    const cupom = displayCupom?.value?.trim() || '';
    const desconto = calcularDesconto(precoDe, precoPor);
    const loja = detectarLoja(link);
    const cupomEhFrete = /frete|gr[aá]tis/i.test(cupom);

    if (!produto || produto === 'Buscando...') return alert('Puxe os dados primeiro ou preencha o produto manualmente!');
    if (!link) return alert('Cole o link de afiliado antes de gerar a mensagem.');

    const linhas = [];
    linhas.push(`🔥 *${tituloCurto(produto)}!*`);
    linhas.push('');
    if (temValor(precoDe)) linhas.push(`❌ De: ~${precoDe}~`);
    linhas.push(`💰 *POR APENAS: ${temValor(precoPor) ? precoPor : 'Confira no site'}*`);
    if (temValor(desconto)) linhas.push(`🔥 *${desconto}!*`);
    if (temValor(cupom)) linhas.push(cupomEhFrete ? `🚚 *Frete grátis:* ${cupom}` : `🎫 *Cupom:* ${cupom}`);
    linhas.push('');
    linhas.push('🔒 *Compre com segurança no site oficial:');
    linhas.push(`🛒 *Link ${loja}:* ${link}`);

    const mensagem = linhas.join('\n');
    window.__ultimaMensagemAchouLevou = mensagem;
    messageBox.innerText = mensagem;
  };
});

window.addEventListener('load', function () {
  const STORAGE_OFERTAS = 'ofertas_achou_levou';
  const lista = document.getElementById('lista-salvas');
  const botaoTodas = document.getElementById('btn-enviar-todas-robo');
  if (!lista) return;

  let holdTimer = null;
  let drag = null;

  const style = document.createElement('style');
  style.textContent = `
    .saved-index{touch-action:none;user-select:none;cursor:grab;position:relative}.saved-index::after{content:'↕';font-size:10px;margin-left:4px;opacity:.75}.saved-card.map-dragging{position:fixed!important;z-index:999998!important;pointer-events:none!important;box-shadow:0 22px 55px rgba(0,0,0,.55)!important;outline:2px solid rgba(45,212,191,.9)!important;transform:scale(.985);opacity:.98}.map-placeholder{border:2px dashed rgba(45,212,191,.75);border-radius:24px;background:rgba(45,212,191,.08);margin:10px 0}.reorder-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:999999;background:rgba(15,23,42,.96);border:1px solid rgba(45,212,191,.45);border-radius:999px;color:#e6edf3;font-size:12px;font-weight:900;padding:10px 14px;box-shadow:0 12px 32px rgba(0,0,0,.35);pointer-events:none;text-align:center;max-width:92vw}`;
  document.head.appendChild(style);

  function toast(texto) {
    let t = document.querySelector('.reorder-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'reorder-toast';
      document.body.appendChild(t);
    }
    t.textContent = texto;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.remove(), 1600);
  }

  function cards() { return Array.from(lista.querySelectorAll('.saved-card')); }
  function textoDoCard(card) { return card.querySelector('pre')?.textContent?.trim() || ''; }
  function renumerar() {
    cards().forEach((card, index) => {
      const idx = card.querySelector('.saved-index');
      if (idx) idx.textContent = String(index + 1).padStart(2, '0');
    });
  }
  function lerLocalStorage() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_OFERTAS) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }
  function salvarOrdemAtual() {
    const textos = cards().map(textoDoCard).filter(Boolean);
    const antigos = lerLocalStorage();
    const mapa = new Map();
    antigos.forEach(item => {
      const texto = typeof item === 'string' ? item : (item.texto || item.mensagem || item.message || item.text || '');
      if (!texto) return;
      if (!mapa.has(texto)) mapa.set(texto, []);
      mapa.get(texto).push(item);
    });
    const novos = textos.map((texto, index) => {
      const listaItens = mapa.get(texto) || [];
      const item = listaItens.shift();
      if (item && typeof item === 'object') return { ...item, texto, ordem: index + 1 };
      return { id: Date.now() + index, texto, criadoEm: new Date().toISOString(), ordem: index + 1 };
    });
    localStorage.setItem(STORAGE_OFERTAS, JSON.stringify(novos));
    renumerar();
  }

  function positionCard(clientY) {
    if (!drag) return;
    const top = clientY - drag.offsetY;
    drag.card.style.top = `${top}px`;

    const viewportH = window.innerHeight;
    if (clientY < 90) window.scrollBy(0, -12);
    if (clientY > viewportH - 90) window.scrollBy(0, 12);

    const sortable = cards().filter(card => card !== drag.card);
    let inserted = false;
    for (const card of sortable) {
      const rect = card.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        lista.insertBefore(drag.placeholder, card);
        inserted = true;
        break;
      }
    }
    if (!inserted) lista.appendChild(drag.placeholder);
    renumerar();
  }

  function startDrag(card, event) {
    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'map-placeholder';
    placeholder.style.height = `${rect.height}px`;
    lista.insertBefore(placeholder, card);

    drag = {
      card,
      placeholder,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      left: rect.left,
      pointerId: event.pointerId
    };

    card.classList.add('map-dragging');
    card.style.width = `${rect.width}px`;
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    document.body.style.userSelect = 'none';
    toast('🔓 Arraste a oferta para cima ou para baixo.');
    positionCard(event.clientY);
  }

  function finishDrag() {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (!drag) return;

    const { card, placeholder } = drag;
    lista.insertBefore(card, placeholder);
    placeholder.remove();
    card.classList.remove('map-dragging');
    card.style.width = '';
    card.style.left = '';
    card.style.top = '';
    document.body.style.userSelect = '';
    drag = null;
    salvarOrdemAtual();
    toast('✅ Ordem salva. Enviar todas seguirá essa sequência.');
  }

  lista.addEventListener('pointerdown', function (event) {
    const handle = event.target.closest('.saved-index');
    if (!handle) return;
    const card = handle.closest('.saved-card');
    if (!card) return;

    event.preventDefault();
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => startDrag(card, event), 450);
  }, { passive: false });

  window.addEventListener('pointermove', function (event) {
    if (!drag) return;
    event.preventDefault();
    positionCard(event.clientY);
  }, { passive: false });

  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', finishDrag);

  if (botaoTodas) {
    botaoTodas.addEventListener('click', async function (event) {
      const mensagens = cards().map(textoDoCard).filter(Boolean);
      if (!mensagens.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      salvarOrdemAtual();
      try {
        if (!window.AchouLevouBotQueue?.sendMessages) throw new Error('Integração do robô ainda não carregou.');
        botaoTodas.disabled = true;
        botaoTodas.innerText = 'Enviando na ordem...';
        const json = await window.AchouLevouBotQueue.sendMessages(mensagens);
        const adicionadas = json?.added ?? mensagens.length;
        botaoTodas.innerText = `✅ Enviado (${adicionadas})`;
        alert(`Oferta(s) enviada(s) na ordem escolhida: ${adicionadas}`);
        setTimeout(() => { botaoTodas.innerText = '🚀 Enviar todas ao robô'; }, 1800);
      } catch (error) {
        alert(`Erro ao enviar para o robô: ${error.message}`);
        botaoTodas.innerText = '🚀 Enviar todas ao robô';
      } finally {
        botaoTodas.disabled = false;
      }
    }, true);
  }

  const observer = new MutationObserver(renumerar);
  observer.observe(lista, { childList: true });
  renumerar();
});