import assert from 'node:assert/strict';
import test from 'node:test';
import {
  criarSubIdsRastreamento,
  extrairLinksShopee,
  prepararMensagemRastreada
} from '../shopee-tracking.mjs';

const NOW = new Date('2026-07-31T10:30:00.000Z');

function responseJson(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

test('extrai somente links oficiais da Shopee e remove pontuação final', () => {
  assert.deepEqual(
    extrairLinksShopee('Veja *https://s.shopee.com.br/abc123.* Ignore https://example.com/x e repita https://s.shopee.com.br/abc123'),
    ['https://s.shopee.com.br/abc123']
  );
});

test('gera cinco Sub_ids estáveis e exclusivos por ID real do grupo', () => {
  const comum = { offerId: 'oferta-10', category: 'Calçados', now: NOW };
  const a = criarSubIdsRastreamento({ ...comum, target: { id: '111@g.us', name: 'Feira da Barganha' } });
  const b = criarSubIdsRastreamento({ ...comum, target: { id: '222@g.us', name: 'Feira da Barganha' } });
  const aNovamente = criarSubIdsRastreamento({ ...comum, target: { id: '111@g.us', name: 'Feira da Barganha' } });

  assert.equal(a.length, 5);
  assert.notEqual(a[0], b[0]);
  assert.deepEqual(a, aNovamente);
  assert.ok(a.every(subId => subId.length <= 50 && /^[a-z0-9]+$/.test(subId)));
  assert.deepEqual(a.slice(1), ['ofoferta10', 'catcalcados', 'h0730', 'wa20260731']);
});

test('normaliza categoria com acento e preserva horário/data de São Paulo', () => {
  const subIds = criarSubIdsRastreamento({
    target: { id: '333@g.us', name: 'Grupo Eletrônicos' },
    offerId: 'oferta-11',
    category: 'Eletrônicos',
    now: NOW
  });

  assert.equal(subIds.length, 5);
  assert.equal(subIds[2], 'cateletronicos');
  assert.equal(subIds[3], 'h0730');
  assert.equal(subIds[4], 'wa20260731');
});

test('troca o link de produto Shopee pelo oficial rastreado e envia os cinco Sub_ids', async () => {
  let requestBody = null;
  const resultado = await prepararMensagemRastreada({
    message: '🔥 Oferta\nhttps://shopee.com.br/product/100/200',
    target: { id: '111@g.us', name: 'Grupo Biritiba Mirim' },
    offerId: 'oferta-20',
    category: 'geral',
    now: NOW,
    endpoint: 'https://api.example/shopee/rastrear',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return responseJson(200, { ok: true, shortLink: 'https://s.shopee.com.br/rastreadoA' });
    }
  });

  assert.equal(resultado.record.status, 'tracked');
  assert.equal(resultado.record.subIds.length, 5);
  assert.match(resultado.message, /https:\/\/s\.shopee\.com\.br\/rastreadoA/);
  assert.doesNotMatch(resultado.message, /product\/100\/200/);
  assert.equal(requestBody.originUrl, 'https://shopee.com.br/product/100/200');
  assert.deepEqual(requestBody.subIds, resultado.record.subIds);
  assert.match(requestBody.subIds[0], /^ggrupobiritibamirim[a-f0-9]{6}$/);
});

test('link curto de afiliado Shopee também recebe os cinco Sub_ids', async () => {
  let chamadas = 0;
  let requestBody = null;
  const linkAfiliado = 'https://s.shopee.com.br/abc123';

  const resultado = await prepararMensagemRastreada({
    message: `Oferta ${linkAfiliado}`,
    target: { id: '111@g.us', name: 'Desapega' },
    offerId: 'oferta-21',
    category: 'Casa',
    now: NOW,
    endpoint: 'https://api.example/shopee/rastrear',
    fetchImpl: async (_url, options) => {
      chamadas += 1;
      requestBody = JSON.parse(options.body);
      return responseJson(200, { ok: true, shortLink: 'https://s.shopee.com.br/rastreadoB' });
    }
  });

  assert.equal(chamadas, 1);
  assert.equal(requestBody.originUrl, linkAfiliado);
  assert.equal(resultado.record.status, 'tracked');
  assert.equal(resultado.record.subIds.length, 5);
  assert.equal(resultado.record.subIds[2], 'catcasa');
  assert.match(resultado.message, /rastreadoB/);
});

