const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MISSING_PRICE_REVIEW,
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
  removeDiscardedItems,
  removeItems,
  validateQueueItems,
  priceToCents
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
    {
      reviewReason: 'Preco mudou.',
      latestPrice: 'R$ 189,90',
      reviewUpdatedStory: true
    },
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
  const approved = updateItemStatus(
    restored.queue,
    restored.item.id,
    'approve_review',
    now
  );
  assert.equal(approved.item.status, STATUSES.READY);
  assert.equal(approved.item.reviewReason, null);
});

test('aceita Amazon somente no dominio brasileiro com tag de afiliado', () => {
  assert.equal(
    validateAffiliateLink(
      'https://www.amazon.com.br/dp/B000000001?tag=alertadesc0dd-20',
      'amazon'
    ),
    'https://www.amazon.com.br/dp/B000000001?tag=alertadesc0dd-20'
  );
  assert.throws(
    () => validateAffiliateLink(
      'https://www.amazon.com.br.evil.example/dp/B000000001?tag=x',
      'amazon'
    ),
    /Amazon Brasil/
  );
  assert.throws(
    () => validateAffiliateLink(
      'https://www.amazon.com.br/dp/B000000001',
      'amazon'
    ),
    /tag de afiliado/
  );
});

test('FutFanatics aceita somente deep link Awin do programa oficial', () => {
  const productLink =
    'https://www.futfanatics.com.br/camisa-palmeiras-i-2026';
  const affiliateLink =
    'https://www.awin1.com/cread.php?awinmid=17893&awinaffid=123456&ued=' +
    encodeURIComponent(productLink);

  assert.equal(
    validateAffiliateLink(affiliateLink, 'futfanatics'),
    affiliateLink
  );
  assert.throws(
    () => validateAffiliateLink(productLink, 'futfanatics'),
    /deep link afiliado da Awin/
  );
  assert.throws(
    () => validateAffiliateLink(
      affiliateLink.replace('awinmid=17893', 'awinmid=20084'),
      'futfanatics'
    ),
    /17893/
  );

  const created = enqueueOffer(emptyQueue(), sampleOffer({
    platform: 'futfanatics',
    productLink,
    affiliateLink
  }));
  assert.equal(created.item.affiliateLink, affiliateLink);
  assert.equal(created.item.status, STATUSES.AWAITING_AFFILIATE);
});

test('preserva a prova de preco recebida da extensao', () => {
  const now = new Date('2026-08-04T12:00:00Z');
  const created = enqueueOffer(emptyQueue(), sampleOffer(), now);
  const result = setAffiliateLink(
    created.queue,
    created.item.id,
    'https://meli.la/ABC123',
    {
      priceVerification: {
        regularPrice: 199.9,
        finalPrice: 179.9,
        source: 'extension',
        verifiedAt: now.toISOString(),
        productId: 'MLB123'
      }
    },
    now
  );
  assert.deepEqual(result.item.priceVerification, {
    regularPrice: 199.9,
    finalPrice: 179.9,
    source: 'extension',
    verifiedAt: now.toISOString(),
    productId: 'MLB123',
    sellerId: null,
    variationId: null
  });
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
  assert.equal(loaded.revision, 1);
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

  const stale = structuredClone(loaded);
  loaded.items[0].title = 'Fone atualizado';
  saveQueue(queuePath, loaded);
  assert.equal(loadQueue(queuePath).revision, 2);
  assert.equal(fs.existsSync(`${queuePath}.bak`), true);
  assert.throws(
    () => saveQueue(queuePath, stale),
    /alterada por outra operacao/
  );
});

test('arquivo de fila invalido falha sem ser substituido por fila vazia', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-queue-'));
  const queuePath = path.join(directory, 'queue.json');
  fs.writeFileSync(queuePath, '{json incompleto', 'utf8');

  assert.throws(() => loadQueue(queuePath), /fila persistida esta invalida/i);
  assert.equal(fs.readFileSync(queuePath, 'utf8'), '{json incompleto');
});

