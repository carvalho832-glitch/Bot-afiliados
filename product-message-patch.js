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

  function buscar(texto, regex) {
    return limpar(String(texto || '').match(regex)?.[0] || '');
  }

  function detalheTecnico(produto = '') {
    const detalhes = [];
    const texto = limpar(produto);

    const armazenamento = buscar(texto, /\b\d+\s?(gb|tb)\b/i);
    const ram = buscar(texto, /\b\d+\s?gb\s?(ram)?\b/i);
    const tela = buscar(texto, /\b\d{2,3}\s?(polegadas|pol|\")\b/i);
    const litros = buscar(texto, /\b\d+([,.]\d+)?\s?(l|litros?)\b/i);
    const volume = buscar(texto, /\b\d+\s?(ml|g|kg)\b/i);
    const capsulas = buscar(texto, /\b\d+\s?(cápsulas|capsulas|comprimidos|unidades|unid)\b/i);
    const voltagem = buscar(texto, /\b(110v|127v|220v|bivolt)\b/i);
    const potencia = buscar(texto, /\b\d+\s?w\b/i);

    [armazenamento, tela, litros, volume, capsulas, voltagem, potencia].forEach(item => {
      if (item && !detalhes.includes(item)) detalhes.push(item);
    });

    return detalhes.slice(0, 3).join(', ');
  }

  function marcaDetectada(produto = '') {
    const p = limpar(produto).toLowerCase();
    if (p.includes('samsung')) return 'Samsung';
    if (p.includes('motorola')) return 'Motorola';
    if (p.includes('xiaomi') || p.includes('redmi')) return 'Xiaomi';
    if (p.includes('iphone') || p.includes('apple')) return 'Apple';
    if (p.includes('lg')) return 'LG';
    if (p.includes('philco')) return 'Philco';
    if (p.includes('mondial')) return 'Mondial';
    if (p.includes('britânia') || p.includes('britania')) return 'Britânia';
    if (p.includes('electrolux')) return 'Electrolux';
    if (p.includes('lavitan')) return 'Lavitan';
    if (p.includes('vhita')) return 'Vhita';
    if (p.includes('centrum')) return 'Centrum';
    return '';
  }

  function fraseDetalhe(prefixo, detalhe) {
    return detalhe ? `${prefixo} ${detalhe},` : prefixo;
  }

  function beneficioProduto(produto = '') {
    const nome = tituloCurto(produto);
    const p = limpar(produto).toLowerCase();
    const detalhe = detalheTecnico(produto);
    const marca = marcaDetectada(produto);

    if (contem(p, ['d3', 'k2', 'vitamina d3'])) {
      const caps = buscar(produto, /\b\d+\s?(cápsulas|capsulas|comprimidos)\b/i);
      const extra = caps ? ` em ${caps}` : '';
      return `Vitamina D3 + K2${extra} ajuda o corpo a aproveitar melhor o cálcio, contribuindo para ossos mais fortes, suporte muscular e bem-estar diário.`;
    }

    if (contem(p, ['celular', 'smartphone', 'iphone', 'galaxy', 'samsung', 'motorola', 'xiaomi', 'redmi'])) {
      const armazenamento = buscar(produto, /\b\d+\s?(gb|tb)\b/i);
      const modelo = marca ? `da ${marca}` : 'moderno';
      const comMemoria = armazenamento ? ` com ${armazenamento}` : '';
      return `Celular ${modelo}${comMemoria}, ótimo para fotos, vídeos, redes sociais, aplicativos e uso diário com praticidade.`;
    }

    if (contem(p, ['televisão', 'televisao', 'smart tv', 'tv ', ' tv', 'led', 'oled', 'qled', '4k'])) {
      const tela = buscar(produto, /\b\d{2,3}\s?(polegadas|pol|\")\b/i);
      const resolucao = p.includes('4k') ? ' 4K' : '';
      const info = tela ? ` de ${tela}${resolucao}` : resolucao;
      return `Smart TV${info} para assistir filmes, séries, jogos e conteúdos com mais conforto e qualidade de imagem.`;
    }

    if (contem(p, ['creme de cabelo', 'creme capilar', 'máscara capilar', 'mascara capilar', 'máscara de tratamento', 'mascara de tratamento', 'shampoo', 'condicionador', 'leave-in', 'leave in'])) {
      if (contem(p, ['hidratação', 'hidratacao', 'hidratante'])) return 'Creme capilar para ajudar na hidratação dos fios, deixando o cabelo com aparência mais macia, cuidada e bonita.';
      if (contem(p, ['cachos', 'cacheado', 'cacheados'])) return 'Creme capilar para ajudar na definição dos cachos, deixando os fios com mais forma, cuidado e movimento.';
      if (contem(p, ['antifrizz', 'frizz'])) return 'Creme capilar para ajudar a controlar o frizz e deixar os fios com aparência mais alinhada e bem cuidada.';
      if (contem(p, ['reconstrução', 'reconstrucao'])) return 'Máscara capilar para ajudar no cuidado dos fios danificados, deixando o cabelo com aparência mais forte e tratada.';
      return 'Produto capilar para cuidar dos fios no dia a dia, ajudando a deixar o cabelo com aparência mais bonita, macia e bem tratado.';
    }

    if (contem(p, ['notebook', 'laptop', 'tablet', 'monitor', 'computador', 'pc gamer'])) {
      const armazenamento = buscar(produto, /\b\d+\s?(gb|tb)\b/i);
      const info = armazenamento ? ` com ${armazenamento}` : '';
      return `Produto${info} para estudos, trabalho, navegação e tarefas do dia a dia com mais desempenho e praticidade.`;
    }

    if (contem(p, ['fone', 'headset', 'bluetooth', 'caixa de som', 'soundbar'])) {
      return 'Produto para ouvir músicas, vídeos e chamadas com mais praticidade, ideal para usar em casa, no trabalho ou no dia a dia.';
    }

    if (contem(p, ['smartwatch', 'relógio', 'relogio', 'pulseira inteligente'])) {
      return 'Smartwatch para acompanhar horários, notificações e atividades, deixando sua rotina mais prática e conectada.';
    }

    if (contem(p, ['air fryer', 'fritadeira'])) {
      const litros = buscar(produto, /\b\d+([,.]\d+)?\s?(l|litros?)\b/i);
      const info = litros ? ` de ${litros}` : '';
      return `Air fryer${info} para preparar refeições e lanches com mais praticidade, rapidez e menos bagunça na cozinha.`;
    }

    if (contem(p, ['cafeteira', 'café', 'cafe', 'espresso'])) {
      return 'Cafeteira para preparar café com mais praticidade e sabor, perfeita para deixar a rotina mais gostosa.';
    }

    if (contem(p, ['liquidificador', 'batedeira', 'mixer', 'processador', 'panela', 'grill', 'micro-ondas', 'microondas'])) {
      return 'Produto para facilitar o preparo de receitas, refeições e bebidas, economizando tempo na cozinha.';
    }

    if (contem(p, ['lavitan', 'centrum', 'multivitamínico', 'multivitaminico', 'multi vitamina', 'vitamina', 'suplemento', 'omega', 'ômega', 'creatina', 'whey', 'colágeno', 'colageno', 'magnésio', 'magnesio'])) {
      if (contem(p, ['omega', 'ômega'])) return 'Ômega 3 em cápsulas para complementar a rotina de cuidados diários e apoiar o bem-estar, conforme orientação do fabricante.';
      if (contem(p, ['creatina'])) return 'Creatina para complementar a rotina de treinos, ajudando quem busca mais praticidade na suplementação diária.';
      if (contem(p, ['whey', 'proteína', 'proteina'])) return 'Whey protein para complementar a ingestão de proteínas de forma prática no dia a dia.';
      if (contem(p, ['colágeno', 'colageno'])) return 'Colágeno para complementar a rotina de cuidados pessoais, conforme orientação do fabricante.';
      return 'Suplemento para complementar nutrientes importantes da rotina diária, apoiando o bem-estar com praticidade.';
    }

    if (contem(p, ['tênis', 'tenis', 'sapato', 'sandália', 'sandalia', 'chinelo', 'bota'])) {
      return 'Calçado para usar no dia a dia, passeio ou trabalho, unindo conforto, praticidade e estilo.';
    }

    if (contem(p, ['blusa', 'camiseta', 'camisa', 'calça', 'calca', 'vestido', 'short', 'jaqueta', 'tricô', 'tricot', 'moletom'])) {
      return 'Peça para montar looks do dia a dia com conforto, praticidade e estilo, ótima para renovar o guarda-roupa.';
    }

    if (contem(p, ['bolsa', 'mochila', 'pochete', 'necessaire', 'mala'])) {
      return 'Produto para carregar e organizar seus itens com mais praticidade, ideal para trabalho, passeio ou viagem.';
    }

    if (contem(p, ['toalha', 'lençol', 'lencol', 'edredom', 'cobertor', 'travesseiro', 'cortina', 'tapete'])) {
      return 'Item para deixar a casa mais confortável, organizada e aconchegante, dando aquele toque especial na rotina.';
    }

    if (contem(p, ['brinquedo', 'boneca', 'carrinho', 'lego', 'hot wheels', 'infantil', 'patrulha canina'])) {
      return 'Opção divertida para crianças brincarem, soltarem a imaginação e também uma ótima ideia de presente.';
    }

    if (contem(p, ['furadeira', 'parafusadeira', 'ferramenta', 'kit reparo', 'zíper', 'ziper', 'cola', 'adesivo'])) {
      return 'Produto útil para reparos, montagem e soluções práticas no dia a dia, ideal para ter sempre por perto.';
    }

    if (contem(p, ['perfume', 'creme', 'hidratante', 'protetor solar', 'maquiagem', 'escova'])) {
      return 'Produto para cuidado pessoal, beleza e praticidade na rotina, ajudando você a se cuidar melhor no dia a dia.';
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