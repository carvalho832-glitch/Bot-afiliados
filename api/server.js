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

function ehCelularGalaxy(produto = '') {
  return /\bgalaxy\s?(a|s|m|z)\d+/i.test(produto) || /\bgalaxy\s?(fold|flip|note)\b/i.test(produto);
}

function beneficioProduto(produto = '') {
  const p = produto.toLowerCase();

  if (p.includes('zíper') || p.includes('ziper')) {
    return 'Ideal para pequenos reparos em roupas, bolsas, mochilas e acessórios.';
  }

  if (p.includes('bolsa') || p.includes('mochila') || p.includes('pochete')) {
    return 'Ajuda a organizar seus itens com praticidade no dia a dia.';
  }

  if (p.includes('air fryer') || p.includes('panela') || p.includes('cozinha')) {
    return 'Mais praticidade para preparar refeições e lanches rápidos.';
  }

  if (
    p.includes('smart tv') ||
    p.includes('tv ') ||
    p.includes(' tv') ||
    p.includes('televisão') ||
    p.includes('televisao') ||
    p.includes('4k') ||
    p.includes('oled') ||
    p.includes('qled')
  ) {
    return 'Tela grande com ótima qualidade de imagem, ideal para filmes, séries, jogos e conteúdos do dia a dia.';
  }

  if (
    p.includes('celular') ||
    p.includes('smartphone') ||
    p.includes('iphone') ||
    p.includes('motorola') ||
    p.includes('xiaomi') ||
    p.includes('redmi') ||
    ehCelularGalaxy(produto)
  ) {
    return 'Ideal para fotos, vídeos, redes sociais e uso diário.';
  }

  if (p.includes('roupa') || p.includes('blusa') || p.includes('camisa') || p.includes('calça')) {
    return 'Peça versátil para montar looks confortáveis e estilosos.';
  }

  if (p.includes('vitamina') || p.includes('suplemento') || p.includes('melatonina')) {
    return 'Produto prático para complementar a rotina, seguindo as orientações do fabricante.';
  }

  return 'Oferta selecionada para quem busca praticidade, economia e compra segura.';
}

function montarMensagem(dados = {}) {
  const produto = limparTexto(dados.produto || dados.product || 'Oferta especial');
  const loja = limparTexto(dados.loja || dados.store || 'Loja oficial');
  const link = limparTexto(dados.link || '');
  const precoDe = limparTexto(dados.precoDe || dados.de || '');
  const precoPor = limparTexto(dados.precoPor || dados.por || dados.price || 'Confira no site');
  const desconto = limparTexto(dados.desconto || '');
  const cupom = limparTexto(dados.cupom || '');

  const linhas = [];

  linhas.push(`🔥 *${produto}!*`);
  linhas.push(`✅ ${beneficioProduto(produto)}`);
  linhas.push('');

  if (temValor(precoDe)) {
    linhas.push(`❌ De: ~${precoDe}~`);
  }

  linhas.push(`💰 *POR APENAS: ${precoPor}*`);

  if (temValor(desconto)) {
    linhas.push(`🔥 *${desconto}*`);
  }

  if (temValor(cupom)) {
    linhas.push(`🎫 *Cupom:* ${cupom}`);
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