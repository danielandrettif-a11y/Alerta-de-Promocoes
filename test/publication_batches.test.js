const test = require('node:test');
const assert = require('node:assert/strict');

const {
  safeFileStem,
  createBatchRecord,
  buildLinksText,
  buildOffersCsv,
  isSafeBatchId
} = require('../execution/publication_batches.js');

function readyQueue() {
  return {
    items: [{
      id: 'queue-1',
      status: 'ready',
      title: 'Cafeteira Elétrica 220V / Edição Especial',
      originalPrice: 'R$ 399,90',
      currentPrice: 'R$ 249,90',
      discount: 38,
      productLink: 'https://produto.mercadolivre.com.br/MLB-1',
      affiliateLink: 'https://meli.la/ABC123',
      storyFile: 'queue-1.jpg'
    }]
  };
}

test('gera lote com nomes seguros, links e CSV completos', () => {
  const batch = createBatchRecord(
    readyQueue(),
    { itemIds: ['queue-1'], name: 'Ofertas da manhã' },
    new Date('2026-07-29T12:00:00Z')
  );
  assert.equal(
    batch.items[0].imageFile,
    '01-cafeteira-eletrica-220v-edicao-especial.jpg'
  );
  assert.match(buildLinksText(batch), /01 - Cafeteira Elétrica/);
  assert.match(buildLinksText(batch), /https:\/\/meli\.la\/ABC123/);
  const csv = buildOffersCsv(batch);
  assert.match(csv, /"ordem","titulo","preco_original"/);
  assert.match(csv, /"R\$ 249,90"/);
  assert.match(csv, /"01-cafeteira-eletrica-220v-edicao-especial\.jpg"/);
});

test('bloqueia nomes inseguros e path traversal', () => {
  assert.equal(safeFileStem('../../Meu Produto:*?'), 'meu-produto');
  assert.equal(isSafeBatchId('../../etc/passwd'), false);
  assert.equal(
    isSafeBatchId('batch_2026-07-29_123e4567-e89b-12d3-a456-426614174000'),
    true
  );
});

test('rejeita lote com item que ainda nao esta pronto', () => {
  const queue = readyQueue();
  queue.items[0].status = 'awaiting_affiliate';
  assert.throws(
    () => createBatchRecord(queue, { itemIds: ['queue-1'] }),
    /somente ofertas prontas/
  );
});
