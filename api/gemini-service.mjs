const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.GEMINI_TIMEOUT_MS || 30000));
const MAX_REQUESTS_PER_HOUR = Math.max(10, Number(process.env.GEMINI_MAX_REQUESTS_PER_HOUR || 120));
const requestWindows = new Map();

const CRIACAO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titulo: {
      type: 'string',
      description: 'Título curto, fiel e atraente para o produto, sem emoji, preço ou pontuação final.'
    },
    gancho: {
      type: 'string',
      description: 'Uma frase curta que desperta uma necessidade ou dor cotidiana real relacionada ao produto.'
    },
    beneficio: {
      type: 'string',
      description: 'Uma frase curta que transforma a utilidade segura do produto em benefício e desejo.'
    },
    cta: {
      type: 'string',
      description: 'Chamada curta e direta para a pessoa abrir o link ou aproveitar a oferta, sem emoji.'
    }
  },
  required: ['titulo', 'gancho', 'beneficio', 'cta']
};

function limpar(valor = '', limite = 500) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

function normalizarChave(valor = '') {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function temValor(valor = '') {
  const texto = limpar(valor, 80);
  return Boolean(
    texto &&
    texto !== 'R$ 0,00' &&
    texto !== '0' &&
    texto.toLowerCase() !== 'não informado'
  );
}

function extrairLink(valor = '') {
  const texto = String(valor || '').trim();
  return (texto.match(/https?:\/\/[^\s]+/)?.[0] || texto)
    .replace(/[),.;]+$/, '')
    .slice(0, 1600);
}

function tituloLocal(produto = '') {
  const limpo = limpar(produto || 'Oferta especial', 300)
    .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
    .replace(/\|\s?Mercado\s?Livre/gi, '')
    .replace(/- Mercado Livre/gi, '')
    .replace(/\|\s?Shopee Brasil/gi, '');
  return limpo.split(' ').slice(0, 14).join(' ') || 'Oferta especial';
}

