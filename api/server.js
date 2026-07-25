import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const SHOPEE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';
const MICROLINK_API_URL = 'https://api.microlink.io';

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

function decodificarVariasVezes(valor = '') {
  let atual = String(valor || '');

  for (let i = 0; i < 4; i += 1) {
    try {
      const decodificado = decodeURIComponent(atual);
      if (decodificado === atual) break;
      atual = decodificado;
    } catch {
      break;
    }
  }

  return atual.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
}

function extrairUrlsDoTexto(texto = '') {
  const conteudo = decodificarVariasVezes(texto);
  const urls = conteudo.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
  return [...new Set(urls.map(url => url.replace(/[),.;]+$/, '')))];
}

function extrairDestinoDeParametros(link = '') {
  try {
    const url = new URL(link);
    const chaves = ['url', 'target', 'target_url', 'redirect', 'redirect_url', 'destination', 'deep_link', 'deeplink', 'original_url'];

    for (const chave of chaves) {
      const valor = url.searchParams.get(chave);
      if (valor) {
        const candidato = decodificarVariasVezes(valor);
        if (/^https?:\/\//i.test(candidato)) return candidato;
      }
    }
  } catch {
    return '';
  }

  return '';
}

function extrairIdsShopee(link) {
  const url = decodificarVariasVezes(String(link || ''));

  const padroes = [
    /\/product\/(\d+)\/(\d+)/i,
    /-i\.(\d+)\.(\d+)/i,
    /[?&]shopid=(\d+).*?[?&]itemid=(\d+)/i,
    /[?&]shop_id=(\d+).*?[?&]item_id=(\d+)/i,
    /[?&]shopId=(\d+).*?[?&]itemId=(\d+)/i
  ];

  for (const padrao of padroes) {
    const match = url.match(padrao);
    if (match) return { shopId: match[1], itemId: match[2] };
  }

  const itemPrimeiro = url.match(/[?&]itemid=(\d+).*?[?&]shopid=(\d+)/i) ||
    url.match(/[?&]item_id=(\d+).*?[?&]shop_id=(\d+)/i) ||
    url.match(/[?&]itemId=(\d+).*?[?&]shopId=(\d+)/i);

  if (itemPrimeiro) return { shopId: itemPrimeiro[2], itemId: itemPrimeiro[1] };
  return null;
}

async function resolverLinkShopee(link) {
  const visitados = new Set();
  const candidatos = [link];
  let ultimoLink = link;

  while (candidatos.length && visitados.size < 10) {
    const atual = candidatos.shift();
    if (!atual || visitados.has(atual)) continue;

    visitados.add(atual);
    ultimoLink = atual;

    const idsDiretos = extrairIdsShopee(atual);
    if (idsDiretos) return { linkExpandido: atual, ids: idsDiretos, metodo: 'redirect-http' };

    const destinoParametro = extrairDestinoDeParametros(atual);
    if (destinoParametro && !visitados.has(destinoParametro)) candidatos.unshift(destinoParametro);

    try {
      const resposta = await fetch(atual, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        }
      });

      const location = resposta.headers.get('location');
      if (location) {
        const proximo = new URL(location, atual).toString();
        if (!visitados.has(proximo)) candidatos.unshift(proximo);
      }

      if (resposta.url && resposta.url !== atual && !visitados.has(resposta.url)) {
        candidatos.unshift(resposta.url);
      }

      const tipo = resposta.headers.get('content-type') || '';
      if (/text|html|json|javascript/i.test(tipo)) {
        const corpo = await resposta.text();
        const urls = extrairUrlsDoTexto(corpo)
          .filter(url => /shopee\.com\.br|shp\.ee|s\.shopee\.com\.br/i.test(url));

        const metaRefresh = corpo.match(/http-equiv=["']?refresh["']?[^>]*content=["'][^;]+;\s*url=([^"']+)/i)?.[1];
        if (metaRefresh) urls.unshift(new URL(decodificarVariasVezes(metaRefresh), atual).toString());

        const canonical = corpo.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] ||
          corpo.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i)?.[1];
        if (canonical) urls.unshift(new URL(decodificarVariasVezes(canonical), atual).toString());

        for (const url of urls) {
          const ids = extrairIdsShopee(url);
          if (ids) return { linkExpandido: url, ids, metodo: 'html-http' };
          if (!visitados.has(url)) candidatos.push(url);
        }
      }
    } catch (erro) {
      console.warn('Falha ao resolver etapa do link Shopee:', atual, erro.message);
    }
  }

  return { linkExpandido: ultimoLink, ids: extrairIdsShopee(ultimoLink), metodo: 'http-sem-ids' };
}

