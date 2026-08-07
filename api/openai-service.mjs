const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6-luna';
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.OPENAI_TIMEOUT_MS || 60000));
const MAX_REQUESTS_PER_HOUR = Math.max(10, Number(process.env.OPENAI_MAX_REQUESTS_PER_HOUR || 180));
const requestWindows = new Map();
let proximoInicioOpenAI = 0;

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

function normalizarCta(valor = '', alternativa = '') {
  const cta = limparCampoCriativo(valor, 70)
    .replace(/[.!?👇]+$/g, '')
    .replace(/\bGANTA\b/gi, 'GARANTA')
    .trim()
    .toLocaleUpperCase('pt-BR');

  if (/\b(?:GARANTA|APROVEITE|CONFIRA|COMPRE|ESCOLHA|ACESSE|VEJA|PEGUE)\b/.test(cta)) {
    return cta;
  }
  return alternativa ? normalizarCta(alternativa) : cta;
}

function montarMensagem(dados, criacao = {}) {
  const local = criacaoLocal(dados.produto);
  const titulo = limparCampoCriativo(criacao.titulo || local.titulo, 150).replace(/[.!?]+$/g, '');
  const gancho = finalizarFrase(limparCampoCriativo(criacao.gancho || local.gancho, 130));
  const beneficio = finalizarFrase(limparCampoCriativo(criacao.beneficio || local.beneficio, 150));
  const cta = normalizarCta(criacao.cta, local.cta) || 'APROVEITE ESTA OFERTA AGORA';
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

function numeroConfigurado(nome, padrao, minimo, maximo) {
  const numero = Number(process.env[nome]);
  if (!Number.isFinite(numero)) return padrao;
  return Math.max(minimo, Math.min(maximo, numero));
}

function esperarComCancelamento(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Operação cancelada.');
      error.name = 'AbortError';
      reject(error);
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancelar);
      resolve();
    }, ms);
    const cancelar = () => {
      clearTimeout(timer);
      const error = new Error('Operação cancelada.');
      error.name = 'AbortError';
      reject(error);
    };
    signal?.addEventListener('abort', cancelar, { once: true });
  });
}

async function aguardarIntervaloOpenAI(signal) {
  const intervalo = numeroConfigurado('OPENAI_MIN_INTERVAL_MS', 350, 0, 60000);
  const agora = Date.now();
  const inicioReservado = Math.max(agora, proximoInicioOpenAI);
  proximoInicioOpenAI = inicioReservado + intervalo;
  await esperarComCancelamento(inicioReservado - agora, signal);
}

function converterAtrasoEmMs(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return 0;
  const segundos = texto.match(/^(\d+(?:\.\d+)?)s?$/i);
  if (segundos) return Math.ceil(Number(segundos[1]) * 1000);
  const data = Date.parse(texto);
  return Number.isNaN(data) ? 0 : Math.max(0, data - Date.now());
}

function erroTemporarioOpenAI(error) {
  const status = Number(error?.statusCode || 0);
  const codigo = String(error?.openaiCode || error?.message || '');
  return [408, 409, 429, 500, 502, 503, 504].includes(status) ||
    /rate_limit|server_error|temporar|timeout|overloaded|alta demanda/i.test(codigo);
}

function atrasoDaTentativa(error, tentativa) {
  const base = numeroConfigurado('OPENAI_RETRY_BASE_MS', 1200, 100, 15000);
  const limite = numeroConfigurado('OPENAI_MAX_RETRY_DELAY_MS', 30000, 1000, 60000);
  const calculado = base * (2 ** Math.max(0, tentativa - 1));
  const sugerido = Number(error?.retryAfterMs || 0);
  const jitter = Math.floor(Math.random() * Math.min(500, base * 0.2));
  return Math.min(limite, Math.max(calculado, sugerido) + jitter);
}

function criarInstrucoes() {
  return [
    'Você é Clara, copywriter brasileira do Achou Levou, especialista em ofertas para grupos de WhatsApp.',
    'Escreva de forma curta, direta, natural e convincente, com português brasileiro impecável.',
    'A mensagem deve despertar uma necessidade real e vontade de abrir o link sem exageros.',
    'Varie o ângulo, o vocabulário e a chamada entre produtos para evitar mensagens repetitivas.',
    'Não invente características, avaliações, estoque, desconto, cupom, frete, garantia ou benefícios médicos.',
    'Não use falsa escassez nem frases genéricas como “achadinho selecionado” ou “produto útil para o dia a dia”.',
    'Não inclua preços, links, emojis, Markdown ou explicações; devolva somente os campos solicitados.'
  ].join('\n');
}

function criarPrompt(dados) {
  return [
    `PRODUTO: ${dados.produto}`,
    '',
    'Crie quatro campos para a oferta:',
    '1. titulo: 5 a 14 palavras, fiel ao produto e sem pontuação final.',
    '2. gancho: uma frase de até 120 caracteres com dor, desejo ou necessidade natural.',
    '3. beneficio: uma frase diferente do gancho, até 140 caracteres, com resultado prático ou desejo de uso.',
    '4. cta: 3 a 7 palavras, direta, com verbo no imperativo e sem pontuação final.',
    'Use somente o que pode ser concluído com segurança pelo nome do produto e revise a ortografia.'
  ].join('\n');
}

