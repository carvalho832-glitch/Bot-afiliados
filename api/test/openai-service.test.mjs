import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarMensagemComOpenAI } from '../openai-service.mjs';

function respostaOpenAI(criacao) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    async text() {
      return JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify(criacao)
          }]
        }]
      });
    }
  };
}

test('gera a oferta com a Responses API e Structured Outputs', async () => {
  let requisicao = null;
  const fetchImpl = async (url, init) => {
    requisicao = { url, init, body: JSON.parse(init.body) };
    return respostaOpenAI({
      titulo: 'Travesseiro macio para noites mais confortáveis',
      gancho: 'Acordar cansado pode deixar o dia inteiro mais pesado.',
      beneficio: 'Mais aconchego para relaxar e aproveitar melhor cada noite.',
      cta: 'GARANTA O SEU AGORA'
    });
  };

  const resultado = await gerarMensagemComOpenAI({
    produto: 'Travesseiro Penas e Plumas de Ganso',
    precoDe: 'R$ 33,73',
    precoPor: 'R$ 19,90',
    cupom: '',
    link: 'https://s.shopee.com.br/exemplo'
  }, {
    clientId: 'teste-openai-sucesso',
    apiKey: 'chave-de-teste',
    model: 'gpt-5.6-luna',
    fetchImpl
  });

  assert.equal(resultado.provider, 'openai');
  assert.equal(resultado.model, 'gpt-5.6-luna');
  assert.equal(resultado.fallback, false);
  assert.match(resultado.mensagem, /🔥 \*Travesseiro macio/);
  assert.match(resultado.mensagem, /❌ De: ~R\$ 33,73~/);
  assert.match(resultado.mensagem, /💰 \*POR APENAS: R\$ 19,90\*/);
  assert.match(resultado.mensagem, /https:\/\/s\.shopee\.com\.br\/exemplo/);
  assert.doesNotMatch(resultado.mensagem, /Cupom|Frete grátis/);

  assert.equal(requisicao.url, 'https://api.openai.com/v1/responses');
  assert.equal(requisicao.init.headers.Authorization, 'Bearer chave-de-teste');
  assert.equal(requisicao.body.store, false);
  assert.equal(requisicao.body.text.format.type, 'json_schema');
  assert.equal(requisicao.body.text.format.strict, true);
  assert.deepEqual(
    requisicao.body.text.format.schema.required,
    ['titulo', 'gancho', 'beneficio', 'cta']
  );
});

test('usa fallback local seguro quando a chave da OpenAI não está configurada', async () => {
  const resultado = await gerarMensagemComOpenAI({
    produto: 'Air Fryer 4 litros',
    precoPor: 'R$ 199,90',
    link: 'https://exemplo.com/oferta'
  }, {
    clientId: 'teste-openai-sem-chave',
    apiKey: ' '
  });

  assert.equal(resultado.provider, 'local');
  assert.equal(resultado.fallback, true);
  assert.match(resultado.warning, /OPENAI_API_KEY não configurada/);
  assert.match(resultado.mensagem, /Air Fryer 4 litros/);
  assert.match(resultado.mensagem, /R\$ 199,90/);
});

test('rejeita geração sem produto antes de chamar o provedor', async () => {
  await assert.rejects(
    gerarMensagemComOpenAI({ link: 'https://exemplo.com/oferta' }, {
      clientId: 'teste-openai-sem-produto',
      apiKey: 'chave-de-teste',
      fetchImpl: async () => {
        throw new Error('não deveria chamar a rede');
      }
    }),
    error => error?.statusCode === 400 && /nome do produto/i.test(error.message)
  );
});