async function resolverLinkViaNavegador(link) {
  try {
    const url = new URL(MICROLINK_API_URL);
    url.searchParams.set('url', link);
    url.searchParams.set('prerender', 'true');
    url.searchParams.set('ttl', '0');

    const resposta = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const json = await resposta.json().catch(() => null);
    if (!resposta.ok || json?.status !== 'success') {
      throw new Error(json?.message || `Navegador remoto respondeu HTTP ${resposta.status}.`);
    }

    const candidatos = [
      json?.data?.url,
      json?.data?.canonical?.url,
      json?.data?.author?.url,
      ...extrairUrlsDoTexto(JSON.stringify(json || {}))
    ].filter(Boolean);

    for (const candidato of candidatos) {
      const limpo = decodificarVariasVezes(candidato);
      const ids = extrairIdsShopee(limpo);
      if (ids) {
        return {
          linkExpandido: limpo,
          ids,
          metodo: 'navegador-remoto',
          tituloDetectado: limparTexto(json?.data?.title || '')
        };
      }
    }

    return {
      linkExpandido: limparTexto(json?.data?.url || link),
      ids: null,
      metodo: 'navegador-remoto-sem-ids',
      tituloDetectado: limparTexto(json?.data?.title || '')
    };
  } catch (erro) {
    console.warn('Falha no navegador remoto para link Shopee:', erro.message);
    return {
      linkExpandido: link,
      ids: null,
      metodo: 'navegador-remoto-erro',
      erro: erro.message
    };
  }
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
      pageInfo { page limit hasNextPage }
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
  if (!resposta.ok) throw new Error(`Shopee respondeu com HTTP ${resposta.status}.`);

  if (json?.errors?.length) {
    const mensagem = json.errors.map(erro => erro.message).filter(Boolean).join(' | ');
    throw new Error(mensagem || 'A Shopee recusou a consulta.');
  }

  const produto = json?.data?.productOfferV2?.nodes?.[0];
  if (!produto) throw new Error('Produto não encontrado na lista de ofertas da API da Shopee.');
  return produto;
}

function normalizarProdutoShopee(produto, linkOriginal, linkExpandido, metodoResolucao) {
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
    linkExpandido,
    metodoResolucao,
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
    shopeeConfigured: Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET)
  });
});

app.get('/shopee/produto', async (req, res) => {
  const link = extrairLink(req.query.url || req.query.link || '');

  if (!link) {
    return res.status(400).json({ ok: false, error: 'Informe o link da Shopee.' });
  }

  try {
    let resolucao = await resolverLinkShopee(link);

    if (!resolucao.ids) {
      const resolucaoNavegador = await resolverLinkViaNavegador(link);
      if (resolucaoNavegador.ids || resolucaoNavegador.linkExpandido !== link) {
        resolucao = resolucaoNavegador;
      }
    }

    if (!resolucao.ids) {
      return res.json(respostaFallbackShopee(
        link,
        'Não consegui identificar itemId e shopId mesmo usando o navegador remoto para abrir o link curto.',
        {
          linkExpandido: resolucao.linkExpandido,
          metodoResolucao: resolucao.metodo,
          tituloDetectado: resolucao.tituloDetectado || '',
          detalheResolucao: resolucao.erro || ''
        }
      ));
    }

    const produto = await consultarProdutoShopee(resolucao.ids);
    return res.json(normalizarProdutoShopee(
      produto,
      link,
      resolucao.linkExpandido,
      resolucao.metodo
    ));
  } catch (error) {
    console.error('Erro na API oficial da Shopee:', error);
    return res.json(respostaFallbackShopee(
      link,
      `A API oficial da Shopee não retornou os dados: ${error.message}`
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