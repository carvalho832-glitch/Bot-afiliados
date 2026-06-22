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

  function limpar(valor = '') {
    return String(valor || '').replace(/\s+/g, ' ').trim();
  }

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

  function extrairLink(texto = '') {
    return String(texto || '').match(/https?:\/\/[^\s]+/)?.[0] || limpar(texto);
  }

  function moedaNumero(valor = '') {
    return parseFloat(String(valor || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  }

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
    linhas.push('🔒 *Compre com segurança no site oficial:*');
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

  let timer = null;
  let cardSelecionado = null;

  const style = document.createElement('style');
  style.textContent = `
    .saved-index{touch-action:manipulation;user-select:none;cursor:pointer;position:relative}.saved-index::after{content:'↕';font-size:10px;margin-left:4px;opacity:.75}.saved-card.reorder-source{outline:2px solid rgba(45,212,191,.9);box-shadow:0 0 0 4px rgba(45,212,191,.12),0 18px 44px rgba(0,0,0,.45)}.saved-card.reorder-target{outline:2px dashed rgba(251,191,36,.85)}.reorder-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:999999;background:rgba(15,23,42,.96);border:1px solid rgba(45,212,191,.45);border-radius:999px;color:#e6edf3;font-size:12px;font-weight:900;padding:10px 14px;box-shadow:0 12px 32px rgba(0,0,0,.35);pointer-events:none;text-align:center;max-width:92vw}`;
  document.head.appendChild(style);

  function cards() {
    return Array.from(lista.querySelectorAll('.saved-card'));
  }

  function toast(texto) {
    let t = document.querySelector('.reorder-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'reorder-toast';
      document.body.appendChild(t);
    }
    t.textContent = texto;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.remove(), 1900);
  }

  function limparSelecao() {
    cards().forEach(card => card.classList.remove('reorder-source', 'reorder-target'));
    cardSelecionado = null;
  }

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

  function textoDoCard(card) {
    return card.querySelector('pre')?.textContent?.trim() || '';
  }

  function salvarOrdemAtual() {
    const textos = cards().map(textoDoCard).filter(Boolean);
    const antigos = lerLocalStorage();
    const mapa = new Map();

    antigos.forEach((item) => {
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

  function selecionar(card) {
    limparSelecao();
    cardSelecionado = card;
    card.classList.add('reorder-source');
    toast('🔓 Oferta selecionada. Toque no número do card onde ela deve ficar.');
  }

  function moverPara(cardDestino) {
    if (!cardSelecionado || cardSelecionado === cardDestino) {
      limparSelecao();
      return;
    }

    const origemIndex = cards().indexOf(cardSelecionado);
    const destinoIndex = cards().indexOf(cardDestino);

    cardDestino.classList.add('reorder-target');

    if (origemIndex < destinoIndex) {
      lista.insertBefore(cardSelecionado, cardDestino.nextSibling);
    } else {
      lista.insertBefore(cardSelecionado, cardDestino);
    }

    salvarOrdemAtual();
    limparSelecao();
    toast('✅ Ordem salva. Enviar todas seguirá essa sequência.');
  }

  lista.addEventListener('pointerdown', function (event) {
    const handle = event.target.closest('.saved-index');
    if (!handle) return;
    const card = handle.closest('.saved-card');
    if (!card) return;

    timer = setTimeout(() => selecionar(card), 600);
  }, { passive: true });

  lista.addEventListener('pointerup', function (event) {
    clearTimeout(timer);
    const handle = event.target.closest('.saved-index');
    if (!handle) return;
    const card = handle.closest('.saved-card');
    if (!card) return;

    if (cardSelecionado && cardSelecionado !== card) {
      moverPara(card);
    }
  });

  lista.addEventListener('pointercancel', function () {
    clearTimeout(timer);
  });

  document.addEventListener('click', function (event) {
    if (!cardSelecionado) return;
    if (event.target.closest('.saved-index')) return;
    if (event.target.closest('.saved-card')) return;
    limparSelecao();
  });

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