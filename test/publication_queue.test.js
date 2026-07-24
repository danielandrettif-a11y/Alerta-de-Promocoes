const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  STATUSES,
  emptyQueue,
  loadQueue,
  saveQueue,
  validateAffiliateLink,
  enqueueOffer,
  setAffiliateLink,
  updateItemStatus,
  summarizeQueue
} = require('../execution/publication_queue.js');

function sampleOffer(overrides = {}) {
  return {
    id: 'queue-1',
    dealId: 'deal_123',
    platform: 'mercado_livre',
    title: 'Fone Bluetooth',
    originalPrice: 'R$ 299,90',
    currentPrice: 'R$ 199,90',
    discount: 33,
    image: 'https://http2.mlstatic.com/product.jpg',
    productLink: 'https://produto.mercadolivre.com.br/MLB-123_JM',
    storyFile: 'queue-1.jpg',
    ...overrides
  };
}

test('aceita somente link afiliado HTTPS no dominio exato meli.la', () => {
  assert.equal(
    validateAffiliateLink('https://meli.la/ABC123'),
    'https://meli.la/ABC123'
  );
  assert.throws(
    () => validateAffiliateLink('http://meli.la/ABC123'),
    /HTTPS/
  );
  assert.throws(
    () => validateAffiliateLink('https://meli.la.example.com/ABC123'),
    /dominio meli\.la/
  );
  assert.throws(
    () => validateAffiliateLink('https://meli.la:444/ABC123'),
    /HTTPS/
  );
  assert.throws(
    () => validateAffiliateLink('https://meli.la/'),
    /codigo/
  );
});

test('cria item aguardando link e evita duplicata ativa', () => {
  const now = new Date('2026-07-23T15:00:00Z');
  const first = enqueueOffer(emptyQueue(), sampleOffer(), now);
  assert.equal(first.created, true);
  assert.equal(first.item.status, STATUSES.AWAITING_AFFILIATE);

  const duplicate = enqueueOffer(first.queue, sampleOffer({
    id: 'queue-2'
  }), now);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.item.id, 'queue-1');
  assert.equal(duplicate.queue.items.length, 1);
});

test('link valido deixa oferta pronta e revisao impede publicacao', () => {
  const now = new Date('2026-07-23T15:00:00Z');
  const created = enqueueOffer(emptyQueue(), sampleOffer(), now);
  const ready = setAffiliateLink(
    created.queue,
    created.item.id,
    'https://meli.la/ABC123',
    {},
    now
  );
  assert.equal(ready.item.status, STATUSES.READY);

  const published = updateItemStatus(
    ready.queue,
    ready.item.id,
    STATUSES.PUBLISHED,
    now
  );
  assert.equal(published.item.status, STATUSES.PUBLISHED);

  const second = enqueueOffer(
    published.queue,
    sampleOffer({ id: 'queue-2', dealId: 'deal_456' }),
    now
  );
  const review = setAffiliateLink(
    second.queue,
    second.item.id,
    'https://meli.la/DEF456',
    { reviewReason: 'Preco mudou.', latestPrice: 'R$ 189,90' },
    now
  );
  assert.equal(review.item.status, STATUSES.NEEDS_REVIEW);
  assert.throws(
    () => updateItemStatus(
      review.queue,
      review.item.id,
      STATUSES.PUBLISHED,
      now
    ),
    /oferta pronta/
  );

  const discarded = updateItemStatus(
    review.queue,
    review.item.id,
    STATUSES.DISCARDED,
    now
  );
  const restored = updateItemStatus(
    discarded.queue,
    discarded.item.id,
    'restore',
    now
  );
  assert.equal(restored.item.status, STATUSES.NEEDS_REVIEW);
});

test('persiste a fila e resume os estados', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-queue-'));
  const queuePath = path.join(directory, 'runtime', 'queue.json');
  const created = enqueueOffer(
    emptyQueue(),
    sampleOffer(),
    new Date('2026-07-23T15:00:00Z')
  );
  saveQueue(queuePath, created.queue);

  const loaded = loadQueue(queuePath);
  assert.equal(loaded.items.length, 1);
  assert.deepEqual(summarizeQueue(loaded), {
    total: 1,
    awaitingAffiliate: 1,
    ready: 0,
    needsReview: 0,
    published: 0,
    discarded: 0,
    expired: 0
  });
});
