(() => {
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

  let ultimoToqueLink = 0;

  function limparCampoLinkAoTocar() {
    const agora = Date.now();
    if (!inputLink.value.trim()) return;
    if (agora - ultimoToqueLink < 500) return;

    ultimoToqueLink = agora;
    inputLink.value = '';
    inputLink.placeholder = 'Cole o novo link aqui...';
    inputLink.dispatchEvent(new Event('input', { bubbles: true }));
  }

  inputLink.addEventListener('click', limparCampoLinkAoTocar);
  inputLink.addEventListener('touchstart', limparCampoLinkAoTocar, { passive: true });

  function extrairLink(texto = '') {
    return String(texto).match(/https?:\/\/[^\s]+/)?.[0] || String(texto).trim();
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

  function moedaNumero(valor = '') {
    return parseFloat(String(valor).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  }

  function temValor(valor = '') {
    const v = String(valor || '').trim();
    return v && v !== 'R$ 0,00' && v !== '0' && v.toLowerCase() !== 'não informado';
  }

  function calcularDesconto(de, por) {
    const valorDe = moedaNumero(de);
    const valorPor = moedaNumero(por);
    if (valorDe > valorPor && valorPor > 0) return `${Math.floor(((valorDe - valorPor) / valorDe) * 100)}% OFF`;
    return '';
  }

  function limparTitulo(produto = '') {
    return String(produto || 'Oferta especial')
      .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
      .replace(/\|\s?Mercado\s?Livre/gi, '')
      .replace(/- Mercado Livre/gi, '')
      .replace(/\|\s?Shopee Brasil/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tituloDestaque(produto = '') {
    return limparTitulo(produto || 'Oferta especial').split(' ').slice(0, 12).join(' ');
  }

  function tem(texto, palavras) {
    return palavras.some(palavra => texto.includes(palavra));
  }

  function chamadaVendaCurta(produto = '') {
    const p = produto.toLowerCase();

    // Prioridade: primeiro identifica o produto principal. Ex: pochete com zíper NÃO é kit de reparo de zíper.
    if (tem(p, ['pochete', 'cintura tática', 'cintura tatica', 'bolsa de cintura'])) {
      return 'Olha que prática: pochete para carregar celular, carteira, chaves e pequenos itens com organização.';
    }

    if (tem(p, ['mochila'])) {
      return 'Achadinho para carregar seus itens com mais organização no trabalho, viagem ou dia a dia.';
    }

    if (tem(p, ['bolsa', 'necessaire'])) {
      return 'Achadinho para carregar e organizar seus itens pessoais com praticidade.';
    }

    const ehZiperReparo =
      tem(p, ['zíper', 'ziper', 'fecho', 'cursor']) &&
      tem(p, ['kit', 'reparo', 'conserto', 'sem costura', 'universal', 'instantâneo', 'instantaneo']);

    if (ehZiperReparo) {
      return 'Olha que prático: kit de zíper para reparar roupas, bolsas e mochilas sem complicação.';
    }

    if (tem(p, ['fita dupla face', 'cola instantânea', 'cola instantanea', 'adesivo reparo', 'reparo', 'conserto'])) {
      return 'Ótimo achadinho para pequenos reparos do dia a dia com mais praticidade.';
    }

    if (tem(p, ['multivitamina', 'multi vitamina', 'polivitaminico', 'polivitamínico', 'vitaminas e minerais', 'centrum', 'lavitan'])) return 'Achadinho para complementar vitaminas e minerais na rotina diária.';
    if (tem(p, ['vitamina c', 'acerola', 'camu'])) return 'Achadinho para complementar vitamina C na rotina do dia a dia.';
    if (tem(p, ['vitamina d', 'd3'])) return 'Achadinho para complementar vitamina D na rotina.';
    if (tem(p, ['b12', 'complexo b'])) return 'Achadinho para complementar vitaminas do complexo B.';
    if (tem(p, ['omega', 'ômega', 'epa', 'dha'])) return 'Achadinho para complementar ômega 3 na rotina.';
    if (tem(p, ['creatina'])) return 'Achadinho para complementar sua rotina de treinos.';
    if (tem(p, ['whey', 'proteina', 'proteína', 'albumina'])) return 'Achadinho para complementar proteína de forma prática.';
    if (tem(p, ['colageno', 'colágeno'])) return 'Achadinho para complementar a rotina de cuidados pessoais.';
    if (tem(p, ['magnesio', 'magnésio'])) return 'Achadinho para complementar magnésio na rotina diária.';
    if (tem(p, ['cafeina', 'cafeína', 'pre treino', 'pré treino'])) return 'Achadinho para incluir cafeína na rotina, conforme orientação do fabricante.';

    if (tem(p, ['carrinho elétrico', 'carrinho eletrico', 'brinquedo', 'boneca', 'lego', 'hot wheels', 'maral', 'infantil 6v'])) return 'Olha que legal: opção divertida para as crianças e ótima ideia de presente.';

    if (tem(p, ['smartwatch', 'relogio', 'relógio'])) return 'Achadinho para acompanhar horários, notificações e atividades no dia a dia.';
    if (tem(p, ['fone', 'headset', 'bluetooth'])) return 'Achadinho para ouvir músicas, vídeos e chamadas com praticidade.';
    if (tem(p, ['notebook', 'laptop', 'tablet'])) return 'Achadinho para estudos, trabalho e tarefas do dia a dia.';
    if (tem(p, ['celular', 'smartphone', 'iphone', 'galaxy', 'motorola'])) return 'Achadinho para fotos, vídeos, redes sociais, apps e uso diário.';

    if (tem(p, ['air fryer', 'fritadeira'])) return 'Achadinho para preparar refeições rápidas com mais praticidade.';
    if (tem(p, ['cafeteira', 'café', 'cafe'])) return 'Achadinho para preparar café com mais praticidade na rotina.';
    if (tem(p, ['liquidificador', 'batedeira', 'mixer'])) return 'Achadinho para preparar receitas e bebidas com mais facilidade.';

    if (tem(p, ['tenis', 'tênis', 'sapato', 'sandalia', 'sandália'])) return 'Achadinho para usar no dia a dia, passeio ou trabalho com conforto.';
    if (tem(p, ['blusa', 'camiseta', 'calça', 'calca', 'vestido', 'tricô', 'tricot'])) return 'Achadinho para compor looks do dia a dia com praticidade.';
    if (tem(p, ['toalha', 'lençol', 'lencol', 'cama', 'banho', 'edredom'])) return 'Achadinho para renovar a casa e deixar a rotina mais confortável.';

    return 'Achadinho selecionado para facilitar a rotina com praticidade e economia.';
  }

  function dadosDaTela() {
    const link = extrairLink(inputLink.value || '');
    const produto = limparTitulo(displayProduto.value || 'Oferta especial');
    const chamadaVenda = chamadaVendaCurta(produto);

    return {
      produto,
      precoDe: displayDe?.value || '',
      precoPor: displayPor?.value || '',
      desconto: calcularDesconto(displayDe?.value || '', displayPor?.value || ''),
      cupom: displayCupom?.value?.trim() || '',
      loja: detectarLoja(link),
      link,
      chamadaVenda
    };
  }

  function montarAnuncioVenda(dados) {
    const linhas = [];
    const cupomEhFrete = /frete|gr[aá]tis/i.test(dados.cupom || '');

    linhas.push(`🔥 *${tituloDestaque(dados.produto)}!*`);
    linhas.push(`✨ ${dados.chamadaVenda}`);
    linhas.push('');

    if (temValor(dados.precoDe)) linhas.push(`❌ De: ~${dados.precoDe}~`);
    linhas.push(`💰 *POR APENAS: ${temValor(dados.precoPor) ? dados.precoPor : 'Confira no site'}*`);
    if (temValor(dados.desconto)) linhas.push(`🔥 *${dados.desconto}!*`);
    if (temValor(dados.cupom)) linhas.push(cupomEhFrete ? `🚚 *Frete grátis:* ${dados.cupom}` : `🎫 *Cupom:* ${dados.cupom}`);

    linhas.push('');
    linhas.push('🔒 *Compre com segurança no site oficial:*');
    linhas.push(`🛒 *Link ${dados.loja}:* ${dados.link}`);

    return linhas.join('\n');
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
    if (!texto) return alert('Gere uma mensagem primeiro!');

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

  btnGerar.onclick = () => {
    if (!displayProduto.value || displayProduto.value === 'Buscando...') {
      alert('Puxe os dados primeiro ou preencha o produto manualmente!');
      return;
    }

    const dados = dadosDaTela();
    const textoOriginal = '🤖 Gerar mensagem com IA';

    if (!dados.link) {
      alert('Cole o link de afiliado antes de gerar a mensagem.');
      return;
    }

    btnGerar.disabled = true;
    btnGerar.innerText = '🤖 Criando anúncio...';

    const mensagem = montarAnuncioVenda(dados);
    setMensagem(mensagem);

    btnGerar.innerText = '✅ Mensagem gerada';
    setTimeout(() => {
      btnGerar.innerText = textoOriginal;
      btnGerar.disabled = false;
    }, 900);
  };

  if (btnCopiar) {
    btnCopiar.onclick = async () => {
      await copiar(getMensagemEditada() || window.__ultimaMensagemAchouLevou || '');
    };
  }
})();
