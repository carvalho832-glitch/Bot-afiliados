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
  return encontrado ? encontrado[0].replace(/[),.;]+$/, '') : texto;
}

function temValor(valor = '') {
  const texto = limparTexto(valor);
  return Boolean(texto && texto !== 'R$ 0,00' && texto !== '0' && texto.toLowerCase() !== 'não informado');
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
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function decodificar(valor = '') {
  let atual = String(valor || '');
  for (let i = 0; i < 4; i += 1) {
    try {
      const proximo = decodeURIComponent(atual);
      if (proximo === atual) break;
      atual = proximo;
    } catch {
      break;
    }
  }
  return atual.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
}

function extrairIdsShopee(valor = '') {
  const texto = decodificar(String(valor || ''));
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

function extrairUrls(texto = '') {
  const conteudo = decodificar(texto);
  return [...new Set((conteudo.match(/https?:\/\/[^\s"'<>\\]+/gi) || []).map(url => url.replace(/[),.;]+$/, '')))];
}

function montarLinkCompleto(ids) {
  if (!ids?.shopId || !ids?.itemId) return '';
  return `https://shopee.com.br/product/${ids.shopId}/${ids.itemId}`;
}

async function requisitarComTimeout(url, opcoes = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opcoes, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function converterLinkCurtoShopee(linkOriginal) {
  const idsDiretos = extrairIdsShopee(linkOriginal);
  if (idsDiretos) {
    return {
      ok: true,
      linkCompleto: montarLinkCompleto(idsDiretos),
      ids: idsDiretos,
      metodo: 'link-direto'
    };
  }

  const fila = [linkOriginal];
  const visitados = new Set();
  let ultimoLink = linkOriginal;
  const erros = [];

  while (fila.length && visitados.size < 12) {
    const atual = fila.shift();
    if (!atual || visitados.has(atual)) continue;
    visitados.add(atual);
    ultimoLink = atual;

    const idsAtual = extrairIdsShopee(atual);
    if (idsAtual) {
      return { ok: true, linkCompleto: montarLinkCompleto(idsAtual), ids: idsAtual, metodo: 'redirecionamento' };
    }

    try {
      const resposta = await requisitarComTimeout(atual, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      const location = resposta.headers.get('location');
      if (location) {
        const proximo = new URL(location, atual).toString();
        const idsLocation = extrairIdsShopee(proximo);
        if (idsLocation) {
          return { ok: true, linkCompleto: montarLinkCompleto(idsLocation), ids: idsLocation, metodo: 'header-location' };
        }
        if (!visitados.has(proximo)) fila.unshift(proximo);
      }

      if (resposta.url && resposta.url !== atual && !visitados.has(resposta.url)) fila.unshift(resposta.url);

      const tipo = resposta.headers.get('content-type') || '';
      if (/text|html|json|javascript/i.test(tipo)) {
        const corpo = await resposta.text();
        const candidatos = extrairUrls(corpo).filter(url => /shopee\.com\.br|s\.shopee\.com\.br|shp\.ee/i.test(url));

        const canonical = corpo.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] ||
          corpo.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i)?.[1];
        if (canonical) candidatos.unshift(new URL(decodificar(canonical), atual).toString());

        const refresh = corpo.match(/http-equiv=["']?refresh["']?[^>]*content=["'][^;]+;\s*url=([^"']+)/i)?.[1];
        if (refresh) candidatos.unshift(new URL(decodificar(refresh), atual).toString());

        for (const candidato of candidatos) {
          const ids = extrairIdsShopee(candidato);
          if (ids) {
            return { ok: true, linkCompleto: montarLinkCompleto(ids), ids, metodo: 'html' };
          }
          if (!visitados.has(candidato)) fila.push(candidato);
        }
      }
    } catch (erro) {
      erros.push(erro?.name === 'AbortError' ? 'tempo esgotado' : erro.message);
    }
  }

  return {
    ok: false,
    linkCompleto: ultimoLink,
    ids: null,
    metodo: 'nao-convertido',
    detalhe: erros.filter(Boolean).slice(-3).join(' | ')
  };
}

function criarAutorizacaoShopee(payload) {
  const appId = limparTexto(process.env.SHOPEE_APP_ID);
  const secret = limparTexto(process.env.SHOPEE_SECRET);
  if (!appId || !secret) throw new Error('Credenciais da Shopee não configuradas no servidor.');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const assinatura = crypto.createHash('sha256').update(`${appId}${timestamp}${payload}${secret}`, 'utf8').digest('hex');
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`;
}

async function executarConsultaShopee(query) {
  const payload = JSON.stringify({ query });
  const authorization = criarAutorizacaoShopee(payload);
  const resposta = await requisitarComTimeout(SHOPEE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': authorization },
    body: payload
  }, 15000);

  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(`Shopee respondeu com HTTP ${resposta.status}.`);
  if (json?.errors?.length) {
    const mensagem = json.errors.map(erro => erro.message).filter(Boolean).join(' | ');
    throw new Error(mensagem || 'A Shopee recusou a consulta.');
  }
  return json;
}

function camposProdutoShopee() {
  return `itemId shopId productName productLink offerLink imageUrl shopName price priceMin priceMax priceDiscountRate sales ratingStar commission commissionRate`;
}

async function consultarProdutoShopeePorIds({ shopId, itemId }) {
  const query = `query ProdutoShopee { productOfferV2(shopId: ${Number(shopId)}, itemId: ${Number(itemId)}, limit: 1) { nodes { ${camposProdutoShopee()} } pageInfo { page limit hasNextPage } } }`;
  const json = await executarConsultaShopee(query);
  return json?.data?.productOfferV2?.nodes?.[0] || null;
}

async function consultarProdutoShopeePorCodigo(codigo) {
  const codigoSeguro = JSON.stringify(limparCodigoShopee(codigo));
  const query = `query ProdutoShopeePorCodigo { productOfferV2(keyword: ${codigoSeguro}, limit: 20) { nodes { ${camposProdutoShopee()} } pageInfo { page limit hasNextPage } } }`;
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

function normalizarProdutoShopee(produto, linkOriginal, linkCompleto, metodoResolucao, codigoInformado = '') {
  const minimo = Number(produto.priceMin || produto.price || 0);
  const maximo = Number(produto.priceMax || produto.price || minimo || 0);
  const descontoPercentual = Number(produto.priceDiscountRate || 0);
  const precoAtualNumero = minimo > 0 ? minimo : maximo;
  const precoAnteriorNumero = descontoPercentual > 0 && precoAtualNumero > 0 && descontoPercentual < 100
    ? precoAtualNumero / (1 - descontoPercentual / 100)
    : 0;

  const temFaixa = minimo > 0 && maximo > 0 && Math.abs(maximo - minimo) > 0.009;
  const linkOferta = limparTexto(produto.offerLink || produto.productLink || linkOriginal || linkCompleto);

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
    linkCompleto,
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
    aviso: temFaixa ? `O anúncio possui variações entre ${formatarMoeda(minimo)} e ${formatarMoeda(maximo)}. O painel usou o menor preço.` : ''
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
    shopeeIdLookup: true,
    shopeeShortLinkConverter: true
  });
});

app.get('/shopee/converter-link', async (req, res) => {
  const link = extrairLink(req.query.url || req.query.link || '');
  if (!link) return res.status(400).json({ ok: false, error: 'Informe o link da Shopee.' });

  const conversao = await converterLinkCurtoShopee(link);
  if (!conversao.ok) {
    return res.status(422).json({
      ok: false,
      error: 'Não foi possível converter o link curto da Shopee.',
      linkOriginal: link,
      ...conversao
    });
  }

  return res.json({ ok: true, linkOriginal: link, ...conversao });
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
    let linkCompleto = '';
    let ids = null;

    if (codigo) {
      const idsDoCodigo = extrairIdsShopee(codigo);
      if (idsDoCodigo) {
        ids = idsDoCodigo;
        produto = await consultarProdutoShopeePorIds(idsDoCodigo);
        metodo = 'id-shop-item';
      } else if (/^\d+$/.test(codigo)) {
        const query = `query ProdutoShopeePorItemId { productOfferV2(itemId: ${Number(codigo)}, limit: 10) { nodes { ${camposProdutoShopee()} } pageInfo { page limit hasNextPage } } }`;
        const json = await executarConsultaShopee(query);
        produto = json?.data?.productOfferV2?.nodes?.[0] || null;
        metodo = 'item-id';
      } else {
        produto = await consultarProdutoShopeePorCodigo(codigo);
        metodo = 'codigo-copiado-keyword';
      }
    }

    if (!produto && link) {
      const conversao = await converterLinkCurtoShopee(link);
      if (conversao.ok) {
        ids = conversao.ids;
        linkCompleto = conversao.linkCompleto;
        produto = await consultarProdutoShopeePorIds(ids);
        metodo = `conversor-${conversao.metodo}`;
      }
    }

    if (!produto) {
      return res.json(respostaFallbackShopee(
        link,
        codigo
          ? 'A API oficial não encontrou um produto correspondente a esse ID copiado no aplicativo.'
          : 'Não consegui converter o link curto nem identificar itemId e shopId.',
        { codigoInformado: codigo, metodoResolucao: metodo || 'sem-correspondencia', linkCompleto }
      ));
    }

    if (!linkCompleto) {
      const idsProduto = ids || { shopId: produto.shopId, itemId: produto.itemId };
      linkCompleto = montarLinkCompleto(idsProduto);
    }

    return res.json(normalizarProdutoShopee(produto, link, linkCompleto, metodo, codigo));
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