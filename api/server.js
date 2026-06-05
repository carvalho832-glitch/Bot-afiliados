import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
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

const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID;
const SHOPEE_SECRET = process.env.SHOPEE_SECRET;
const SHOPEE_GRAPHQL_URL = process.env.SHOPEE_GRAPHQL_URL || 'https://open-api.affiliate.shopee.com.br/graphql';

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization');
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

  if (p.includes('melatonina') || (p.includes('lavitan') && p.includes('mastig'))) {
    return 'Opção prática para complementar sua rotina noturna, sempre seguindo as orientações de uso do fabricante.';
  }

  if (p.includes('omega') || p.includes('ômega') || p.includes('epa') || p.includes('dha')) {
    return 'Suplemento prático para complementar a rotina de cuidados diários, conforme orientação de uso do fabricante.';
  }

  if (p.includes('cafeína') || p.includes('cafeina')) {
    return 'Opção prática para quem busca incluir cafeína na rotina, respeitando as orientações de uso do fabricante.';
  }

  if (p.includes('vitamina') || p.includes('multivit') || p.includes('lavitan') || p.includes('centrum')) {
    return 'Ajuda a complementar a rotina de cuidados diários de forma simples e prática.';
  }

  if (p.includes('capsula') || p.includes('cápsula') || p.includes('comprimido') || p.includes('suplemento')) {
    return 'Produto prático para complementar a rotina de cuidados, seguindo as informações do rótulo e do fabricante.';
  }

  if (p.includes('tv') || p.includes('smart tv') || p.includes('roku')) {
    return 'Tela maior para curtir filmes, séries, jogos e apps de streaming com mais conforto.';
  }

  if (p.includes('celular') || p.includes('smartphone') || p.includes('galaxy') || p.includes('iphone') || p.includes('motorola') || p.includes('samsung')) {
    return 'Ideal para fotos, vídeos, redes sociais, apps e uso diário com mais praticidade.';
  }

  if (p.includes('notebook') || p.includes('laptop') || p.includes('inspiron') || p.includes('dell')) {
    return 'Boa opção para estudos, trabalho, navegação e tarefas do dia a dia.';
  }

  if (p.includes('cadeira') && (p.includes('auto') || p.includes('carro') || p.includes('bebê') || p.includes('bebe') || p.includes('infantil'))) {
    return 'Mais segurança e conforto para transportar a criança no carro.';
  }

  if (p.includes('sandui') || p.includes('grill') || p.includes('air fryer') || p.includes('panela') || p.includes('cozinha') || p.includes('wap')) {
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

  if (p.includes('bolsa') || p.includes('mochila')) {
    return 'Ajuda a organizar seus itens com mais praticidade no dia a dia.';
  }

  if (p.includes('tênis') || p.includes('tenis') || p.includes('sapato') || p.includes('sandália') || p.includes('sandalia')) {
    return 'Mais conforto e estilo para usar na rotina, passeio ou trabalho.';
  }

  if (p.includes('perfume') || p.includes('creme') || p.includes('hidratante') || p.includes('protetor solar') || p.includes('beleza')) {
    return 'Boa escolha para completar sua rotina de cuidados pessoais com mais praticidade.';
  }

  return 'Oferta selecionada para quem busca praticidade, economia e uma compra segura no site oficial.';
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
  const temBeneficio = msg.includes('✅') || msg.toLowerCase().includes('ideal') || msg.toLowerCase().includes('praticidade') || msg.toLowerCase().includes('conforto') || msg.toLowerCase().includes('rotina');
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

Exemplos de benefício por tipo:
- Melatonina: opção prática para complementar a rotina noturna, seguindo as orientações do fabricante.
- Celular: ideal para fotos, vídeos, redes sociais e apps do dia a dia.
- TV: boa para filmes, séries e streaming com mais conforto.
- Cozinha: ajuda a preparar receitas e lanches com mais praticidade.
- Roupa: peça versátil para montar looks confortáveis.

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

function gerarSha256(texto) {
  return crypto.createHash('sha256').update(String(texto)).digest('hex');
}

function escaparGraphqlString(valor = '') {
  return String(valor)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .trim();
}

function extrairPrimeiroLink(texto = '') {
  return String(texto || '').match(/https?:\/\/[^\s]+/)?.[0] || String(texto || '').trim();
}

function limparKeywordShopee(texto = '') {
  return limparTexto(
    String(texto || '')
      .replace(/https?:\/\/[^\s]+/gi, ' ')
      .replace(/[-_]+/g, ' ')
      .replace(/\b(i|shop|product|br|item|produto)\b/gi, ' ')
      .replace(/\d{5,}/g, ' ')
  ).split(' ').slice(0, 8).join(' ');
}

function keywordPorUrl(url = '') {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname || '')
      .replace(/^\/+/, '')
      .replace(/-i\.\d+\.\d+.*/i, '')
      .replace(/\?.*$/, '')
      .replace(/[/.]+/g, ' ');
    return limparKeywordShopee(path);
  } catch {
    return limparKeywordShopee(url);
  }
}

