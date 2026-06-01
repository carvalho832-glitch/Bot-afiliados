(() => {
  const API_URL = 'https://bot-afiliados-1fwi.onrender.com';

  const inputLink = document.getElementById('input-link');
  const selectLoja = document.getElementById('select-loja');
  const displayProduto = document.getElementById('display-produto');
  const displayDe = document.getElementById('display-de');
  const displayPor = document.getElementById('display-por');
  const displayCupom = document.getElementById('display-cupom');
  const messageBox = document.getElementById('msg-preview');
  const btnGerar = document.getElementById('btn-gerar');
  const btnCopiar = document.getElementById('btn-copiar');

  if (!inputLink || !displayProduto || !messageBox || !btnGerar) return;

  function extrairLink(texto) {
    return texto.match(/https?:\/\/[^\s]+/)?.[0] || texto.trim();
  }

  function detectarLoja(link) {
    const escolha = selectLoja?.value || 'auto';
    if (escolha !== 'auto') return escolha;

    const l = (link || '').toLowerCase();

    if (l.includes('shopee') || l.includes('shp.ee') || l.includes('collshp')) return 'Shopee';
    if (l.includes('mercadolivre') || l.includes('mercado livre') || l.includes('meli.la')) return 'Mercado Livre';
    if (l.includes('amazon') || l.includes('amzn.to')) return 'Amazon';

    return 'Loja oficial';
  }

  function moedaNumero(valor) {
    return parseFloat((valor || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  }

  function calcularDesconto(de, por) {
    const valorDe = moedaNumero(de);
    const valorPor = moedaNumero(por);

    if (valorDe > valorPor && valorPor > 0) {
      return `${Math.floor(((valorDe - valorPor) / valorDe) * 100)}% OFF`;
    }

    return '';
  }

  function limparTitulo(produto) {
    return (produto || 'Oferta especial')
      .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
      .replace(/\|\s?Mercado\s?Livre/gi, '')
      .replace(/- Mercado Livre/gi, '')
      .replace(/\|\s?Shopee Brasil/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function chamarGemini(dados) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);

    try {
      const resposta = await fetch(`${API_URL}/gerar-mensagem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'Accept': 'application/json'
        },
        body: JSON.stringify(dados),
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors'
      });

      const json = await resposta.json();

      if (!resposta.ok || !json.ok || !json.mensagem) {
        throw new Error(json?.error || 'Não consegui gerar a mensagem com Gemini.');
      }

      return json.mensagem.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  function dadosDaTela() {
    const link = extrairLink(inputLink.value || '');

    return {
      produto: limparTitulo(displayProduto.value || 'Oferta especial'),
      precoDe: displayDe?.value || '',
      precoPor: displayPor?.value || '',
      desconto: calcularDesconto(displayDe?.value || '', displayPor?.value || ''),
      cupom: displayCupom?.value?.trim() || '',
      loja: detectarLoja(link),
      link
    };
  }

  function setMensagem(texto) {
    window.__ultimaMensagemAchouLevou = texto;
    messageBox.innerText = texto || 'Aguardando geração...';
  }

  function getMensagemEditada() {
    const texto = (messageBox.innerText || '').trim();
    return texto && texto !== 'Aguardando geração...' ? texto : '';
  }

  async function copiar(texto) {
    if (!texto) {
      alert('Gere uma mensagem primeiro!');
      return;
    }

    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const area = document.createElement('textarea');
      area.value = texto;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }

    alert('Copiado! ✅');
  }

  btnGerar.onclick = async () => {
    if (!displayProduto.value || displayProduto.value === 'Buscando...') {
      alert('Puxe os dados primeiro ou preencha o produto manualmente!');
      return;
    }

    const textoOriginal = '🤖 Gerar mensagem com IA';
    btnGerar.disabled = true;
    btnGerar.innerText = '🤖 IA criando...';
    messageBox.innerText = 'IA está criando a mensagem de venda...';

    try {
      const mensagem = await chamarGemini(dadosDaTela());
      setMensagem(mensagem);
      btnGerar.innerText = '✅ Mensagem gerada';
      setTimeout(() => btnGerar.innerText = textoOriginal, 1800);
    } catch (erro) {
      const textoErro = erro.name === 'AbortError'
        ? 'A IA demorou demais para responder. Tente novamente em alguns segundos.'
        : (erro.message || 'Erro ao gerar mensagem com IA.');

      window.__ultimaMensagemAchouLevou = '';
      messageBox.innerText = `Não consegui gerar com IA agora. Detalhe: ${textoErro}`;
      alert(textoErro);
      btnGerar.innerText = textoOriginal;
    } finally {
      btnGerar.disabled = false;
    }
  };

  if (btnCopiar) {
    btnCopiar.onclick = async () => {
      await copiar(getMensagemEditada() || window.__ultimaMensagemAchouLevou || '');
    };
  }
})();