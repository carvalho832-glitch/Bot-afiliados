import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou API',
    message: 'API Gemini funcionando 🚀'
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Achou Levou API' });
});

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

async function chamarGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
    throw new Error(detalhe);
  }

  const texto = json?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();

  if (!texto) {
    throw new Error('Gemini não retornou texto.');
  }

  return texto;
}

app.post('/gerar-mensagem', async (req, res) => {
  try {
    const dados = req.body || {};

    if (!dados.produto && !dados.link) {
      return res.status(400).json({
        ok: false,
        error: 'Envie pelo menos produto ou link.'
      });
    }

    const prompt = montarPrompt(dados);
    const mensagem = await chamarGemini(prompt);

    res.json({
      ok: true,
      mensagem
    });
  } catch (erro) {
    console.error('Erro ao gerar mensagem:', erro);
    res.status(500).json({
      ok: false,
      error: erro.message || 'Erro interno ao gerar mensagem.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Achou Levou API rodando na porta ${PORT}`);
});
