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
    return parseFloat(
      String(valor || '')
        .replace(/[^\d,]/g, '')
        .replace(',', '.')
    ) || 0;
  }

  function temValor(valor = '') {
    const v = limpar(valor);
    return v && v !== 'R$ 0,00' && v !== '0' && v.toLowerCase() !== 'não informado';
  }

  function calcularDesconto(de, por) {
    const valorDe = moedaNumero(de);
    const valorPor = moedaNumero(por);

    if (valorDe > valorPor && valorPor > 0) {
      return `${Math.floor(((valorDe - valorPor) / valorDe) * 100)}% OFF`;
    }

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

    if (!produto || produto === 'Buscando...') {
      alert('Puxe os dados primeiro ou preencha o produto manualmente!');
      return;
    }

    if (!link) {
      alert('Cole o link de afiliado antes de gerar a mensagem.');
      return;
    }

    const linhas = [];

    linhas.push(`🔥 *${tituloCurto(produto)}!*`);
    linhas.push('');

    if (temValor(precoDe)) linhas.push(`❌ De: ~${precoDe}~`);

    linhas.push(`💰 *POR APENAS: ${temValor(precoPor) ? precoPor : 'Confira no site'}*`);

    if (temValor(desconto)) linhas.push(`🔥 *${desconto}!*`);

    if (temValor(cupom)) {
      linhas.push(
        cupomEhFrete
          ? `🚚 *Frete grátis:* ${cupom}`
          : `🎫 *Cupom:* ${cupom}`
      );
    }

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
  let cardAtivo = null;
  let emMovimento = false;

  const style = document.createElement('style');
  style.textContent = `
    .saved-index{touch-action:none;user-select:none;cursor:grab;position:relative}.saved-index::after{content:'↕';font-size:10px;margin-left:4px;opacity:.75}.saved-card.reorder-active{outline:2px solid rgba(45,212,191,.85);box-shadow:0 0 0 4px rgba(45,212,191,.12),0 18px 44px rgba(0,0,0,.45);transform:scale(.985);opacity:.96}.reorder-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:999999;background:rgba(15,23,42,.96);border:1px solid rgba(45,212,191,.45);border-radius:999px;color:#e6edf3;font-size:12px;font-weight:900;padding:10px 14px;box-shadow:0 12px 32px rgba(0,0,0,.35);pointer-events:none}`;
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
    t._timer = setTimeout(() => t.remove(), 1600);
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
    } catch {
      return [];
    }
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
      if (item && typeof item === 'object') {
        return { ...item, texto, ordem: index + 1 };
      }
      return { id: Date.now() + index, texto, criadoEm: new Date().toISOString(), ordem: index + 1 };
    });

    localStorage.setItem(STORAGE_OFERTAS, JSON.stringify(novos));
    renumerar();
  }

  function moverPorY(y) {
    if (!cardAtivo) return;
    const outros = cards().filter(card => card !== cardAtivo);
    const alvo = outros.find(card => {
      const rect = card.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });

    if (alvo) lista.insertBefore(cardAtivo, alvo);
    else lista.appendChild(cardAtivo);
    renumerar();
  }

  function iniciarMovimento(card) {
    cardAtivo = card;
    emMovimento = true;
    card.classList.add('reorder-active');
    toast('🔓 Movendo oferta. Arraste pelo número e solte para salvar.');
  }

  lista.addEventListener('pointerdown', function (event) {
    const handle = event.target.closest('.saved-index');
    if (!handle) return;
    const card = handle.closest('.saved-card');
    if (!card) return;

    timer = setTimeout(() => iniciarMovimento(card), 650);
  }, { passive: true });

  window.addEventListener('pointermove', function (event) {
    if (!emMovimento || !cardAtivo) return;
    event.preventDefault();
    moverPorY(event.clientY);
  }, { passive: false });

  window.addEventListener('pointerup', function () {
    clearTimeout(timer);
    timer = null;

    if (emMovimento && cardAtivo) {
      cardAtivo.classList.remove('reorder-active');
      salvarOrdemAtual();
      toast('✅ Nova ordem salva. Enviar todas seguirá esta sequência.');
    }

    cardAtivo = null;
    emMovimento = false;
  });

  window.addEventListener('pointercancel', function () {
    clearTimeout(timer);
    if (cardAtivo) cardAtivo.classList.remove('reorder-active');
    cardAtivo = null;
    emMovimento = false;
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