function criacaoLocal(produto = '') {
  const p = limpar(produto, 300)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const titulo = tituloLocal(produto);

  if (/parafusadeira|furadeira|chave de impacto|serra eletrica|esmerilhadeira/.test(p)) {
    return {
      titulo,
      gancho: 'Chega de perder tempo em montagens e pequenos reparos do dia a dia.',
      beneficio: 'Mais praticidade para cuidar das tarefas em casa ou no trabalho.',
      cta: 'Garanta a sua agora'
    };
  }

  if (/air fryer|fritadeira|panela|liquidificador|cafeteira|batedeira|forno|micro-ondas/.test(p)) {
    return {
      titulo,
      gancho: 'Quer preparar suas receitas com mais agilidade e menos trabalho?',
      beneficio: 'Uma escolha prática para facilitar a rotina e aproveitar melhor a cozinha.',
      cta: 'Aproveite esta oferta agora'
    };
  }

  if (/organizador|prateleira|armario|guarda-roupa|sapateira|estante|cabide/.test(p)) {
    return {
      titulo,
      gancho: 'Cansou da bagunça ocupando espaço e atrapalhando a rotina?',
      beneficio: 'Ajuda a deixar tudo mais organizado, acessível e agradável no dia a dia.',
      cta: 'Aproveite e organize sua casa'
    };
  }

  if (/aspirador|robo aspirador|mop|vassoura|lavadora|limpeza/.test(p)) {
    return {
      titulo,
      gancho: 'A limpeza da casa está tomando mais tempo do que deveria?',
      beneficio: 'Mais praticidade para cuidar dos ambientes e liberar tempo para sua rotina.',
      cta: 'Confira e facilite sua rotina'
    };
  }

  if (/smartwatch|relogio inteligente/.test(p)) {
    return {
      titulo,
      gancho: 'Quer acompanhar a rotina sem precisar pegar o celular toda hora?',
      beneficio: 'Mais praticidade para consultar horários, notificações e atividades no dia a dia.',
      cta: 'Garanta o seu agora'
    };
  }

  if (/fone|headset|bluetooth|caixa de som|speaker/.test(p)) {
    return {
      titulo,
      gancho: 'Som ruim e fios atrapalhando tiram a praticidade da sua rotina?',
      beneficio: 'Uma opção prática para curtir músicas, vídeos e chamadas onde estiver.',
      cta: 'Garanta o seu agora'
    };
  }

  if (/celular|smartphone|iphone|galaxy|motorola|notebook|laptop|tablet/.test(p)) {
    return {
      titulo,
      gancho: 'Seu aparelho atual já não acompanha bem as tarefas do dia a dia?',
      beneficio: 'Uma opção versátil para comunicação, aplicativos, estudos e trabalho.',
      cta: 'Confira esta oportunidade'
    };
  }

  if (/mochila|bolsa|pochete|necessaire|mala/.test(p)) {
    return {
      titulo,
      gancho: 'Levar seus itens sem organização deixa qualquer saída mais complicada.',
      beneficio: 'Mais praticidade para manter tudo por perto e seguir a rotina com conforto.',
      cta: 'Garanta a sua agora'
    };
  }

  if (/tenis|sapato|sandalia|chinelo|bota/.test(p)) {
    return {
      titulo,
      gancho: 'Conforto e praticidade fazem diferença em cada passo da rotina.',
      beneficio: 'Uma opção fácil de combinar para completar o visual do dia a dia.',
      cta: 'Escolha o seu agora'
    };
  }

  if (/vestido|camiseta|blusa|calca|short|conjunto|jaqueta|moda/.test(p)) {
    return {
      titulo,
      gancho: 'Quer renovar o visual sem complicar suas combinações?',
      beneficio: 'Uma peça versátil para montar looks práticos em diferentes ocasiões.',
      cta: 'Confira e escolha o seu'
    };
  }

  if (/secador|escova secadora|chapinha|maquiagem|perfume|hidratante|beleza/.test(p)) {
    return {
      titulo,
      gancho: 'Sua rotina de cuidados pode ficar mais simples e prazerosa.',
      beneficio: 'Uma opção prática para reservar um momento de cuidado no dia a dia.',
      cta: 'Aproveite esta oferta agora'
    };
  }

  if (/brinquedo|boneca|carrinho|hot wheels|lego|quebra-cabeca/.test(p)) {
    return {
      titulo,
      gancho: 'Procurando uma ideia que desperte diversão e bons momentos?',
      beneficio: 'Uma opção para brincar, presentear e criar momentos especiais.',
      cta: 'Garanta esta diversão agora'
    };
  }

  if (/cachorro|gato|pet|comedouro|bebedouro|coleira|cama pet/.test(p)) {
    return {
      titulo,
      gancho: 'O cuidado com seu pet também pede praticidade na rotina.',
      beneficio: 'Uma opção útil para deixar os momentos com seu companheiro ainda melhores.',
      cta: 'Confira para o seu pet'
    };
  }

  return {
    titulo,
    gancho: 'Quer deixar a rotina mais prática sem complicação?',
    beneficio: 'Uma opção útil para facilitar o dia a dia e aproveitar melhor cada uso.',
    cta: 'Aproveite esta oferta agora'
  };
}

function normalizarDados(dados = {}) {
  return {
    produto: limpar(dados.produto || dados.product || '', 300),
    precoDe: limpar(dados.precoDe || dados.de || '', 60),
    precoPor: limpar(dados.precoPor || dados.por || dados.price || '', 60),
    cupom: limpar(dados.cupom || '', 180),
    loja: limpar(dados.loja || dados.store || 'Loja oficial', 80),
    link: extrairLink(dados.link || '')
  };
}

