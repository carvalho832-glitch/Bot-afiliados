import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const SHOPEE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

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

function formatarMoeda(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return '';

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  });
}

async function expandirLinkShopee(link) {
  try {
    const resposta = await fetch(link, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36'
      }
    });

    return resposta.url || link;
  } catch {
    return link;
  }
}

function extrairIdsShopee(link) {
  const url = String(link || '');

  const padroes = [
    /\/product\/(\d+)\/(\d+)/i,
    /-i\.(\d+)\.(\d+)/i,
    /[?&]shopid=(\d+).*?[?&]itemid=(\d+)/i,
    /[?&]shop_id=(\d+).*?[?&]item_id=(\d+)/i
  ];

  for (const padrao of padroes) {
    const match = url.match(padrao);
    if (match) {
      return {
        shopId: match[1],
        itemId: match[2]
      };
    }
  }

  const itemPrimeiro = url.match(/[?&]itemid=(\d+).*?[?&]shopid=(\d+)/i) ||
    url.match(/[?&]item_id=(\d+).*?[?&]shop_id=(\d+)/i);

  if (itemPrimeiro) {
    return {
      shopId: itemPrimeiro[2],
      itemId: itemPrimeiro[1]
    };
  }

  return null;
}

function criarAutorizacaoShopee(payload) {
  const appId = limparTexto(process.env.SHOPEE_APP_ID);
  const secret = limparTexto(process.env.SHOPEE_SECRET);

  if (!appId || !secret) {
    throw new Error('Credenciais da Shopee não configuradas no servidor.');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const assinatura = crypto
    .createHash('sha256')
    .update(`${appId}${timestamp}${payload}${secret}`, 'utf8')
    .digest('hex');

  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`;
}

async function consultarProdutoShopee({ shopId, itemId }) {
  const query = `query ProdutoShopee {
    productOfferV2(shopId: ${shopId}, itemId: ${itemId}, limit: 1) {
      nodes {
        itemId
        shopId
        productName
        productLink
        offerLink
        imageUrl
        shopName
        price
        priceMin
        priceMax
        priceDiscountRate
        sales
        ratingStar
        commission
        commissionRate
      }
      pageInfo {
        page
        limit
        hasNextPage
      }
    }
  }`;

  const payload = JSON.stringify({ query });
  const authorization = criarAutorizacaoShopee(payload);

  const resposta = await fetch(SHOPEE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': authorization
    },
    body: payload
  });

  const json = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(`Shopee respondeu com HTTP ${resposta.status}.`);
  }

  if (json?.errors?.length) {
    const mensagem = json.errors.map(erro => erro.message).filter(Boolean).join(' | ');
    throw new Error(mensagem || 'A Shopee recusou a consulta.');
  }

  const produto = json?.data?.productOfferV2?.nodes?.[0];

  if (!produto) {
    throw new Error('Produto não encontrado na lista de ofertas da API da Shopee.');
  }

  return produto;
}

function normalizarProdutoShopee(produto, linkOriginal) {
  const minimo = Number(produto.priceMin || produto.price || 0);
  const maximo = Number(produto.priceMax || produto.price || minimo || 0);
  const descontoPercentual = Number(produto.priceDiscountRate || 0);
  const precoAtualNumero = minimo > 0 ? minimo : maximo;
  const precoAnteriorNumero = descontoPercentual > 0 && precoAtualNumero > 0 && descontoPercentual < 100
    ? precoAtualNumero / (1 - descontoPercentual / 100)
    : 0;

  const temFaixa = minimo > 0 && maximo > 0 && Math.abs(maximo - minimo) > 0.009;
  const linkOferta = limparTexto(produto.offerLink || produto.productLink || linkOriginal);

  return {
    ok: true,
    loja: limparTexto(produto.shopName || 'Shopee'),
    produto: limparTexto(produto.productName || 'Oferta Shopee com desconto'),
    precoDe: formatarMoeda(precoAnteriorNumero),
    precoPor: formatarMoeda(precoAtualNumero),
    precoMin: formatarMoeda(minimo),
    precoMax: formatarMoeda(maximo),
    desconto: descontoPercentual > 0 ? `${Math.round(descontoPercentual)}% OFF` : '',
    cupom: '',
    link: linkOferta,
    linkOferta,
    linkOriginal,
    imagem: limparTexto(produto.imageUrl || ''),
    itemId: String(produto.itemId || ''),
    shopId: String(produto.shopId || ''),
    vendas: Number(produto.sales || 0),
    avaliacao: Number(produto.ratingStar || 0),
    comissao: limparTexto(produto.commission || ''),
    taxaComissao: limparTexto(produto.commissionRate || ''),
    origem: 'shopee-open-api',
    aviso: temFaixa
      ? `O anúncio possui variações entre ${formatarMoeda(minimo)} e ${formatarMoeda(maximo)}. O painel usou o menor preço.`
      : ''
  };
}

function respostaFallbackShopee(link, motivo) {
  return {
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
    origem: 'shopee-fallback',
    aviso: motivo
  };
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
    status: 'online',
    shopeeConfigured: Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET)
  });
});

app.get('/shopee/produto', async (req, res) => {
  const link = extrairLink(req.query.url || req.query.link || '');

  if (!link) {
    return res.status(400).json({
      ok: false,
      error: 'Informe o link da Shopee.'
    });
  }

  try {
    const linkExpandido = await expandirLinkShopee(link);
    const ids = extrairIdsShopee(linkExpandido) || extrairIdsShopee(link);

    if (!ids) {
      return res.json(respostaFallbackShopee(
        link,
        'Não consegui identificar itemId e shopId nesse link. Tente copiar o link direto da página do produto.'
      ));
    }

    const produto = await consultarProdutoShopee(ids);
    return res.json(normalizarProdutoShopee(produto, link));
  } catch (error) {
    console.error('Erro na API oficial da Shopee:', error);

    return res.json(respostaFallbackShopee(
      link,
      `A API oficial da Shopee não retornou os dados: ${error.message}`
    ));
  }
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
