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
  if (temValor(precoDe)) linhas.push(`❌ De: ~${precoDe}~`);
  linhas.push(`💰 *POR APENAS: ${precoPor}*`);
  if (temValor(desconto)) linhas.push(`🔥 *${desconto}*`);
  if (temValor(cupom)) linhas.push(cupomEhFrete ? `🚚 *Frete grátis:* ${cupom}` : `🎫 *Cupom:* ${cupom}`);
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

function extrairIdsShopee(valor = '') {
  const texto = String(valor || '');
  const padroes = [
    /\/product\/(\d+)\/(\d+)/i,
    /-i\.(\d+)\.(\d+)/i,
    /[?&]shopid=(\d+).*?[?&]itemid=(\d+)/i,
    /[?&]shop_id=(\d+).*?[?&]item_id=(\d+)/i,
    /[?&]shopId=(\d+).*?[?&]itemId=(\d+)/i,
    /^(\d+)\s*[:.,|/-]\s*(\d+)$/
  ];

  for (const padrao of padroes) {
    const match = texto.match(padrao);
    if (match) return { shopId: match[1], itemId: match[2] };
  }

  const itemPrimeiro = texto.match(/[?&]itemid=(\d+).*?[?&]shopid=(\d+)/i) ||
    texto.match(/[?&]item_id=(\d+).*?[?&]shop_id=(\d+)/i) ||
    texto.match(/[?&]itemId=(\d+).*?[?&]shopId=(\d+)/i);

  if (itemPrimeiro) return { shopId: itemPrimeiro[2], itemId: itemPrimeiro[1] };
  return null;
}

function limparCodigoShopee(valor = '') {
  return limparTexto(valor).toUpperCase().replace(/\s+/g, '');
}

function criarAutorizacaoShopee(payload) {
  const appId = limparTexto(process.env.SHOPEE_APP_ID);
  const secret = limparTexto(process.env.SHOPEE_SECRET);
  if (!appId || !secret) throw new Error('Credenciais da Shopee não configuradas no servidor.');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const assinatura = crypto
    .createHash('sha256')
    .update(`${appId}${timestamp}${payload}${secret}`, 'utf8')
    .digest('hex');

  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`;
}

async function executarConsultaShopee(query) {
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
  if (!resposta.ok) throw new Error(`Shopee respondeu com HTTP ${resposta.status}.`);
  if (json?.errors?.length) {
    const mensagem = json.errors.map(erro => erro.message).filter(Boolean).join(' | ');
    throw new Error(mensagem || 'A Shopee recusou a consulta.');
  }
  return json;
}

function camposProdutoShopee() {
  return `
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
  `;
}

async function consultarProdutoShopeePorIds({ shopId, itemId }) {
  const query = `query ProdutoShopee {
    productOfferV2(shopId: ${Number(shopId)}, itemId: ${Number(itemId)}, limit: 1) {
      nodes { ${camposProdutoShopee()} }
      pageInfo { page limit hasNextPage }
    }
  }`;

  const json = await executarConsultaShopee(query);
  return json?.data?.productOfferV2?.nodes?.[0] || null;
}

async function consultarProdutoShopeePorCodigo(codigo) {
  const codigoSeguro = JSON.stringify(limparCodigoShopee(codigo));
  const query = `query ProdutoShopeePorCodigo {
    productOfferV2(keyword: ${codigoSeguro}, limit: 20) {
      nodes { ${camposProdutoShopee()} }
      pageInfo { page limit hasNextPage }
    }
  }`;

  const json = await executarConsultaShopee(query);
  const produtos = json?.data?.productOfferV2?.nodes || [];
  if (!produtos.length) return null;

  const codigoNormalizado = limparCodigoShopee(codigo);
  return produtos.find(produto => {
    const itemId = limparCodigoShopee(produto?.itemId);
    const nome = limparCodigoShopee(produto?.productName);
    const link = limparCodigoShopee(produto?.productLink || produto?.offerLink);
    return itemId === codigoNormalizado || nome.includes(codigoNormalizado) || link.includes(codigoNormalizado);
  }) || produtos[0];
}

function normalizarProdutoShopee(produto, linkOriginal, metodoResolucao, codigoInformado = '') {
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
    link: linkOferta || linkOriginal,
    linkOferta,
    linkOriginal,
    metodoResolucao,
    codigoInformado,
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

function respostaFallbackShopee(link, motivo, detalhes = {}) {
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
    aviso: motivo,
    ...detalhes
  };
}

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Achou Levou API', status: 'online' });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou API',
    status: 'online',
    shopeeConfigured: Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET),
    shopeeIdLookup: true
  });
});

app.get('/shopee/produto', async (req, res) => {
  const link = extrairLink(req.query.url || req.query.link || '');
  const codigo = limparCodigoShopee(req.query.id || req.query.codigo || '');

  if (!link && !codigo) {
    return res.status(400).json({ ok: false, error: 'Informe o link ou o ID do produto Shopee.' });
  }

  try {
    let produto = null;
    let metodo = '';

    if (codigo) {
      const idsDoCodigo = extrairIdsShopee(codigo);
      if (idsDoCodigo) {
        produto = await consultarProdutoShopeePorIds(idsDoCodigo);
        metodo = 'id-shop-item';
      } else if (/^\d+$/.test(codigo)) {
        const query = `query ProdutoShopeePorItemId {
          productOfferV2(itemId: ${Number(codigo)}, limit: 10) {
            nodes { ${camposProdutoShopee()} }
            pageInfo { page limit hasNextPage }
          }
        }`;
        const json = await executarConsultaShopee(query);
        produto = json?.data?.productOfferV2?.nodes?.[0] || null;
        metodo = 'item-id';
      } else {
        produto = await consultarProdutoShopeePorCodigo(codigo);
        metodo = 'codigo-copiado-keyword';
      }
    }

    if (!produto && link) {
      const idsLink = extrairIdsShopee(link);
      if (idsLink) {
        produto = await consultarProdutoShopeePorIds(idsLink);
        metodo = 'ids-do-link';
      }
    }

    if (!produto) {
      return res.json(respostaFallbackShopee(
        link,
        codigo
          ? 'A API oficial não encontrou um produto correspondente a esse ID copiado no aplicativo.'
          : 'Não consegui identificar itemId e shopId no link informado.',
        { codigoInformado: codigo, metodoResolucao: metodo || 'sem-correspondencia' }
      ));
    }

    return res.json(normalizarProdutoShopee(produto, link, metodo, codigo));
  } catch (error) {
    console.error('Erro na API oficial da Shopee:', error);
    return res.json(respostaFallbackShopee(
      link,
      `A API oficial da Shopee não retornou os dados: ${error.message}`,
      { codigoInformado: codigo }
    ));
  }
});

app.get('/gerar-mensagem', (req, res) => {
  res.json({ ok: false, message: 'Use POST /gerar-mensagem.' });
});

app.post('/gerar-mensagem', (req, res) => {
  const dados = req.body || {};
  return res.json({ ok: true, model: 'local', mensagem: montarMensagem(dados) });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Rota não encontrada', path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`Achou Levou API rodando na porta ${PORT}`);
});