async function resolverLinkShopee(link) {
  const url = extrairPrimeiroLink(link);
  if (!url) return '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const resposta = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    return resposta?.url || url;
  } catch (erro) {
    console.warn('Não consegui resolver link curto Shopee:', erro.message);
    return url;
  } finally {
    clearTimeout(timer);
  }
}

function montarQueryShopee({ keyword, fields }) {
  const keywordArg = keyword ? `, keyword: "${escaparGraphqlString(keyword)}"` : '';

  return `
    query {
      productOfferV2(
        page: 1,
        limit: 10,
        siteId: 0,
        sortType: 2${keywordArg}
      ) {
        nodes {
          ${fields}
        }
        pageInfo {
          page
          limit
          totalCount
          hasNextPage
        }
      }
    }
  `;
}

function montarCabecalhoShopee(payload, timestamp) {
  const assinatura = gerarSha256(`${SHOPEE_APP_ID}${timestamp}${payload}${SHOPEE_SECRET}`);
  return `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${assinatura}`;
}

function normalizarDinheiroShopee(valor) {
  if (valor === null || valor === undefined || valor === '') return '';

  if (typeof valor === 'string' && /R\$/.test(valor)) {
    return valor.trim();
  }

  const bruto = String(valor).replace(/[^\d.,-]/g, '').trim();
  if (!bruto) return '';

  let numero;
  if (bruto.includes(',') || bruto.includes('.')) {
    numero = Number(bruto.replace(/\./g, '').replace(',', '.'));
  } else {
    numero = Number(bruto);
    if (numero > 100000) numero = numero / 100000;
    else if (numero > 10000) numero = numero / 100;
  }

  if (!Number.isFinite(numero) || numero <= 0) return '';

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function listaProdutosShopee(json) {
  const raiz = json?.data?.productOfferV2 || json?.productOfferV2 || json?.data?.data?.productOfferV2;
  if (!raiz) return [];

  if (Array.isArray(raiz.nodes)) return raiz.nodes;
  if (Array.isArray(raiz.items)) return raiz.items;
  if (Array.isArray(raiz.list)) return raiz.list;
  if (Array.isArray(raiz.rows)) return raiz.rows;
  return [];
}

function escolherProdutoShopee(produtos = [], keyword = '') {
  const lista = produtos.filter(Boolean);
  if (!lista.length) return null;

  const termos = limparTexto(keyword).toLowerCase().split(' ').filter(t => t.length >= 3);

  return lista
    .map(item => {
      const nome = limparTexto(item.productName || item.itemName || item.name || item.title || '');
      const texto = nome.toLowerCase();
      const pontosNome = termos.reduce((total, termo) => total + (texto.includes(termo) ? 1 : 0), 0);
      const vendas = Number(item.sales || item.sold || item.soldCount || 0) || 0;
      const desconto = Number(item.priceDiscountRate || item.discount || 0) || 0;
      return { item, score: pontosNome * 10 + Math.min(vendas, 1000) / 100 + desconto / 10 };
    })
    .sort((a, b) => b.score - a.score)[0]?.item || lista[0];
}

function normalizarProdutoShopee(item, linkOriginal, linkResolvido) {
  const nome = limparTexto(item.productName || item.itemName || item.name || item.title || 'Produto Shopee encontrado');
  const precoMin = item.priceMin ?? item.price ?? item.salePrice ?? item.price_min ?? '';
  const precoMax = item.priceMax ?? item.originalPrice ?? item.price_max ?? '';
  const precoPor = normalizarDinheiroShopee(precoMin || precoMax);
  const precoDe = normalizarDinheiroShopee(precoMax && precoMax !== precoMin ? precoMax : '');
  const descontoNumero = Number(item.priceDiscountRate || item.discount || 0) || 0;
  const desconto = descontoNumero > 0 ? `${Math.round(descontoNumero)}% OFF` : '';
  const linkOferta = limparTexto(item.offerLink || item.productLink || item.link || item.url || linkOriginal || linkResolvido);
  const cupom = desconto || '';

  return {
    ok: true,
    loja: 'Shopee',
    produto: nome,
    precoDe,
    precoPor,
    desconto,
    cupom,
    link: linkOriginal || linkOferta,
    linkOferta,
    imagem: limparTexto(item.imageUrl || item.image || item.imgUrl || ''),
    vendas: item.sales || item.sold || item.soldCount || '',
    comissao: item.commissionRate || item.commission || '',
    itemId: item.itemId || item.item_id || '',
    origem: 'shopee-api'
  };
}

async function consultarShopeeProductOffer({ keyword, linkOriginal, linkResolvido }) {
  if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
    throw new Error('SHOPEE_APP_ID ou SHOPEE_SECRET não configurados no Render.');
  }

  const camposTentativa = [
    'itemId productName price priceMin priceMax imageUrl offerLink productLink commissionRate commission sales priceDiscountRate shopName ratingStar',
    'itemId productName priceMin priceMax imageUrl offerLink productLink priceDiscountRate sales',
    'itemId productName priceMin priceMax offerLink productLink'
  ];

  let ultimoErro = null;

  for (const fields of camposTentativa) {
    const query = montarQueryShopee({ keyword, fields });
    const payload = JSON.stringify({ query });
    const timestamp = Math.floor(Date.now() / 1000);

    const resposta = await fetch(SHOPEE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ['Author' + 'ization']: montarCabecalhoShopee(payload, timestamp)
      },
      body: payload
    });

    let json = null;
    try {
      json = await resposta.json();
    } catch {
      json = null;
    }

    if (!resposta.ok || json?.errors?.length) {
      const mensagemErro = json?.errors?.[0]?.message || json?.errors?.[0]?.extensions?.message || `Shopee respondeu HTTP ${resposta.status}`;
      ultimoErro = new Error(mensagemErro);
      console.error('Tentativa Shopee falhou:', mensagemErro);
      continue;
    }

    const produtos = listaProdutosShopee(json);
    const escolhido = escolherProdutoShopee(produtos, keyword);

    if (escolhido) {
      return normalizarProdutoShopee(escolhido, linkOriginal, linkResolvido);
    }

    ultimoErro = new Error('Shopee respondeu, mas não retornou produtos para essa busca.');
  }

  throw ultimoErro || new Error('Não consegui consultar a API da Shopee.');
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou API',
    model: GEMINI_MODEL,
    fallbackModels: FALLBACK_MODELS,
    message: 'API Gemini funcionando 🚀',
    rotas: ['/health', '/teste-gemini', 'GET /shopee/produto?url=LINK', 'POST /gerar-mensagem']
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Achou Levou API',
    model: GEMINI_MODEL,
    fallbackModels: FALLBACK_MODELS,
    shopee: {
      configured: Boolean(SHOPEE_APP_ID && SHOPEE_SECRET),
      url: SHOPEE_GRAPHQL_URL
    }
  });
});

