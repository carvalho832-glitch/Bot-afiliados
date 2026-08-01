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
    message: '🔥 Oferta\nhttps://s.shopee.com.br/original',
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
  assert.doesNotMatch(resultado.message, /\/original/);
  assert.equal(requestBody.originUrl, 'https://s.shopee.com.br/original');
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
    message: 'Oferta https://s.shopee.com.br/original',
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
      originalUrl: 'https://s.shopee.com.br/original',
      shortLink: 'https://s.shopee.com.br/cache123'
    }],
    subIds: ['ggrupoabc123'],
    generatedAt: NOW.toISOString(),
    error: null
  };

  const resultado = await prepararMensagemRastreada({
    message: 'Oferta https://s.shopee.com.br/original',
    target: { id: '111@g.us', name: 'Grupo' },
    offerId: 'oferta-40',
    existing,
    fetchImpl: async () => { throw new Error('não deveria chamar a rede'); }
  });

  assert.equal(resultado.record, existing);
  assert.match(resultado.message, /cache123/);
});

test('mantém o link original quando o serviço está indisponível', async () => {
  const message = 'Oferta https://s.shopee.com.br/original';
  const resultado = await prepararMensagemRastreada({
    message,
    target: { id: '111@g.us', name: 'Grupo' },
    offerId: 'oferta-50',
    now: NOW,
    endpoint: 'https://api.example/shopee/rastrear',
    fetchImpl: async () => responseJson(503, { ok: false, error: 'temporariamente indisponível' })
  });

  assert.equal(resultado.record.status, 'fallback');
  assert.equal(resultado.message, message);
  assert.match(resultado.record.error, /temporariamente indisponível/);
});

test('não chama o serviço para ofertas de outras plataformas', async () => {
  let chamadas = 0;
  const message = 'Oferta https://produto.mercadolivre.com.br/exemplo';
  const resultado = await prepararMensagemRastreada({
    message,
    fetchImpl: async () => { chamadas += 1; }
  });

  assert.equal(chamadas, 0);
  assert.equal(resultado.record.status, 'not_applicable');
  assert.equal(resultado.message, message);
});
