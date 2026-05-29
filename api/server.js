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
1. Comece com emoji e nome do produto em destaque.
2. Explique em poucas palavras o benefício real do produto para o cliente.
3. Adapte o benefício ao tipo do produto: suplemento, roupa, celular, cozinha, casa, bebê, beleza, eletrônico etc.
4. Não invente ficha técnica, voltagem, parcelamento, avaliação, estoque ou informações que não foram fornecidas.
5. Em suplementos, vitaminas, cápsulas ou produtos de saúde, NÃO prometa cura, imunidade, emagrecimento, energia garantida, tratamento ou resultado médico. Use linguagem segura: "ajuda a complementar a rotina", "opção prática", "cuidados diários".
6. Mantenha preço antes, preço atual, desconto, cupom ou frete grátis se forem informados.
7. Destaque bastante o preço atual.
8. Finalize exatamente com:
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
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 350
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
  try {
    const dadosTeste = {
      produto: 'Sanduicheira Grill em Inox 750W',
      precoDe: 'R$ 159,90',
      precoPor: 'R$ 99,00',
      desconto: '38% OFF',
      cupom: '',
      loja: 'Amazon',
      link: 'https://amzn.to/teste'
    };

    const prompt = montarPrompt(dadosTeste);
    const resultado = await chamarGemini(prompt);

    res.json({
      ok: true,
      model: resultado.model,
      teste: 'Gemini respondeu com sucesso',
      mensagem: resultado.texto
    });
  } catch (erro) {
    res.status(500).json({
      ok: false,
      model: erro.model || GEMINI_MODEL,
      fallbackModels: FALLBACK_MODELS,
      error: erro.message || 'Erro ao testar Gemini.'
    });
  }
});

app.post('/gerar-mensagem', async (req, res) => {
  try {
    const dados = normalizarBody(req.body);

    if (!dados.produto && !dados.link) {
      return res.status(400).json({
        ok: false,
        error: 'Envie pelo menos produto ou link.'
      });
    }

    const prompt = montarPrompt(dados);
    const resultado = await chamarGemini(prompt);

    res.json({
      ok: true,
      model: resultado.model,
      mensagem: resultado.texto
    });
  } catch (erro) {
    console.error('Erro ao gerar mensagem:', erro);
    res.status(500).json({
      ok: false,
      model: erro.model || GEMINI_MODEL,
      fallbackModels: FALLBACK_MODELS,
      error: erro.message || 'Erro interno ao gerar mensagem.'
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
