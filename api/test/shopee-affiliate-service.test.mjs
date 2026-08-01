import assert from 'node:assert/strict';
import test from 'node:test';
import {
  criarAutorizacaoShopee,
  criarPayloadGerarLink,
  gerarLinkRastreadoShopee,
  normalizarSubIds
} from '../shopee-affiliate-service.js';

test('normaliza no máximo cinco Sub_ids aceitos pela Shopee', () => {
  assert.deepEqual(
    normalizarSubIds(['Grupo São José 🚀', 'Oferta 123', 'Calçados', '07:30', 'WhatsApp 31/07/2026', 'ignorado']),
    ['grupo_sao_jose', 'oferta_123', 'calcados', '07_30', 'whatsapp_31_07_2026']
  );
});

test('monta a mutação oficial sem interpolar conteúdo fora de strings GraphQL', () => {
  const resultado = criarPayloadGerarLink({
    originUrl: 'https://shopee.com.br/product/123/456?x=1',
    subIds: ['grupo_teste', 'oferta_1']
  });
  const body = JSON.parse(resultado.payload);

  assert.match(body.query, /generateShortLink/);
  assert.match(body.query, /originUrl: "https:\/\/shopee\.com\.br\/product\/123\/456\?x=1"/);
  assert.match(body.query, /subIds: \["grupo_teste","oferta_1"\]/);
});

test('assina o mesmo payload de forma determinística', () => {
  const autorizacao = criarAutorizacaoShopee({
    appId: '12345',
    secret: 'segredo',
    payload: '{"query":"teste"}',
    timestamp: 1700000000
  });

  assert.equal(
    autorizacao,
    'SHA256 Credential=12345, Timestamp=1700000000, Signature=8059d2c12a1c0bd2073eca41e2c02a19fbc8c396b31ebc624ccedd102d5cfbb8'
  );
});

test('gera e aceita somente um link curto oficial da Shopee Brasil', async () => {
  let request = null;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { generateShortLink: { shortLink: 'https://s.shopee.com.br/abc123' } } })
    };
  };

  const resultado = await gerarLinkRastreadoShopee({
    originUrl: 'https://shopee.com.br/product/123/456',
    subIds: ['grupo_a', 'oferta_1'],
    appId: '12345',
    secret: 'segredo',
    fetchImpl
  });

  assert.equal(resultado.shortLink, 'https://s.shopee.com.br/abc123');
  assert.deepEqual(resultado.subIds, ['grupo_a', 'oferta_1']);
  assert.equal(request.options.method, 'POST');
  assert.match(request.options.headers.Authorization, /^SHA256 Credential=12345, Timestamp=\d+, Signature=[a-f0-9]{64}$/);
  assert.match(JSON.parse(request.options.body).query, /generateShortLink/);
});

test('recusa origem externa antes de chamar a API', async () => {
  let chamadas = 0;
  await assert.rejects(
    gerarLinkRastreadoShopee({
      originUrl: 'https://exemplo.com/produto',
      subIds: ['grupo_a'],
      appId: '1',
      secret: '2',
      fetchImpl: async () => { chamadas += 1; }
    }),
    /somente endereços oficiais da Shopee/
  );
  assert.equal(chamadas, 0);
});

test('recusa resposta que não usa o domínio oficial curto', async () => {
  await assert.rejects(
    gerarLinkRastreadoShopee({
      originUrl: 'https://shopee.com.br/product/123/456',
      subIds: ['grupo_a'],
      appId: '1',
      secret: '2',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { generateShortLink: { shortLink: 'https://encurtador.example/abc' } } })
      })
    }),
    /domínio curto oficial brasileiro/
  );
});
