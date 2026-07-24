const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  generateDealId,
  loadHistory,
  saveHistory,
  getTodayPublishedIds,
  countAutomaticPostsSince,
  selectBestUnpublished,
  getFreshness
} = require('../execution/automation_state.js');

test('mantem o mesmo ID quando preco e desconto mudam', () => {
  const first = {
    platform: 'mercado_livre',
    title: 'Produto',
    link: 'https://produto.mercadolivre.com.br/MLB-123_JM?tracking=1',
    currentPrice: 'R$ 100',
    discount: 20
  };
  const second = {
    ...first,
    link: 'https://produto.mercadolivre.com.br/MLB-123_JM#other',
    currentPrice: 'R$ 90',
    discount: 30
  };
  assert.equal(generateDealId(first), generateDealId(second));
});

test('deduplica somente publicacoes do dia atual', () => {
  const now = new Date('2026-07-23T15:00:00-03:00');
  const deal = {
    platform: 'mercado_livre',
    title: 'Produto',
    link: 'https://produto.mercadolivre.com.br/MLB-123_JM',
    discount: 50
  };
  const dealId = generateDealId(deal);
  const history = {
    publishedIds: [dealId],
    entries: [
      {
        dealId,
        source: 'auto',
        publishedAt: '2026-07-22T15:00:00-03:00'
      }
    ]
  };

  assert.equal(selectBestUnpublished([deal], history, 1, now).length, 1);
  history.entries.push({
    dealId,
    source: 'manual',
    publishedAt: '2026-07-23T09:00:00-03:00'
  });
  assert.equal(selectBestUnpublished([deal], history, 1, now).length, 0);
  assert.equal(getTodayPublishedIds(history, now).has(dealId), true);
});

test('conta somente posts automaticos dentro da janela', () => {
  const history = {
    entries: [
      { source: 'auto', publishedAt: '2026-07-23T14:30:00Z' },
      { source: 'manual', publishedAt: '2026-07-23T14:40:00Z' },
      { source: 'auto', publishedAt: '2026-07-23T13:00:00Z' }
    ]
  };
  assert.equal(
    countAutomaticPostsSince(history, new Date('2026-07-23T14:00:00Z')),
    1
  );
});

test('persiste historico e migra arquivo legado', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-state-'));
  const current = path.join(directory, 'runtime', 'history.json');
  const legacy = path.join(directory, 'legacy.json');
  fs.writeFileSync(legacy, JSON.stringify({
    publishedIds: ['deal_1'],
    entries: [{ dealId: 'deal_1', publishedAt: '2026-07-23T12:00:00Z' }]
  }));

  const migrated = loadHistory(current, legacy);
  assert.equal(migrated.entries.length, 1);
  assert.equal(fs.existsSync(current), true);

  migrated.publishedIds.push('deal_2');
  saveHistory(current, migrated);
  assert.equal(loadHistory(current).publishedIds.includes('deal_2'), true);
});

test('marca dados acima do limite como antigos', () => {
  const now = new Date('2026-07-23T12:00:00Z');
  assert.equal(
    getFreshness('2026-07-23T10:00:00Z', 90, now).isStale,
    true
  );
  assert.equal(
    getFreshness('2026-07-23T11:00:00Z', 90, now).isStale,
    false
  );
});