function limparCampoCriativo(valor = '', limite = 180) {
  return limpar(valor, limite * 2)
    .replace(/^(?:titulo|título|gancho|dor|necessidade|benef[ií]cio|desejo|cta|chamada)\s*:\s*/i, '')
    .replace(/^[🔥🎯✨🛒💥✅⭐👉👇📌\-•]+\s*/u, '')
    .replace(/[*_~`]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite);
}

function finalizarFrase(valor = '') {
  const texto = String(valor || '').trim();
  if (!texto || /[.!?]$/.test(texto)) return texto;
  return `${texto}.`;
}

function normalizarCta(valor = '') {
  return limparCampoCriativo(valor, 70)
    .replace(/[.!?👇]+$/g, '')
    .trim()
    .toLocaleUpperCase('pt-BR');
}

function montarMensagem(dados, criacao = {}) {
  const local = criacaoLocal(dados.produto);
  const titulo = limparCampoCriativo(criacao.titulo || local.titulo, 150).replace(/[.!?]+$/g, '');
  const gancho = finalizarFrase(limparCampoCriativo(criacao.gancho || local.gancho, 130));
  const beneficio = finalizarFrase(limparCampoCriativo(criacao.beneficio || local.beneficio, 150));
  const cta = normalizarCta(criacao.cta || local.cta) || 'APROVEITE ESTA OFERTA AGORA';
  const cupomEhFrete = /frete|gr[aá]tis/i.test(dados.cupom);
  const linhas = [`🔥 *${titulo}*`];

  if (gancho) linhas.push(`🎯 ${gancho}`);
  if (beneficio) linhas.push(`✨ ${beneficio}`);
  linhas.push('');

  if (temValor(dados.precoDe)) linhas.push(`❌ De: ~${dados.precoDe}~`);
  linhas.push(`💰 *POR APENAS: ${temValor(dados.precoPor) ? dados.precoPor : 'Confira no site'}*`);

  // Cupom e frete entram somente quando foram preenchidos manualmente no painel.
  if (temValor(dados.cupom)) {
    linhas.push(cupomEhFrete ? `🚚 *Frete grátis:* ${dados.cupom}` : `🎫 *Cupom:* ${dados.cupom}`);
  }

  linhas.push('');
  linhas.push(`🛒 *${cta}!* 👇`);
  linhas.push(dados.link);
  return linhas.join('\n');
}

function verificarLimite(clientId = 'anonimo') {
  const agora = Date.now();
  const janela = 60 * 60 * 1000;
  const chave = limpar(clientId, 120) || 'anonimo';
  const registros = (requestWindows.get(chave) || []).filter(timestamp => agora - timestamp < janela);
  if (registros.length >= MAX_REQUESTS_PER_HOUR) {
    const error = new Error('Limite temporário de geração atingido. Aguarde alguns minutos e tente novamente.');
    error.statusCode = 429;
    throw error;
  }
  registros.push(agora);
  requestWindows.set(chave, registros);
}

function criarPrompt(dados) {
  return [
    'Você é uma copywriter vendedora especialista em ofertas para grupos de WhatsApp no Brasil.',
    '',
    'MISSÃO',
    'Crie o núcleo de uma mensagem curta, objetiva, natural e convincente para o produto informado.',
    'A pessoa deve entender rapidamente qual necessidade o produto atende e sentir vontade de abrir o link.',
    '',
    'TÉCNICA DE VENDA',
    '- gancho: apresente uma dor ou necessidade cotidiana real que o produto ajuda a resolver.',
    '- beneficio: transforme a utilidade segura do produto em praticidade, conforto, organização, economia de tempo, presente ou desejo de uso.',
    '- cta: termine com uma chamada direta para aproveitar a oferta ou conferir o produto.',
    '- varie o ângulo e o vocabulário entre as gerações.',
    '',
    'LIMITES DE SEGURANÇA',
    '- Use somente o que pode ser concluído com segurança pelo nome do produto.',
    '- Não invente funções, potência, material, tamanho, qualidade, certificações, avaliações, garantia, estoque, desconto, cupom, frete ou benefício médico.',
    '- Não use falsa escassez, como últimas unidades ou vai acabar, porque esses dados não foram fornecidos.',
    '- Evite frases vagas como “um achadinho selecionado” ou “produto útil para o dia a dia”.',
    '- Não inclua preço, loja, link, emojis, Markdown nem explicações nos campos.',
    '',
    `PRODUTO: ${dados.produto}`,
    '',
    'FORMATO EXATO',
    '{"titulo":"texto","gancho":"texto","beneficio":"texto","cta":"texto"}',
    '',
    'REGRAS DOS CAMPOS',
    '1. titulo: 5 a 14 palavras, fiel ao produto, sem pontuação final.',
    '2. gancho: uma única frase, até 120 caracteres, com dor ou necessidade natural e sem exagero.',
    '3. beneficio: uma única frase diferente do gancho, até 140 caracteres, com resultado prático ou desejo.',
    '4. cta: de 3 a 7 palavras, direto, sem pontuação final.'
  ].join('\n');
}

function extrairTextoGemini(json) {
  const textoDasPartes = (json?.candidates?.[0]?.content?.parts || [])
    .filter(part => !part?.thought)
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();

  return textoDasPartes || limpar(json?.text || json?.outputText || json?.output_text || '', 5000);
}

function extrairPrimeiroObjetoJson(texto = '') {
  const inicio = String(texto).indexOf('{');
  if (inicio < 0) return '';

  let profundidade = 0;
  let emString = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i += 1) {
    const char = texto[i];
    if (escapado) {
      escapado = false;
      continue;
    }
    if (char === '\\') {
      escapado = true;
      continue;
    }
    if (char === '"') {
      emString = !emString;
      continue;
    }
    if (emString) continue;
    if (char === '{') profundidade += 1;
    if (char === '}') profundidade -= 1;
    if (profundidade === 0) return texto.slice(inicio, i + 1);
  }

  return '';
}

function valorPorChaves(objeto, chaves) {
  if (!objeto || typeof objeto !== 'object') return '';
  const procuradas = new Set(chaves.map(normalizarChave));
  for (const [chave, valor] of Object.entries(objeto)) {
    if (!procuradas.has(normalizarChave(chave))) continue;
    if (Array.isArray(valor)) return valor.filter(Boolean).join(' ');
    if (valor !== null && typeof valor !== 'object') return String(valor);
  }
  return '';
}

function interpretarMensagemLivre(texto = '') {
  const linhas = String(texto || '')
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .split(/\r?\n/)
    .map(linha => linha.trim())
    .filter(Boolean);

  const rotulos = {};
  for (const linha of linhas) {
    const match = linha.match(/^(titulo|título|gancho|dor|necessidade|benef[ií]cio|desejo|cta|chamada)\s*:\s*(.+)$/i);
    if (match) rotulos[normalizarChave(match[1])] = match[2];
  }

  if (Object.keys(rotulos).length) {
    return {
      titulo: rotulos.titulo || '',
      gancho: rotulos.gancho || rotulos.dor || rotulos.necessidade || '',
      beneficio: rotulos.beneficio || rotulos.desejo || '',
      cta: rotulos.cta || rotulos.chamada || ''
    };
  }

  const uteis = linhas.filter(linha => {
    const normalizada = normalizarChave(linha);
    return !(
      /^https?:\/\//i.test(linha) ||
      /\bR\$\s*\d/i.test(linha) ||
      /^(de|por|cupom|frete|link)/i.test(normalizada)
    );
  });
  const ctaIndex = uteis.findIndex(linha => /garanta|aproveite|confira|compre|escolha|pegue/i.test(linha));
  const semCta = uteis.filter((_, index) => index !== ctaIndex);

  return {
    titulo: semCta[0] || '',
    gancho: semCta[1] || '',
    beneficio: semCta[2] || '',
    cta: ctaIndex >= 0 ? uteis[ctaIndex] : ''
  };
}

function normalizarObjetoCriacao(valor) {
  let atual = valor;
  if (Array.isArray(atual)) atual = atual[0];

  for (let nivel = 0; nivel < 3; nivel += 1) {
    if (!atual || typeof atual !== 'object' || Array.isArray(atual)) break;
    const wrapper = atual.mensagem || atual.message || atual.resultado || atual.result || atual.copy || atual.conteudo;
    if (wrapper && typeof wrapper === 'object') {
      atual = Array.isArray(wrapper) ? wrapper[0] : wrapper;
      continue;
    }
    break;
  }

  if (!atual || typeof atual !== 'object' || Array.isArray(atual)) return null;

  const mensagemLivre = valorPorChaves(atual, ['mensagem', 'message', 'texto', 'copy']);
  const livre = mensagemLivre ? interpretarMensagemLivre(mensagemLivre) : {};
  return {
    titulo: valorPorChaves(atual, ['titulo', 'title', 'produto']) || livre.titulo || '',
    gancho: valorPorChaves(atual, ['gancho', 'dor', 'necessidade', 'abertura', 'hook']) || livre.gancho || '',
    beneficio: valorPorChaves(atual, ['beneficio', 'beneficios', 'desejo', 'solucao', 'descrição', 'descricao']) || livre.beneficio || '',
    cta: valorPorChaves(atual, ['cta', 'chamada', 'callToAction', 'acao']) || livre.cta || ''
  };
}

function interpretarCriacao(texto = '') {
  const limpo = String(texto || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const objetoCompleto = extrairPrimeiroObjetoJson(limpo);
  const tentativas = [...new Set([limpo, objetoCompleto].filter(Boolean))];

  for (const tentativa of tentativas) {
    try {
      let valor = JSON.parse(tentativa);
      if (typeof valor === 'string') {
        const stringInterna = valor.trim();
        try {
          valor = JSON.parse(stringInterna);
        } catch {
          const livre = interpretarMensagemLivre(stringInterna);
          if (Object.values(livre).some(Boolean)) return livre;
        }
      }

      const criacao = normalizarObjetoCriacao(valor);
      if (criacao && Object.values(criacao).some(Boolean)) return criacao;
    } catch {
      // Tenta o próximo formato antes de interpretar como texto livre.
    }
  }

  const livre = interpretarMensagemLivre(limpo);
  if (Object.values(livre).filter(Boolean).length >= 2) return livre;
  throw new Error('O Gemini devolveu um formato inesperado.');
}

function configGeracao({ comSchema }) {
  const config = {
    temperature: 0.85,
    topP: 0.9,
    maxOutputTokens: 1600,
    thinkingConfig: {
      thinkingLevel: 'low',
      includeThoughts: false
    },
    responseMimeType: 'application/json'
  };

  if (comSchema) config.responseJsonSchema = CRIACAO_SCHEMA;
  return config;
}

async function requisitarGemini({ apiKey, model, dados, generationConfig, signal }) {
  const resposta = await fetch(`${GEMINI_API_ROOT}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: criarPrompt(dados) }]
      }],
      generationConfig
    }),
    signal
  });

  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const detalhe = json?.error?.message || `Gemini respondeu com HTTP ${resposta.status}.`;
    const error = new Error(detalhe);
    error.statusCode = resposta.status;
    throw error;
  }

  const texto = extrairTextoGemini(json);
  if (!texto) {
    const motivo = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || 'sem conteúdo';
    throw new Error(`O Gemini não devolveu conteúdo (${motivo}).`);
  }

  return interpretarCriacao(texto);
}

