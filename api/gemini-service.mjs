const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.GEMINI_TIMEOUT_MS || 30000));
const MAX_REQUESTS_PER_HOUR = Math.max(10, Number(process.env.GEMINI_MAX_REQUESTS_PER_HOUR || 120));
const requestWindows = new Map();

function limpar(valor = '', limite = 500) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

function temValor(valor = '') {
  const texto = limpar(valor, 80);
  return Boolean(texto && texto !== 'R$ 0,00' && texto !== '0' && texto.toLowerCase() !== 'não informado');
}

function extrairLink(valor = '') {
  const texto = String(valor || '').trim();
  return (texto.match(/https?:\/\/[^\s]+/)?.[0] || texto).replace(/[),.;]+$/, '').slice(0, 1600);
}

function tituloLocal(produto = '') {
  const limpo = limpar(produto || 'Oferta especial', 300)
    .replace(/Amazon\.com\.br\s?:?\s?/gi, '')
    .replace(/\|\s?Mercado\s?Livre/gi, '')
    .replace(/- Mercado Livre/gi, '')
    .replace(/\|\s?Shopee Brasil/gi, '');
  return limpo.split(' ').slice(0, 12).join(' ') || 'Oferta especial';
}

function beneficioLocal(produto = '') {
  const p = limpar(produto, 300).toLowerCase();
  if (/smartwatch|rel[oó]gio/.test(p)) return 'Praticidade para acompanhar horários, notificações e atividades no dia a dia.';
  if (/fone|headset|bluetooth/.test(p)) return 'Praticidade para músicas, vídeos e chamadas na rotina.';
  if (/celular|smartphone|iphone|galaxy|motorola/.test(p)) return 'Uma opção prática para fotos, aplicativos, comunicação e uso diário.';
  if (/notebook|laptop|tablet/.test(p)) return 'Uma opção versátil para estudos, trabalho e tarefas do dia a dia.';
  if (/air fryer|fritadeira|panela|liquidificador|cafeteira/.test(p)) return 'Mais praticidade para preparar receitas e organizar a rotina da cozinha.';
  if (/mochila|bolsa|pochete|necessaire/.test(p)) return 'Ajuda a carregar e organizar seus itens com mais praticidade.';
  if (/t[eê]nis|sapato|sand[aá]lia/.test(p)) return 'Uma opção para completar o visual e acompanhar a rotina.';
  if (/brinquedo|boneca|carrinho|hot wheels|lego/.test(p)) return 'Uma opção divertida para brincar e presentear.';
  return 'Um achadinho selecionado para trazer mais praticidade ao dia a dia.';
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

function montarMensagem(dados, criacao = {}) {
  const titulo = limpar(criacao.titulo || tituloLocal(dados.produto), 180).replace(/[!*]+$/g, '');
  const beneficio = limpar(criacao.beneficio || beneficioLocal(dados.produto), 240).replace(/^[-•]+\s*/, '');
  const cupomEhFrete = /frete|gr[aá]tis/i.test(dados.cupom);
  const linhas = [`🔥 *${titulo}!*`];

  if (beneficio) linhas.push(`✨ ${beneficio}`);
  linhas.push('');
  if (temValor(dados.precoDe)) linhas.push(`❌ De: ~${dados.precoDe}~`);
  linhas.push(`💰 *POR APENAS: ${temValor(dados.precoPor) ? dados.precoPor : 'Confira no site'}*`);

  // Cupom e frete entram somente quando foram preenchidos manualmente no painel.
  if (temValor(dados.cupom)) {
    linhas.push(cupomEhFrete ? `🚚 *Frete grátis:* ${dados.cupom}` : `🎫 *Cupom:* ${dados.cupom}`);
  }

  linhas.push('');
  linhas.push('🔒 *Compre com segurança no site oficial:*');
  linhas.push(`🛒 *Link ${dados.loja}:* ${dados.link}`);
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
    'Você cria uma mensagem curta de venda para WhatsApp em português do Brasil.',
    'Use somente os dados fornecidos. Não invente recursos, certificações, avaliações, garantia, estoque, desconto, cupom, frete ou benefícios médicos.',
    'Retorne apenas o JSON solicitado.',
    '',
    `Produto: ${dados.produto}`,
    '',
    'Crie:',
    '1. titulo: título fiel ao produto, com 6 a 12 palavras, sem preço, loja, emoji ou pontuação final.',
    '2. beneficio: uma frase curta e segura sobre uso ou praticidade, baseada somente no nome do produto, sem promessas absolutas.'
  ].join('\n');
}

function extrairTextoGemini(json) {
  return (json?.candidates?.[0]?.content?.parts || [])
    .map(part => part?.text || '')
    .join('')
    .trim();
}

async function consultarGemini(dados) {
  const apiKey = limpar(process.env.GEMINI_API_KEY || '', 300);
  const model = limpar(process.env.GEMINI_MODEL || DEFAULT_MODEL, 100) || DEFAULT_MODEL;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no servidor.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
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
        generationConfig: {
          maxOutputTokens: 350,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              titulo: {
                type: 'STRING',
                description: 'Título fiel ao produto, entre 6 e 12 palavras.'
              },
              beneficio: {
                type: 'STRING',
                description: 'Uma frase curta, segura e baseada somente no nome do produto.'
              }
            },
            required: ['titulo', 'beneficio']
          }
        }
      }),
      signal: controller.signal
    });

    const json = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const detalhe = json?.error?.message || `Gemini respondeu com HTTP ${resposta.status}.`;
      throw new Error(detalhe);
    }

    const texto = extrairTextoGemini(json);
    if (!texto) throw new Error('O Gemini não devolveu conteúdo.');

    let criacao;
    try {
      criacao = JSON.parse(texto);
    } catch {
      const bloco = texto.match(/\{[\s\S]*\}/)?.[0];
      if (!bloco) throw new Error('O Gemini devolveu um formato inesperado.');
      criacao = JSON.parse(bloco);
    }

    const titulo = limpar(criacao?.titulo || '', 180);
    const beneficio = limpar(criacao?.beneficio || '', 240);
    if (!titulo || !beneficio) throw new Error('O Gemini não devolveu título e benefício válidos.');

    return { titulo, beneficio, model };
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

    console.warn('[GEMINI] Geração indisponível. Usando modelo local seguro:', motivo);
    return {
      provider: 'local',
      model: 'local-fallback',
      fallback: true,
      warning: `Gemini indisponível: ${motivo}`,
      mensagem: montarMensagem(dados)
    };
  }
}