function extrairTextoOpenAI(json = {}) {
  if (typeof json.output_text === 'string' && json.output_text.trim()) return json.output_text.trim();

  return (Array.isArray(json.output) ? json.output : [])
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .filter(item => item?.type === 'output_text' && typeof item?.text === 'string')
    .map(item => item.text)
    .join('')
    .trim();
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

function interpretarCriacao(texto = '') {
  const limpo = String(texto || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const candidatos = [...new Set([limpo, extrairPrimeiroObjetoJson(limpo)].filter(Boolean))];

  for (const candidato of candidatos) {
    try {
      const valor = JSON.parse(candidato);
      if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor;
    } catch {
      // Tenta o próximo formato antes de considerar a resposta inválida.
    }
  }
  throw new Error('A OpenAI devolveu um formato inesperado.');
}

function validarCriacao(criacao = {}) {
  const local = criacaoLocal('Oferta especial');
  const titulo = limparCampoCriativo(criacao.titulo, 150);
  const gancho = limparCampoCriativo(criacao.gancho, 130);
  const beneficio = limparCampoCriativo(criacao.beneficio, 150);
  const cta = limparCampoCriativo(criacao.cta, 70);

  if (!titulo || !gancho || !beneficio || !cta) {
    throw new Error('A OpenAI não devolveu todos os campos de venda esperados.');
  }
  return {
    titulo: titulo || local.titulo,
    gancho: gancho || local.gancho,
    beneficio: beneficio || local.beneficio,
    cta: cta || local.cta
  };
}

async function requisitarOpenAI({ apiKey, model, dados, signal, fetchImpl }) {
  const resposta = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: criarInstrucoes(),
      input: criarPrompt(dados),
      max_output_tokens: numeroConfigurado('OPENAI_MAX_OUTPUT_TOKENS', 700, 200, 2000),
      text: {
        format: {
          type: 'json_schema',
          name: 'achou_levou_oferta',
          description: 'Núcleo curto de uma oferta para WhatsApp.',
          schema: CRIACAO_SCHEMA,
          strict: true
        }
      }
    }),
    signal
  });

  const corpo = await resposta.text();
  let json = null;
  try { json = JSON.parse(corpo); } catch {}

  if (!resposta.ok) {
    const detalhe = json?.error?.message || `A OpenAI respondeu com HTTP ${resposta.status}.`;
    const error = new Error(detalhe);
    error.statusCode = resposta.status;
    error.openaiCode = json?.error?.code || json?.error?.type || '';
    error.requestId = resposta.headers?.get?.('x-request-id') || '';
    error.retryAfterMs = converterAtrasoEmMs(resposta.headers?.get?.('retry-after'));
    throw error;
  }

  if (json?.status === 'incomplete') {
    throw new Error(`A OpenAI não concluiu a resposta (${json?.incomplete_details?.reason || 'motivo desconhecido'}).`);
  }

  const texto = extrairTextoOpenAI(json);
  if (!texto) throw new Error('A OpenAI não devolveu conteúdo.');
  return validarCriacao(interpretarCriacao(texto));
}

async function consultarOpenAI(dados, opcoes = {}) {
  const apiKey = limpar(opcoes.apiKey || process.env.OPENAI_API_KEY || '', 500);
  const model = limpar(opcoes.model || process.env.OPENAI_MODEL || DEFAULT_MODEL, 120) || DEFAULT_MODEL;
  const fetchImpl = opcoes.fetchImpl || globalThis.fetch;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada no servidor.');
  if (typeof fetchImpl !== 'function') throw new Error('Cliente HTTP indisponível no servidor.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const maxTentativas = Math.round(numeroConfigurado('OPENAI_MAX_RETRIES', 3, 1, 4));
  let ultimoErro = null;

  try {
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
      if (tentativa > 1) {
        const atraso = atrasoDaTentativa(ultimoErro, tentativa - 1);
        console.warn(
          `[OPENAI] Limite ou instabilidade temporária. Nova tentativa ${tentativa}/${maxTentativas} em ${atraso}ms:`,
          ultimoErro?.message
        );
        await esperarComCancelamento(atraso, controller.signal);
      }

      await aguardarIntervaloOpenAI(controller.signal);
      try {
        const criacao = await requisitarOpenAI({
          apiKey,
          model,
          dados,
          signal: controller.signal,
          fetchImpl
        });
        return { ...criacao, model };
      } catch (error) {
        ultimoErro = error;
        if (!erroTemporarioOpenAI(error) || tentativa >= maxTentativas) throw error;
      }
    }
    throw ultimoErro || new Error('A OpenAI não respondeu.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function gerarMensagemComOpenAI(entrada = {}, opcoes = {}) {
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
    const criacao = await consultarOpenAI(dados, opcoes);
    return {
      provider: 'openai',
      model: criacao.model,
      fallback: false,
      mensagem: montarMensagem(dados, criacao)
    };
  } catch (error) {
    const motivo = error?.name === 'AbortError'
      ? 'A OpenAI ultrapassou o tempo limite.'
      : String(error?.message || error);

    const requestId = error?.requestId ? ` request_id=${error.requestId}` : '';
    console.warn(`[OPENAI] Geração indisponível. Usando modelo local persuasivo:${requestId}`, motivo);
    return {
      provider: 'local',
      model: 'local-fallback',
      fallback: true,
      warning: `Clara/OpenAI indisponível: ${motivo}`,
      mensagem: montarMensagem(dados)
    };
  }
}
