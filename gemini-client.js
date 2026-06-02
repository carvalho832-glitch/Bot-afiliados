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

  function tem(texto, palavras) {
    return palavras.some(palavra => texto.includes(palavra));
  }

  function beneficioCurto(produto) {
    const p = (produto || '').toLowerCase();

    if (tem(p, ['multivitamina', 'multi vitamina', 'polivitaminico', 'polivitamínico', 'vitaminas e minerais', 'centrum', 'lavitan'])) {
      return 'Ajuda a complementar vitaminas e minerais na rotina diária.';
    }

    if (tem(p, ['vitamina c', 'acerola', 'camu'])) return 'Ajuda a complementar vitamina C no dia a dia.';
    if (tem(p, ['vitamina d', 'd3'])) return 'Ajuda a complementar vitamina D na rotina.';
    if (tem(p, ['b12', 'complexo b'])) return 'Ajuda a complementar vitaminas do complexo B.';
    if (tem(p, ['omega', 'ômega', 'epa', 'dha'])) return 'Complementa o consumo de ômega 3 na rotina.';
    if (tem(p, ['creatina'])) return 'Ajuda na rotina de treinos e desempenho físico.';
    if (tem(p, ['whey', 'proteina', 'proteína', 'albumina'])) return 'Ajuda a complementar proteína de forma prática.';
    if (tem(p, ['colageno', 'colágeno'])) return 'Ajuda na rotina de cuidados com pele, unhas e cabelos.';
    if (tem(p, ['magnesio', 'magnésio'])) return 'Ajuda a complementar magnésio na rotina diária.';
    if (tem(p, ['cafeina', 'cafeína', 'pre treino', 'pré treino'])) return 'Opção prática para dar mais energia na rotina.';

    if (tem(p, ['carrinho elétrico', 'carrinho eletrico', 'brinquedo', 'boneca', 'lego', 'hot wheels', 'maral', 'infantil 6v'])) {
      return 'Boa opção para presentear e deixar a brincadeira das crianças mais divertida.';
    }

    if (tem(p, ['smartwatch', 'relogio', 'relógio'])) return 'Facilita acompanhar horários, notificações e atividades.';
    if (tem(p, ['fone', 'headset', 'bluetooth'])) return 'Mais praticidade para músicas, vídeos e chamadas.';
    if (tem(p, ['notebook', 'laptop', 'tablet'])) return 'Ideal para estudos, trabalho e tarefas do dia a dia.';
    if (tem(p, ['celular', 'smartphone', 'iphone', 'galaxy', 'motorola'])) return 'Prático para fotos, vídeos, redes sociais e apps.';

    if (tem(p, ['air fryer', 'fritadeira'])) return 'Facilita preparar refeições rápidas com praticidade.';
    if (tem(p, ['cafeteira', 'café', 'cafe'])) return 'Mais praticidade para preparar café na rotina.';
    if (tem(p, ['liquidificador', 'batedeira', 'mixer'])) return 'Ajuda no preparo rápido de receitas e bebidas.';

    if (tem(p, ['tenis', 'tênis', 'sapato', 'sandalia', 'sandália'])) return 'Conforto e estilo para usar no dia a dia.';
    if (tem(p, ['blusa', 'camiseta', 'calça', 'calca', 'vestido', 'tricô', 'tricot'])) return 'Peça versátil para montar looks com conforto.';
    if (tem(p, ['bolsa', 'mochila', 'necessaire'])) return 'Ajuda a organizar seus itens com praticidade.';
    if (tem(p, ['toalha', 'lençol', 'lencol', 'cama', 'banho', 'edredom'])) return 'Ajuda a renovar a casa com mais conforto.';

    return 'Produto útil para facilitar a rotina e economizar.';
  }

  function dadosDaTela() {
    const link = extrairLink(inputLink.value || '');
    const produto = limparTitulo(displayProduto.value || 'Oferta especial');
    const beneficio = beneficioCurto(produto);

    return {
      produto,
      precoDe: displayDe?.value || '',
      precoPor: displayPor?.value || '',
      desconto: calcularDesconto(displayDe?.value || '', displayPor?.value || ''),
      cupom: displayCupom?.value?.trim() || '',
      loja: detectarLoja(link),
      link,
      beneficioSugerido: beneficio,
      instrucoes: 'Crie uma mensagem curta para WhatsApp, com no máximo 6 linhas. Inclua uma linha curta com o benefício do produto. Nunca remova o link informado. Não faça texto longo. Para suplementos, não prometa cura nem resultado garantido.'
    };
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

  function mensagemTemBeneficio(mensagem) {
    const texto = (mensagem || '').toLowerCase();
    return /benef[ií]cio|ajuda|auxilia|ideal|pr[aá]tico|praticidade|conforto|rotina|complementa|facilita|serve para|divers[aã]o|presente/.test(texto);
  }

  function inserirBeneficioSeFaltar(mensagem, dados) {
    if (!mensagem || mensagemTemBeneficio(mensagem)) return mensagem;

    const linhas = mensagem.split('\n').map(linha => linha.trim()).filter(Boolean);
    const linhaBeneficio = `✅ ${dados.beneficioSugerido}`;

    if (!linhas.length) return linhaBeneficio;

    const posicao = linhas.length > 1 ? 1 : linhas.length;
    linhas.splice(posicao, 0, linhaBeneficio);

    return linhas.join('\n');
  }

  function removerRodapeIncompleto(linhas, dados) {
    const loja = (dados.loja || '').toLowerCase();
    const link = dados.link || '';

    return linhas.filter(linha => {
      const l = linha.toLowerCase();
      if (linha.includes(link)) return false;
      if (l.includes('compre com segurança')) return false;
      if (l.includes('link') && (l.includes(loja) || l.includes('loja') || l.includes('shopee') || l.includes('mercado livre') || l.includes('amazon'))) return false;
      return true;
    });
  }

  function garantirLink(mensagem, dados) {
    const link = dados.link || extrairLink(inputLink.value || '');
    if (!link) return mensagem;

    const loja = dados.loja || detectarLoja(link);
    const linhas = String(mensagem || '').split('\n').map(linha => linha.trim()).filter(Boolean);
    const semRodape = removerRodapeIncompleto(linhas, { ...dados, link, loja });

    semRodape.push('');
    semRodape.push('🔒 *Compre com segurança no site oficial:*');
    semRodape.push(`🛒 *Link ${loja}:* ${link}`);

    return semRodape.join('\n');
  }

  function limitarMensagem(mensagem, dados) {
    const link = dados.link || extrairLink(inputLink.value || '');
    const loja = dados.loja || detectarLoja(link);
    const linhas = String(mensagem || '').split('\n').map(linha => linha.trim()).filter(Boolean);

    if (!link) {
      return linhas.slice(0, 7).join('\n');
    }

    const corpo = removerRodapeIncompleto(linhas, { ...dados, link, loja });
    const corpoLimpo = corpo.slice(0, 5);

    corpoLimpo.push('');
    corpoLimpo.push('🔒 *Compre com segurança no site oficial:*');
    corpoLimpo.push(`🛒 *Link ${loja}:* ${link}`);

    return corpoLimpo.join('\n');
  }

  function ajustarMensagem(mensagem, dados) {
    let ajustada = inserirBeneficioSeFaltar(mensagem, dados);
    ajustada = garantirLink(ajustada, dados);
    ajustada = limitarMensagem(ajustada, dados);
    ajustada = garantirLink(ajustada, dados);
    return ajustada;
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

    const dados = dadosDaTela();
    const textoOriginal = '🤖 Gerar mensagem com IA';

    if (!dados.link) {
      alert('Cole o link de afiliado antes de gerar a mensagem.');
      return;
    }

    btnGerar.disabled = true;
    btnGerar.innerText = '🤖 IA criando...';
    messageBox.innerText = `IA criando mensagem curta...\nBenefício: ${dados.beneficioSugerido}`;

    try {
      const mensagem = await chamarGemini(dados);
      const mensagemAjustada = ajustarMensagem(mensagem, dados);

      setMensagem(mensagemAjustada);
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
