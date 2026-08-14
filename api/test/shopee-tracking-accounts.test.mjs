import test from 'node:test';
import assert from 'node:assert/strict';
import { listarContasShopee, resolverContaShopee } from '../shopee-tracking-accounts.js';

const env = {
  SHOPEE_JULIO_APP_ID: 'app-julio',
  SHOPEE_JULIO_SECRET: 'secret-julio',
  SHOPEE_TRACKING_TOKEN_JULIO: 'token-julio',
  SHOPEE_RENATA_APP_ID: 'app-renata',
  SHOPEE_RENATA_SECRET: 'secret-renata',
  SHOPEE_TRACKING_TOKEN_RENATA: 'token-renata',
  SHOPEE_APP_ID: 'app-legado',
  SHOPEE_SECRET: 'secret-legado',
  SHOPEE_TRACKING_TOKEN: 'token-legado'
};

test('lista somente contas que possuem token próprio', () => {
  const contas = listarContasShopee({
    ...env,
    SHOPEE_TRACKING_TOKEN_RENATA: ''
  });

  assert.deepEqual(contas.map(conta => conta.perfil), ['julio']);
});

test('token do Júlio seleciona somente as credenciais do Júlio', () => {
  const conta = resolverContaShopee({ authorization: 'Bearer token-julio', env });

  assert.equal(conta.perfil, 'julio');
  assert.equal(conta.appId, 'app-julio');
  assert.equal(conta.secret, 'secret-julio');
  assert.equal(conta.configurada, true);
  assert.equal(conta.legado, false);
});

test('token da Renata seleciona somente as credenciais da Renata', () => {
  const conta = resolverContaShopee({ authorization: 'Bearer token-renata', env });

  assert.equal(conta.perfil, 'renata');
  assert.equal(conta.appId, 'app-renata');
  assert.equal(conta.secret, 'secret-renata');
  assert.equal(conta.configurada, true);
  assert.equal(conta.legado, false);
});

test('mantém compatibilidade com o token antigo durante a migração', () => {
  const conta = resolverContaShopee({ authorization: 'Bearer token-legado', env });

  assert.equal(conta.perfil, 'legado');
  assert.equal(conta.appId, 'app-legado');
  assert.equal(conta.legado, true);
});

test('mantém compatibilidade Basic somente com a autorização esperada', () => {
  const conta = resolverContaShopee({
    authorization: 'Basic abc123',
    basicAuthorization: 'Basic abc123',
    env: { SHOPEE_APP_ID: 'app', SHOPEE_SECRET: 'secret' }
  });

  assert.equal(conta.perfil, 'legado');
  assert.equal(conta.configurada, true);
  assert.equal(resolverContaShopee({
    authorization: 'Basic errado',
    basicAuthorization: 'Basic abc123',
    env
  }), null);
});

test('identifica perfil autenticado que ainda está sem credenciais', () => {
  const conta = resolverContaShopee({
    authorization: 'Bearer token-renata',
    env: {
      SHOPEE_TRACKING_TOKEN_RENATA: 'token-renata',
      SHOPEE_RENATA_APP_ID: '',
      SHOPEE_RENATA_SECRET: ''
    }
  });

  assert.equal(conta.perfil, 'renata');
  assert.equal(conta.configurada, false);
});