test('aceita produto e link afiliado oficiais da Shopee', () => {
  const created = enqueueOffer(emptyQueue(), sampleOffer({
    platform: 'shopee',
    productLink: 'https://shopee.com.br/produto-i.123.456'
  }));
  const ready = setAffiliateLink(
    created.queue,
    created.item.id,
    'https://s.shopee.com.br/AUso2xdRXP'
  );
  assert.equal(ready.item.status, STATUSES.READY);
  assert.throws(
    () => validateAffiliateLink(
      'https://s.shopee.com.br.example.com/AUso2xdRXP',
      'shopee'
    ),
    /s\.shopee\.com\.br/
  );
  assert.throws(
    () => enqueueOffer(emptyQueue(), sampleOffer({
      platform: 'shopee',
      productLink: 'https://example.com/produto'
    })),
    /Shopee Brasil/
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

test('remove somente os itens selecionados da fila', () => {
  const first = enqueueOffer(emptyQueue(), sampleOffer());
  const second = enqueueOffer(
    first.queue,
    sampleOffer({ id: 'queue-2', dealId: 'deal_456' })
  );
  const result = removeItems(second.queue, ['queue-1']);
  assert.deepEqual(result.removed.map(item => item.id), ['queue-1']);
  assert.deepEqual(result.queue.items.map(item => item.id), ['queue-2']);
  assert.throws(() => removeItems(second.queue, []), /Selecione/);
});

test('valida a fila preservando ausente e separando Story alterado', () => {
  const first = enqueueOffer(emptyQueue(), sampleOffer());
  const second = enqueueOffer(
    first.queue,
    sampleOffer({ id: 'queue-2', dealId: 'deal_456' })
  );
  const ready = setAffiliateLink(
    second.queue,
    first.item.id,
    'https://meli.la/ABC123'
  );
  const catalog = new Map([[
    'deal_123',
    sampleOffer({
      currentPrice: 'R$ 179,90',
      discount: 40
    })
  ]]);
  const result = validateQueueItems(ready.queue, catalog);

  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.missing.map(item => item.id), ['queue-2']);
  assert.equal(result.queue.items.some(item => item.id === 'queue-2'), true);
  assert.equal(
    result.queue.items.find(item => item.id === 'queue-2').validation.state,
    'not_found'
  );
  assert.equal(result.updated.length, 1);
  assert.equal(result.updated[0].item.status, STATUSES.NEEDS_REVIEW);
  assert.equal(result.updated[0].item.reviewUpdatedStory, true);
  assert.equal(result.updated[0].item.currentPrice, 'R$ 179,90');
});

test('catálogo confirmado libera revisão de preço ausente da Shopee', () => {
  const created = enqueueOffer(emptyQueue(), sampleOffer({
    platform: 'shopee',
    productLink: 'https://shopee.com.br/product/1/2'
  }));
  const review = setAffiliateLink(
    created.queue,
    created.item.id,
    'https://s.shopee.com.br/ABC123',
    { reviewReason: MISSING_PRICE_REVIEW }
  );
  const catalog = new Map([['deal_123', sampleOffer({
    platform: 'shopee',
    productLink: 'https://shopee.com.br/product/1/2'
  })]]);
  const result = validateQueueItems(review.queue, catalog);

  assert.equal(result.queue.items[0].status, STATUSES.READY);
  assert.equal(result.queue.items[0].reviewReason, null);
  assert.equal(result.queue.items[0].priceVerification.source, 'catalog');
});

test('validação parcial preserva plataforma sem catálogo', () => {
  const mercadoLivre = enqueueOffer(emptyQueue(), sampleOffer());
  const withAmazon = enqueueOffer(
    mercadoLivre.queue,
    sampleOffer({
      id: 'queue-amazon',
      dealId: 'deal_amazon',
      platform: 'amazon',
      productLink: 'https://www.amazon.com.br/dp/B000000001'
    })
  );
  const catalog = new Map([['deal_123', sampleOffer()]]);
  const result = validateQueueItems(withAmazon.queue, catalog, {
    platforms: new Set(['mercado_livre'])
  });

  assert.equal(result.removed.length, 0);
  assert.equal(result.queue.items.some(item => item.id === 'queue-amazon'), true);
  assert.equal(result.unchanged, 1);
  assert.equal(result.skipped, 1);
});

test('compara formatos equivalentes de preco em centavos', () => {
  assert.equal(priceToCents('R$ 1.234,56'), 123456);
  assert.equal(priceToCents('1234.56'), 123456);
  assert.equal(priceToCents(1234.56), 123456);

  const created = enqueueOffer(emptyQueue(), sampleOffer({
    currentPrice: 'R$ 199,90'
  }));
  const catalog = new Map([['deal_123', sampleOffer({
    currentPrice: '199.90'
  })]]);
  const result = validateQueueItems(created.queue, catalog);
  assert.equal(result.updated.length, 0);
  assert.equal(result.unchanged, 1);
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
  const portalFailure = recordAffiliateFailure(
    claimed.queue,
    claimed.jobs[0].id,
    {
      deviceId: 'device_home_01',
      code: 'SHOPEE_MENU_NOT_FOUND',
      message: 'Menu da Shopee indisponível.',
      maxAttempts: 2
    }
  );
  assert.equal(portalFailure.item.affiliateProcessing.attempts, 0);

  claimed = claimAffiliateJobs(portalFailure.queue, {
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
