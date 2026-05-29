import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_ENV = (process.env.GEMINI_MODEL || '').trim();
const GEMINI_MODEL = !GEMINI_MODEL_ENV || GEMINI_MODEL_ENV.includes('1.5')
  ? 'gemini-2.5-flash'
  : GEMINI_MODEL_ENV;
const FALLBACK_MODELS = Array.from(new Set([
  GEMINI_MODEL,
  'gemini-2.5-flash-lite',
  'gemini-flash-latest'
]));

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb', type: ['application/json', 'application/*+json'] }));
app.use(express.text({ limit: '1mb', type: 'text/plain' }));

function normalizarBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function limparTexto(valor = '') {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function temValor(valor = '') {
  const texto = limparTexto(valor);
  return texto && texto !== 'R$ 0,00' && texto !== '0' && texto.toLowerCase() !== 'não informado';
}

function beneficioProduto(produto = '') {
  const p = produto.toLowerCase();

  if (p.includes('tv') || p.includes('smart')) {
    return 'Tela maior para curtir filmes, séries, jogos e apps de streaming com mais conforto.';
  }

  if (p.includes('celular') || p.includes('smartphone') || p.includes('galaxy') || p.includes('iphone') || p.includes('motorola') || p.includes('samsung')) {
    return 'Ideal para fotos, vídeos, redes sociais, apps e uso diário com mais praticidade.';
  }

  if (p.includes('notebook') || p.includes('laptop') || p.includes('inspiron') || p.includes('dell')) {
    return 'Boa opção para estudos, trabalho, navegação e tarefas do dia a dia.';
  }

  if (p.includes('cadeira') && (p.includes('auto') || p.includes('carro') || p.includes('bebê') || p.includes('bebe'))) {
    return 'Mais segurança e conforto para transportar a criança no carro.';
  }

  if (p.includes('sandui') || p.includes('grill') || p.includes('air fryer') || p.includes('panela') || p.includes('cozinha')) {
    return 'Mais praticidade para preparar lanches e refeições rápidas no dia a dia.';
  }

  if (p.includes('fone') || p.includes('headset') || p.includes('bluetooth')) {
    return 'Mais praticidade para ouvir músicas, ver vídeos e atender chamadas.';
  }

  if (p.includes('roupa') || p.includes('blusa') || p.includes('camisa') || p.includes('calça') || p.includes('vestido') || p.includes('tricô') || p.includes('trico')) {
    return 'Peça versátil para montar looks confortáveis e estilosos na rotina.';
  }

  if (p.includes('toalha') || p.includes('algodão') || p.includes('algodao') || p.includes('cama') || p.includes('banho')) {
    return 'Produto útil para renovar a casa e deixar a rotina mais confortável.';
  }

  if (p.includes('omega') || p.includes('ômega') || p.includes('vitamina') || p.includes('multivit') || p.includes('cafeína') || p.includes('cafeina') || p.includes('capsula') || p.includes('cápsula') || p.includes('suplemento')) {
    return 'Opção prática para complementar a rotina de cuidados, seguindo as orientações de uso do fabricante.';
  }

  if (p.includes('bolsa') || p.includes('mochila')) {
    return 'Ajuda a organizar seus itens com mais praticidade no dia a dia.';
  }

  if (p.includes('tênis') || p.includes('tenis') || p.includes('sapato') || p.includes('sandália') || p.includes('sandalia')) {
    return 'Mais conforto e estilo para usar na rotina, passeio ou trabalho.';
  }

  return 'Produto escolhido para facilitar sua rotina e ajudar você a economizar.';
}

function tituloDestaque(produto = '') {
  const limpo = limparTexto(produto || 'Oferta especial');
  return limpo.split(' ').slice(0, 10).join(' ');
}

function montarMensagemSegura(dados) {
  const produto = limparTexto(dados.produto || 'Oferta especial');
  const precoDe = limparTexto(dados.precoDe || '');
  const precoPor = limparTexto(dados.precoPor || '');
  const desconto = limparTexto(dados.desconto || '');
  const cupom = limparTexto(dados.cupom || '');
  const loja = limparTexto(dados.loja || 'Loja oficial');
  const link = limparTexto(dados.link || '');
  const cupomEhFrete = /frete|gr[aá]tis/i.test(cupom);

  const linhas = [];
  linhas.push(`🔥 *${tituloDestaque(produto)}!*`);
  linhas.push(`✅ ${beneficioProduto(produto)}`);
  linhas.push('');

  if (temValor(precoDe)) linhas.push(`❌ De: ~${precoDe}~`);
  linhas.push(`💰 *POR APENAS: ${temValor(precoPor) ? precoPor : 'Confira no site'}*`);
  if (temValor(desconto)) linhas.push(`🔥 *${desconto}!*`);
  if (temValor(cupom)) linhas.push(cupomEhFrete ? `🚚 *Frete grátis:* ${cupom}` : `🎫 *Cupom:* ${cupom}`);

  linhas.push('');
  linhas.push('🔒 *Compre com segurança no site oficial:*');
  linhas.push(`🛒 *Link ${loja}:* ${link}`);

  return linhas.join('\n');
}

function mensagemEstaCompleta(texto = '', dados = {}) {
  const msg = limparTexto(texto);
  const linhas = String(texto || '').split('\n').map(l => l.trim()).filter(Boolean);
  const temPreco = msg.includes('POR APENAS') || msg.includes('Por apenas') || msg.includes('preço') || msg.includes('Preço');
  const temBeneficio = msg.includes('✅') || msg.toLowerCase().includes('ideal') || msg.toLowerCase().includes('praticidade') || msg.toLowerCase().includes('conforto');
  const temLink = !dados.link || msg.includes(dados.link) || msg.toLowerCase().includes('link');
  return msg.length >= 120 && linhas.length >= 5 && temPreco && temBeneficio && temLink;
}

function garantirMensagemCompleta(texto, dados) {
  if (mensagemEstaCompleta(texto, dados)) return texto.trim();
  return montarMensagemSegura(dados);
}

function montarPrompt(dados) {
  const produto = limparTexto(dados.produto || 'Produto');
  const precoDe = limparTexto(dados.precoDe || '');
  const precoPor = limparTexto(dados.precoPor || '');
  const cupom = limparTexto(dados.cupom || '');
  const loja = limparTexto(dados.loja || 'Loja oficial');
  const link = limparTexto(dados.link || '');
  const desconto = limparTexto(dados.desconto || '');

  return `
Você é uma IA especialista em criar mensagens curtas para grupos de vendas no WhatsApp.

Crie UMA mensagem em português do Brasil para vender o produto abaixo.

Dados do produto:
- Produto: ${produto}
- Preço antes: ${precoDe || 'não informado'}
- Preço atual: ${precoPor || 'não informado'}
- Desconto: ${desconto || 'não informado'}
- Cupom/Frete: ${cupom || 'não informado'}
- Loja: ${loja}
- Link: ${link}

Regras obrigatórias:
1. NÃO responda apenas com o nome do produto.
2. A mensagem deve ter entre 6 e 10 linhas úteis.
3. Comece com emoji e nome do produto em destaque.
4. Explique em poucas palavras o benefício real do produto para o cliente.
5. Adapte o benefício ao tipo do produto: suplemento, roupa, celular, cozinha, casa, bebê, beleza, eletrônico etc.
6. Não invente ficha técnica, voltagem, parcelamento, avaliação, estoque ou informações que não foram fornecidas.
7. Em suplementos, vitaminas, cápsulas ou produtos de saúde, NÃO prometa cura, imunidade, emagrecimento, energia garantida, tratamento ou resultado médico. Use linguagem segura: "ajuda a complementar a rotina", "opção prática", "cuidados diários".
8. Mantenha preço antes, preço atual, desconto, cupom ou frete grátis se forem informados.
9. Destaque bastante o preço atual.
10. Finalize exatamente com:
🔒 *Compre com segurança no site oficial:*
🛒 *Link ${loja}:* ${link}

Formato desejado:
🔥 *NOME DO PRODUTO!*
✅ Benefício curto e claro para o cliente.

❌ De: ~preço antes~
💰 *POR APENAS: preço atual*
🔥 desconto se houver
🎫 cupom se houver / 🚚 frete grátis se houver

🔒 *Compre com segurança no site oficial:*
🛒 *Link loja:* link

Retorne somente a mensagem final, sem explicações extras.
`;
}

async function chamarModeloGemini(prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.75,
        topP: 0.9,
        maxOutputTokens: 500
      }
    })
  });

  const json = await resposta.json();

  if (!resposta.ok) {
    const detalhe = json?.error?.message || 'Erro ao chamar Gemini.';
    const erro = new Error(detalhe);
    erro.status = resposta.status;
    erro.model = model;
    throw erro;
  }

  const texto = json?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();

  if (!texto) {
    const erro = new Error('Gemini não retornou texto.');
    erro.model = model;
    throw erro;
  }

  return { texto, model };
}

function deveTentarFallback(erro) {
  const msg = String(erro?.message || '').toLowerCase();
  return erro?.status === 429 || erro?.status === 500 || erro?.status === 503 || msg.includes('high demand') || msg.includes('overloaded') || msg.includes('try again later');
}

async function chamarGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada.');
  }

  let ultimoErro = null;

  for (const model of FALLBACK_MODELS) {
    try {
      return await chamarModeloGemini(prompt, model);
    } catch (erro) {
      ultimoErro = erro;
      console.error(`Erro no modelo ${model}:`, erro.message);
      if (!deveTentarFallback(erro)) break;
    }
  }

  throw ultimoErro || new Error('Erro ao chamar Gemini.');
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou API',
    model: GEMINI_MODEL,
    fallbackModels: FALLBACK_MODELS,
    message: 'API Gemini funcionando 🚀',
    rotas: ['/health', '/teste-gemini', 'POST /gerar-mensagem']
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Achou Levou API', model: GEMINI_MODEL, fallbackModels: FALLBACK_MODELS });
});

app.get('/gerar-mensagem', (req, res) => {
  res.json({
    ok: false,
    message: 'Esta rota funciona via POST. Para testar no navegador, use /teste-gemini.'
  });
});

app.get('/teste-gemini', async (req, res) => {
  const dadosTeste = {
    produto: 'Sanduicheira Grill em Inox 750W',
    precoDe: 'R$ 159,90',
    precoPor: 'R$ 99,00',
    desconto: '38% OFF',
    cupom: '',
    loja: 'Amazon',
    link: 'https://amzn.to/teste'
  };

  try {
    const prompt = montarPrompt(dadosTeste);
    const resultado = await chamarGemini(prompt);
    const mensagem = garantirMensagemCompleta(resultado.texto, dadosTeste);

    res.json({
      ok: true,
      model: resultado.model,
      teste: 'Gemini respondeu com sucesso',
      mensagem
    });
  } catch (erro) {
    res.json({
      ok: true,
      model: erro.model || 'fallback-local',
      fallbackModels: FALLBACK_MODELS,
      teste: 'Gemini falhou, mas fallback local respondeu',
      mensagem: montarMensagemSegura(dadosTeste)
    });
  }
});

app.post('/gerar-mensagem', async (req, res) => {
  const dados = normalizarBody(req.body);

  if (!dados.produto && !dados.link) {
    return res.status(400).json({
      ok: false,
      error: 'Envie pelo menos produto ou link.'
    });
  }

  try {
    const prompt = montarPrompt(dados);
    const resultado = await chamarGemini(prompt);
    const mensagem = garantirMensagemCompleta(resultado.texto, dados);

    res.json({
      ok: true,
      model: resultado.model,
      mensagem
    });
  } catch (erro) {
    console.error('Erro ao gerar mensagem:', erro);
    res.json({
      ok: true,
      model: erro.model || 'fallback-local',
      fallbackModels: FALLBACK_MODELS,
      mensagem: montarMensagemSegura(dados)
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada dentro da API Achou Levou.',
    metodo: req.method,
    caminho: req.originalUrl,
    rotasDisponiveis: ['/', '/health', '/teste-gemini', 'POST /gerar-mensagem']
  });
});

app.listen(PORT, () => {
  console.log(`Achou Levou API rodando na porta ${PORT} usando ${GEMINI_MODEL}`);
});
