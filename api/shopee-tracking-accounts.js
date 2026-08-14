import crypto from 'node:crypto';

function limpar(valor = '') {
  return String(valor || '').trim();
}

function comparacaoSegura(recebido = '', esperado = '') {
  const a = Buffer.from(limpar(recebido));
  const b = Buffer.from(limpar(esperado));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function contaDoAmbiente(env, perfil, prefixo, tokenKey) {
  return {
    perfil,
    token: limpar(env[tokenKey]),
    appId: limpar(env[`${prefixo}_APP_ID`]),
    secret: limpar(env[`${prefixo}_SECRET`])
  };
}

export function listarContasShopee(env = process.env) {
  return [
    contaDoAmbiente(env, 'julio', 'SHOPEE_JULIO', 'SHOPEE_TRACKING_TOKEN_JULIO'),
    contaDoAmbiente(env, 'renata', 'SHOPEE_RENATA', 'SHOPEE_TRACKING_TOKEN_RENATA')
  ].filter(conta => conta.token);
}

export function resolverContaShopee({
  authorization = '',
  basicAuthorization = '',
  env = process.env
} = {}) {
  const recebido = limpar(authorization);

  for (const conta of listarContasShopee(env)) {
    if (comparacaoSegura(recebido, `Bearer ${conta.token}`)) {
      return { ...conta, configurada: Boolean(conta.appId && conta.secret), legado: false };
    }
  }

  const tokenLegado = limpar(env.SHOPEE_TRACKING_TOKEN);
  const autorizacaoLegada = tokenLegado ? `Bearer ${tokenLegado}` : limpar(basicAuthorization);
  if (autorizacaoLegada && comparacaoSegura(recebido, autorizacaoLegada)) {
    const appId = limpar(env.SHOPEE_APP_ID);
    const secret = limpar(env.SHOPEE_SECRET);
    return {
      perfil: 'legado',
      token: tokenLegado,
      appId,
      secret,
      configurada: Boolean(appId && secret),
      legado: true
    };
  }

  return null;
}