app.get('/shopee/produto', async (req, res) => {
  const linkOriginal = extrairPrimeiroLink(req.query.url || req.query.link || '');

  if (!linkOriginal) {
    return res.status(400).json({
      ok: false,
      error: 'Informe o link da Shopee no parâmetro url.'
    });
  }

  try {
    const linkResolvido = await resolverLinkShopee(linkOriginal);
    const keyword = limparTexto(req.query.keyword || keywordPorUrl(linkResolvido) || keywordPorUrl(linkOriginal));

    if (!keyword) {
      return res.status(400).json({
        ok: false,
        error: 'Não consegui identificar uma palavra-chave no link da Shopee.',
        linkResolvido
      });
    }

    const produto = await consultarShopeeProductOffer({
      keyword,
      linkOriginal,
      linkResolvido
    });

    res.json({
      ...produto,
      keyword,
      linkResolvido
    });
  } catch (erro) {
    console.error('Erro ao puxar produto Shopee:', erro);
    res.status(500).json({
      ok: false,
      error: 'Erro ao puxar dados da Shopee.',
      detalhe: erro.message
    });
  }
});

app.get('/gerar-mensagem', (req, res) => {
  res.json({
    ok: false,
    message: 'Esta rota funciona via POST. Para testar no navegador, use /teste-gemini.'
  });
});

app.get('/teste-gemini', async (req, res) => {
  const dadosTeste = {
    produto: 'Lavitan Melatonina 0,21mg 150 Comprimidos Mastigáveis Maracujá',
    precoDe: 'R$ 28,90',
    precoPor: 'R$ 19,88',
    desconto: '31% OFF',
    cupom: '',
    loja: 'Mercado Livre',
    link: 'https://meli.la/teste'
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
    rotasDisponiveis: ['/', '/health', '/teste-gemini', 'GET /shopee/produto?url=LINK', 'POST /gerar-mensagem']
  });
});

app.listen(PORT, () => {
  console.log(`Achou Levou API rodando na porta ${PORT} usando ${GEMINI_MODEL}`);
});
