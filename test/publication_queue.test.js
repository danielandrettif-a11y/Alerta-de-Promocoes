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
  claimAffiliateJobs,
  releaseExpiredClaims,
  recordAffiliateFailure,
  updateItemStatus,
  summarizeQueue,
  removeDiscardedItems
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
  assert.equal(
    fs.readdirSync(path.dirname(queuePath))
      .some(file => file.endsWith('.tmp')),
    false
  );
});

test('limpa somente ofertas descartadas', () => {
  const first = enqueueOffer(emptyQueue(), sampleOffer());
  const second = enqueueOffer(
    first.queue,
    sampleOffer({ id: 'queue-2', dealId: 'deal_456' })
  );
  const discarded = updateItemStatus(
    second.queue,
    first.item.id,
    STATUSES.DISCARDED
  );
  const result = removeDiscardedItems(discarded.queue);
  assert.deepEqual(result.removed.map(item => item.id), ['queue-1']);
  assert.deepEqual(result.queue.items.map(item => item.id), ['queue-2']);
});

test('reserva exclusiva expira e volta para outro dispositivo', () => {
  const created = enqueueOffer(
    emptyQueue(),
    sampleOffer(),
    new Date('2026-07-23T15:00:00Z')
  );
  const first = claimAffiliateJobs(created.queue, {
    deviceId: 'device_home_01',
    limit: 10,
    leaseMs: 60000
  }, new Date('2026-07-23T15:01:00Z'));
  assert.equal(first.jobs.length, 1);

  const second = claimAffiliateJobs(first.queue, {
    deviceId: 'device_home_02',
    limit: 10,
    leaseMs: 60000
  }, new Date('2026-07-23T15:01:30Z'));
  assert.equal(second.jobs.length, 0);

  const released = releaseExpiredClaims(
    second.queue,
    new Date('2026-07-23T15:02:01Z')
  );
  const third = claimAffiliateJobs(released, {
    deviceId: 'device_home_02',
    limit: 10,
    leaseMs: 60000
  }, new Date('2026-07-23T15:02:02Z'));
  assert.equal(third.jobs.length, 1);
  assert.equal(
    third.jobs[0].affiliateProcessing.claimedBy,
    'device_home_02'
  );
});

test('falhas respeitam autenticacao e limite de tentativas', () => {
  const created = enqueueOffer(emptyQueue(), sampleOffer());
  let claimed = claimAffiliateJobs(created.queue, {
    deviceId: 'device_home_01'
  });
  const authFailure = recordAffiliateFailure(
    claimed.queue,
    claimed.jobs[0].id,
    {
      deviceId: 'device_home_01',
      code: 'AUTH_REQUIRED',
      message: 'Login solicitado.',
      maxAttempts: 2
    }
  );
  assert.equal(authFailure.item.affiliateProcessing.attempts, 0);

  claimed = claimAffiliateJobs(authFailure.queue, {
    deviceId: 'device_home_01'
  });
  const firstFailure = recordAffiliateFailure(
    claimed.queue,
    claimed.jobs[0].id,
    {
      deviceId: 'device_home_01',
      code: 'TIMEOUT',
      message: 'Tempo esgotado.',
      maxAttempts: 2
    }
  );
  claimed = claimAffiliateJobs(firstFailure.queue, {
    deviceId: 'device_home_01',
    maxAttempts: 2
  });
  const lastFailure = recordAffiliateFailure(
    claimed.queue,
    claimed.jobs[0].id,
    {
      deviceId: 'device_home_01',
      code: 'TIMEOUT',
      message: 'Tempo esgotado.',
      maxAttempts: 2
    }
  );
  assert.equal(lastFailure.item.affiliateProcessing.state, 'error');
  assert.equal(claimAffiliateJobs(lastFailure.queue, {
    deviceId: 'device_home_02',
    maxAttempts: 2
  }).jobs.length, 0);

  const manualRetry = claimAffiliateJobs(lastFailure.queue, {
    deviceId: 'device_home_02',
    maxAttempts: 2,
    retryFailed: true
  });
  assert.equal(manualRetry.jobs.length, 1);
  assert.equal(manualRetry.jobs[0].affiliateProcessing.attempts, 1);
  assert.equal(claimAffiliateJobs(manualRetry.queue, {
    deviceId: 'device_home_01',
    maxAttempts: 2,
    retryFailed: true,
    excludeItemIds: [manualRetry.jobs[0].id]
  }).jobs.length, 0);
});
