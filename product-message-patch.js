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