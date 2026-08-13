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

test('troca o link original pelo oficial rastreado e envia os Sub_ids do grupo', async () => {
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
  assert.match(resultado.message, /https:\/\/s\.shopee\.com\.br\/rastreadoA/);
  assert.doesNotMatch(resultado.message, /product\/100\/200/);
  assert.equal(requestBody.originUrl, 'https://shopee.com.br/product/100/200');
  assert.deepEqual(requestBody.subIds, resultado.record.subIds);
  assert.match(requestBody.subIds[0], /^ggrupobiritibamirim[a-f0-9]{6}$/);
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
    subIds: ['ggrupoabc123'],
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

test('bloqueia o envio quando o serviço de afiliado está indisponível', async () => {
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

test('bloqueia ofertas sem link da Shopee', async () => {
  let chamadas = 0;
  const message = 'Oferta https://produto.mercadolivre.com.br/exemplo';
  const promessa = prepararMensagemRastreada({
    message,
    fetchImpl: async () => { chamadas += 1; }
  });

  assert.equal(chamadas, 0);
  await assert.rejects(promessa, /Oferta sem link oficial da Shopee/);
});

test('preserva o mesmo link copiado do painel de afiliados', async () => {
  let chamadas = 0;
  const linkAfiliado = 'https://shopee.com.br/universal-link/product/1/22792809253?utm_source=an_123&utm_medium=affiliates';
  const resultado = await prepararMensagemRastreada({
    message: `Oferta ${linkAfiliado}`,
    target: { id: '111@g.us', name: 'Grupo' },
    offerId: 'oferta-60',
    endpoint: 'https://api.example/shopee/rastrear',
    fetchImpl: async () => { chamadas += 1; }
  });

  assert.equal(resultado.record.status, 'preserved');
  assert.equal(resultado.message, `Oferta ${linkAfiliado}`);
  assert.equal(chamadas, 0);
});
