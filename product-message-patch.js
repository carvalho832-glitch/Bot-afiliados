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

  function contem(texto, lista) {
    return lista.some(item => texto.includes(item));
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

  function beneficioProduto(produto = '') {
    const nome = tituloCurto(produto);
    const p = limpar(produto).toLowerCase();

    if (contem(p, ['celular', 'smartphone', 'iphone', 'galaxy', 'samsung', 'motorola', 'xiaomi', 'redmi'])) {
      return 'Smartphone para fotos, vídeos, redes sociais, aplicativos e uso diário.';
    }

    if (contem(p, ['televisão', 'televisao', 'smart tv', 'tv ', ' tv', 'led', 'oled', 'qled', '4k'])) {
      return 'Televisão para assistir filmes, séries, jogos e conteúdos com mais conforto.';
    }

    if (contem(p, ['notebook', 'laptop', 'tablet', 'monitor', 'computador', 'pc gamer'])) {
      return 'Produto para estudos, trabalho, navegação e tarefas do dia a dia.';
    }

    if (contem(p, ['fone', 'headset', 'bluetooth', 'caixa de som', 'soundbar'])) {
      return 'Produto para ouvir músicas, vídeos e chamadas com mais praticidade.';
    }

    if (contem(p, ['smartwatch', 'relógio', 'relogio', 'pulseira inteligente'])) {
      return 'Acessório para acompanhar horários, notificações e atividades na rotina.';
    }

    if (contem(p, ['air fryer', 'fritadeira'])) {
      return 'Air fryer para preparar refeições e lanches com mais praticidade na cozinha.';
    }

    if (contem(p, ['cafeteira', 'café', 'cafe', 'espresso'])) {
      return 'Produto para preparar café com mais praticidade e sabor na rotina.';
    }

    if (contem(p, ['liquidificador', 'batedeira', 'mixer', 'processador', 'panela', 'grill', 'micro-ondas', 'microondas'])) {
      return 'Produto para facilitar o preparo de receitas, refeições e bebidas no dia a dia.';
    }

    if (contem(p, ['lavitan', 'centrum', 'multivitamínico', 'multivitaminico', 'multi vitamina', 'vitamina', 'suplemento', 'omega', 'ômega', 'creatina', 'whey', 'colágeno', 'colageno', 'magnésio', 'magnesio'])) {
      return 'Suplemento para complementar nutrientes da rotina diária, conforme orientação do fabricante.';
    }

    if (contem(p, ['tênis', 'tenis', 'sapato', 'sandália', 'sandalia', 'chinelo', 'bota'])) {
      return 'Calçado para usar no dia a dia, passeio ou trabalho com mais conforto.';
    }

    if (contem(p, ['blusa', 'camiseta', 'camisa', 'calça', 'calca', 'vestido', 'short', 'jaqueta', 'tricô', 'tricot', 'moletom'])) {
      return 'Peça para montar looks do dia a dia com conforto, praticidade e estilo.';
    }

    if (contem(p, ['bolsa', 'mochila', 'pochete', 'necessaire', 'mala'])) {
      return 'Produto para carregar e organizar seus itens com mais praticidade na rotina.';
    }

    if (contem(p, ['toalha', 'lençol', 'lencol', 'edredom', 'cobertor', 'travesseiro', 'cortina', 'tapete'])) {
      return 'Item para deixar a casa mais confortável, organizada e aconchegante.';
    }

    if (contem(p, ['brinquedo', 'boneca', 'carrinho', 'lego', 'hot wheels', 'infantil', 'patrulha canina'])) {
      return 'Opção divertida para crianças brincarem e também uma boa ideia de presente.';
    }

    if (contem(p, ['furadeira', 'parafusadeira', 'ferramenta', 'kit reparo', 'zíper', 'ziper', 'cola', 'adesivo'])) {
      return 'Produto útil para reparos, montagem e soluções práticas no dia a dia.';
    }

    if (contem(p, ['perfume', 'creme', 'hidratante', 'shampoo', 'protetor solar', 'maquiagem', 'escova'])) {
      return 'Produto para cuidado pessoal, beleza e praticidade na rotina diária.';
    }

    return `${nome} é uma opção prática para quem busca utilidade, economia e facilidade no dia a dia.`;
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
    linhas.push(`✅ ${beneficioProduto(produto)}`);
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