test('link universal já afiliado da Shopee também é rastreado novamente com nossos Sub_ids', async () => {
  let chamadas = 0;
  let requestBody = null;
  const linkAfiliado = 'https://shopee.com.br/universal-link/product/1/22792809253?utm_source=an_123&utm_medium=affiliates';

  const resultado = await prepararMensagemRastreada({
    message: `Oferta ${linkAfiliado}`,
    target: { id: '222@g.us', name: 'Grupo da Breganha' },
    offerId: 'oferta-22',
    category: 'Moda',
    now: NOW,
    endpoint: 'https://api.example/shopee/rastrear',
    fetchImpl: async (_url, options) => {
      chamadas += 1;
      requestBody = JSON.parse(options.body);
      return responseJson(200, { ok: true, shortLink: 'https://s.shopee.com.br/rastreadoC' });
    }
  });

  assert.equal(chamadas, 1);
  assert.equal(requestBody.originUrl, linkAfiliado);
  assert.equal(requestBody.subIds.length, 5);
  assert.equal(resultado.record.status, 'tracked');
  assert.equal(resultado.record.subIds.length, 5);
  assert.match(resultado.message, /rastreadoC/);
  assert.doesNotMatch(resultado.message, /universal-link/);
});

test('a mesma oferta recebe marcador diferente em cada grupo', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const suffix = body.subIds[0].slice(-6);
    return responseJson(200, { ok: true, shortLink: `https://s.shopee.com.br/${suffix}` });
  };
  const base = {
    message: 'Oferta https://shopee.com.br/product/100/200',
    offerId: 'oferta-30',
    category: 'geral',
    now: NOW,
    fetchImpl,
    endpoint: 'https://api.example/shopee/rastrear'
  };

  const a = await prepararMensagemRastreada({ ...base, target: { id: '111@g.us', name: 'Grupo A' } });
  const b = await prepararMensagemRastreada({ ...base, target: { id: '222@g.us', name: 'Grupo B' } });

  assert.equal(calls.length, 2);
  assert.notEqual(a.record.subIds[0], b.record.subIds[0]);
  assert.notEqual(a.message, b.message);
});

test('reutiliza o link salvo ao tentar reenviar para o mesmo grupo', async () => {
  const existing = {
    status: 'tracked',
    links: [{
      originalUrl: 'https://shopee.com.br/product/100/200',
      shortLink: 'https://s.shopee.com.br/cache123'
    }],
    subIds: ['ggrupoabc123', 'ofoferta40', 'catgeral', 'h0730', 'wa20260731'],
    generatedAt: NOW.toISOString(),
    error: null
  };

  const resultado = await prepararMensagemRastreada({
    message: 'Oferta https://shopee.com.br/product/100/200',
    target: { id: '111@g.us', name: 'Grupo' },
    offerId: 'oferta-40',
    existing,
    fetchImpl: async () => { throw new Error('não deveria chamar a rede'); }
  });

  assert.equal(resultado.record, existing);
  assert.match(resultado.message, /cache123/);
});

test('bloqueia a oferta Shopee quando o serviço de afiliado está indisponível', async () => {
  const message = 'Oferta https://shopee.com.br/product/100/200';
  const promessa = prepararMensagemRastreada({
    message,
    target: { id: '111@g.us', name: 'Grupo' },
    offerId: 'oferta-50',
    now: NOW,
    endpoint: 'https://api.example/shopee/rastrear',
    fetchImpl: async () => responseJson(503, { ok: false, error: 'temporariamente indisponível' })
  });

  await assert.rejects(promessa, /Link de afiliado não gerado; envio bloqueado.*temporariamente indisponível/);
});

test('preserva Mercado Livre sem chamar o rastreador Shopee', async () => {
  let chamadas = 0;
  const linkMercadoLivre = 'https://produto.mercadolivre.com.br/exemplo';
  const resultado = await prepararMensagemRastreada({
    message: `Oferta ${linkMercadoLivre}`,
    fetchImpl: async () => { chamadas += 1; }
  });

  assert.equal(chamadas, 0);
  assert.equal(resultado.record.status, 'not_applicable');
  assert.deepEqual(resultado.record.subIds, []);
  assert.equal(resultado.message, `Oferta ${linkMercadoLivre}`);
});

test('bloqueia mensagem sem nenhuma URL', async () => {
  const promessa = prepararMensagemRastreada({
    message: 'Oferta sem link',
    fetchImpl: async () => { throw new Error('não deveria chamar a rede'); }
  });

  await assert.rejects(promessa, /Oferta sem link/);
});

test('bloqueia mistura de Shopee com outra plataforma na mesma mensagem', async () => {
  const promessa = prepararMensagemRastreada({
    message: 'Oferta https://shopee.com.br/product/100/200 e https://produto.mercadolivre.com.br/exemplo',
    target: { id: '111@g.us', name: 'Grupo' },
    offerId: 'oferta-70',
    fetchImpl: async () => { throw new Error('não deveria chamar a rede'); }
  });

  await assert.rejects(promessa, /misturar plataformas/);
});
