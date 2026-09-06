import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAuditOffers,
  safeAuditItem,
  sanitizeAuditMessage,
  sanitizeAuditUrl
} from '../audit-utils.mjs';

test('remove query string e fragmento dos links expostos na auditoria', () => {
  assert.equal(
    sanitizeAuditUrl('https://s.shopee.com.br/abc123?utm_source=teste#frag'),
    'https://s.shopee.com.br/abc123'
  );
  assert.equal(
    sanitizeAuditMessage('Oferta https://produto.mercadolivre.com.br/MLB-123?matt_tool=abc'),
    'Oferta https://produto.mercadolivre.com.br/MLB-123'
  );
});

test('não expõe IDs reais dos grupos no item de auditoria', () => {
  const item = safeAuditItem({
    id: 'oferta-1',
    message: '🔥 Produto\nR$ 39,90\nhttps://s.shopee.com.br/abc?secret=1',
    category: 'casa',
    status: 'sent',
    targets: [
      { id: '111111@g.us', name: 'Desapega' },
      { id: '222222@g.us', name: 'Feira da Barganha' }
    ],
    sentTargets: ['111111@g.us'],
    trackingByTarget: {
      '111111@g.us': {
        status: 'tracked',
        subIds: ['gdesapegaabc123', 'ofoferta1', 'catcasa', 'h1100', 'wa20260905'],
        generatedAt: '2026-09-05T14:00:00.000Z'
      }
    }
  });

  const json = JSON.stringify(item);
  assert.deepEqual(item.groups, ['Desapega', 'Feira da Barganha']);
  assert.deepEqual(item.sentGroups, ['Desapega']);
  assert.equal(item.tracking[0].group, 'Desapega');
  assert.equal(item.tracking[0].subIds.length, 5);
  assert.doesNotMatch(json, /111111@g\.us|222222@g\.us/);
  assert.doesNotMatch(json, /secret=1/);
});

test('filtra ofertas pela data local de São Paulo', () => {
  const queue = [
    {
      id: 'oferta-dia-5',
      message: 'Produto A https://s.shopee.com.br/a',
      category: 'geral',
      status: 'sent',
      sentAt: '2026-09-06T02:30:00.000Z'
    },
    {
      id: 'oferta-dia-6',
      message: 'Produto B https://s.shopee.com.br/b',
      category: 'geral',
      status: 'sent',
      sentAt: '2026-09-06T03:30:00.000Z'
    }
  ];

  const result = buildAuditOffers(queue, {
    date: '2026-09-05',
    timeZone: 'America/Sao_Paulo'
  });

  assert.equal(result.matched, 1);
  assert.equal(result.items[0].id, 'oferta-dia-5');
});

test('limita a saída e aceita filtros de status e categoria', () => {
  const queue = [
    { id: '1', message: 'A https://s.shopee.com.br/a', status: 'sent', category: 'casa', sentAt: '2026-09-05T15:00:00Z' },
    { id: '2', message: 'B https://s.shopee.com.br/b', status: 'sent', category: 'moda', sentAt: '2026-09-05T16:00:00Z' },
    { id: '3', message: 'C https://s.shopee.com.br/c', status: 'pending', category: 'casa', sentAt: '2026-09-05T17:00:00Z' }
  ];

  const result = buildAuditOffers(queue, { status: 'sent', category: 'casa', limit: 1 });
  assert.equal(result.matched, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, '1');
});