function podeTentarSemSchema(error) {
  const mensagem = String(error?.message || '');
  return Number(error?.statusCode || 0) === 400 || /formato inesperado|json|schema|invalid argument|unknown name/i.test(mensagem);
}

async function consultarGemini(dados) {
  const apiKey = limpar(process.env.GEMINI_API_KEY || '', 300);
  const model = limpar(process.env.GEMINI_MODEL || DEFAULT_MODEL, 100) || DEFAULT_MODEL;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no servidor.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let ultimoErro = null;
    for (const comSchema of [true, false]) {
      try {
        const criacao = await requisitarGemini({
          apiKey,
          model,
          dados,
          generationConfig: configGeracao({ comSchema }),
          signal: controller.signal
        });

        const local = criacaoLocal(dados.produto);
        const titulo = limparCampoCriativo(criacao?.titulo || local.titulo, 150);
        const gancho = limparCampoCriativo(criacao?.gancho || local.gancho, 130);
        const beneficio = limparCampoCriativo(criacao?.beneficio || local.beneficio, 150);
        const cta = limparCampoCriativo(criacao?.cta || local.cta, 70);
        if (!titulo || !gancho || !beneficio || !cta) {
          throw new Error('O Gemini não devolveu os campos de venda válidos.');
        }

        return { titulo, gancho, beneficio, cta, model };
      } catch (error) {
        ultimoErro = error;
        if (comSchema && podeTentarSemSchema(error)) {
          console.warn('[GEMINI] Saída estruturada incompatível. Repetindo em modo JSON simples:', error.message);
          continue;
        }
        throw error;
      }
    }

    throw ultimoErro || new Error('O Gemini não respondeu.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function gerarMensagemComGemini(entrada = {}, opcoes = {}) {
  verificarLimite(opcoes.clientId);
  const dados = normalizarDados(entrada);

  if (!dados.produto) {
    const error = new Error('Informe o nome do produto.');
    error.statusCode = 400;
    throw error;
  }
  if (!dados.link) {
    const error = new Error('Informe o link de afiliado.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const criacao = await consultarGemini(dados);
    return {
      provider: 'gemini',
      model: criacao.model,
      fallback: false,
      mensagem: montarMensagem(dados, criacao)
    };
  } catch (error) {
    const motivo = error?.name === 'AbortError'
      ? 'O Gemini ultrapassou o tempo limite.'
      : String(error?.message || error);

    console.warn('[GEMINI] Geração indisponível. Usando modelo local persuasivo:', motivo);
    return {
      provider: 'local',
      model: 'local-fallback',
      fallback: true,
      warning: `Gemini indisponível: ${motivo}`,
      mensagem: montarMensagem(dados)
    };
  }
}
