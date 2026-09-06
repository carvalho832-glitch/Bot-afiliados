import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWhatsAppSentAudit,
  safeSentWhatsAppMessage
} from '../whatsapp-history-audit.mjs';

test('mantém somente mensagens enviadas pelo próprio bot e sanitiza links', () => {
  const own = safeSentWhatsAppMessage({
    fromMe: true,
    timestamp: 1788620400,
    body: '🔥 Produto\nhttps://s.shopee.com.br/abc123?utm_source=teste#frag'
  }, 'Desapega', 'America/Sao_Paulo');

  const other = safeSentWhatsAppMessage({
    fromMe: false,
    timestamp: 1788620400,
    body: 'Mensagem de participante'
  }, 'Desapega', 'America/Sao_Paulo');

  assert.equal(other, null);
  assert.equal(own.group, 'Desapega');
  assert.equal(own.urls[0], 'https://s.shopee.com.br/abc123');
  assert.doesNotMatch(own.message, /utm_source|#frag/);
});

test('filtra por data e grupo sem expor id real do grupo', async () => {
  const chats = {
    '111@g.us': {
      async fetchMessages() {
        return [
          { fromMe: true, timestamp: 1788620400, body: 'Oferta A https://s.shopee.com.br/a?x=1' },
          { fromMe: false, timestamp: 1788620460, body: 'Resposta de participante' }
        ];
      }
    },
    '222@g.us': {
      async fetchMessages() {
        return [
          { fromMe: true, timestamp: 1788620400, body: 'Oferta B https://s.shopee.com.br/b' }
        ];
      }
    }
  };

  const client = {
    async getChatById(id) {
      return chats[id];
    }
  };

  const result = await buildWhatsAppSentAudit({
    client,
    groups: [
      { id: '111@g.us', name: 'Desapega' },
      { id: '222@g.us', name: 'Feira da Barganha' }
    ],
    date: '2026-09-05',
    group: 'Desapega',
    limitPerGroup: 50,
    timeZone: 'America/Sao_Paulo'
  });

  const json = JSON.stringify(result);
  assert.deepEqual(result.groupsChecked, ['Desapega']);
  assert.equal(result.matched, 1);
  assert.equal(result.items[0].group, 'Desapega');
  assert.doesNotMatch(json, /111@g\.us|222@g\.us/);
  assert.doesNotMatch(json, /Resposta de participante/);
});
