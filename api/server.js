import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));

app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

function limparTexto(valor = '') {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function extrairLink(valor = '') {
  const texto = limparTexto(valor);
  const encontrado = texto.match(/https?:\/\/[^\s]+/);
  return encontrado ? encontrado[0] : texto;
}

function temValor(valor = '') {
  const texto = limparTexto(valor);
  return Boolean(
    texto &&
    texto !== 'R$ 0,00' &&
    texto !== '0' &&
    texto.toLowerCase() !== 'não informado'
  );
}

function montarMensagem(dados = {}) {
  const produto = limparTexto(dados.produto || dados.product || 'Oferta especial');
  const loja = limparTexto(dados.loja || dados.store || 'Loja oficial');
  const link = limparTexto(dados.link || '');
  const precoDe = limparTexto(dados.precoDe || dados.de || '');
  const precoPor = limparTexto(dados.precoPor || dados.por || dados.price || 'Confira no site');
  const desconto = limparTexto(dados.desconto || '');
  const cupom = limparTexto(dados.cupom || '');
  const cupomEhFrete = /frete|gr[aá]tis/i.test(cupom);

  const linhas = [];

  linhas.push(`🔥 *${produto}!*`);
  linhas.push('');

  if (temValor(precoDe)) {
    linhas.push(`❌ De: ~${precoDe}~`);
  }

  linhas.push(`💰 *POR APENAS: ${precoPor}*`);

  if (temValor(desconto)) {
    linhas.push(`🔥 *${desconto}*`);
  }

  if (temValor(cupom)) {
    linhas.push(cupomEhFrete ? `🚚 *Frete grátis:* ${cupom}` : `🎫 *Cupom:* ${cupom}`);
  }

  linhas.push('');
  linhas.push('🔒 *Compre com segurança no site oficial:*');
  linhas.push(`🛒 *Link ${loja}:* ${link}`);

  return linhas.join('\n');
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou API',
    status: 'online'
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou API',
    status: 'online'
  });
});

app.get('/shopee/produto', (req, res) => {
  const link = extrairLink(req.query.url || req.query.link || '');

  if (!link) {
    return res.status(400).json({
      ok: false,
      error: 'Informe o link da Shopee.'
    });
  }

  return res.json({
    ok: true,
    loja: 'Shopee',
    produto: 'Oferta Shopee com desconto',
    precoDe: '',
    precoPor: '',
    desconto: '',
    cupom: '',
    link,
    linkOferta: link,
    imagem: '',
    origem: 'modo-seguro'
  });
});

app.get('/gerar-mensagem', (req, res) => {
  res.json({
    ok: false,
    message: 'Use POST /gerar-mensagem.'
  });
});

app.post('/gerar-mensagem', (req, res) => {
  const dados = req.body || {};

  return res.json({
    ok: true,
    model: 'local',
    mensagem: montarMensagem(dados)
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada',
    path: req.originalUrl
  });
});

app.listen(PORT, () => {
  console.log(`Achou Levou API rodando na porta ${PORT}`);
});