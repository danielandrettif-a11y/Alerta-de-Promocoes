const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATUSES = Object.freeze({
  AWAITING_AFFILIATE: 'awaiting_affiliate',
  READY: 'ready',
  NEEDS_REVIEW: 'needs_review',
  PUBLISHED: 'published',
  DISCARDED: 'discarded',
  EXPIRED: 'expired'
});

const ACTIVE_STATUSES = new Set([
  STATUSES.AWAITING_AFFILIATE,
  STATUSES.READY,
  STATUSES.NEEDS_REVIEW
]);

function emptyQueue() {
  return {
    version: 1,
    items: []
  };
}

function normalizeQueue(queue) {
  return {
    version: 1,
    items: Array.isArray(queue?.items) ? queue.items : []
  };
}

function loadQueue(queuePath) {
  if (!fs.existsSync(queuePath)) return emptyQueue();
  try {
    return normalizeQueue(
      JSON.parse(fs.readFileSync(queuePath, 'utf-8'))
    );
  } catch {
    return emptyQueue();
  }
}

function saveQueue(queuePath, queue) {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(
    queuePath,
    JSON.stringify(normalizeQueue(queue), null, 2),
    'utf-8'
  );
}

function normalizeHttpsUrl(rawValue, fieldName) {
  let parsed;
  try {
    parsed = new URL(String(rawValue || '').trim());
  } catch {
    throw new Error(`${fieldName} invalido.`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error(
      `${fieldName} deve usar HTTPS, sem credenciais ou portas personalizadas.`
    );
  }
  return parsed;
}

function validateAffiliateLink(rawValue) {
  const parsed = normalizeHttpsUrl(rawValue, 'Link afiliado');
  if (parsed.hostname.toLowerCase() !== 'meli.la') {
    throw new Error('Use um link afiliado oficial no dominio meli.la.');
  }
  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('O link afiliado precisa conter o codigo do produto.');
  }
  if (parsed.hash) {
    throw new Error('O link afiliado nao pode conter fragmentos.');
  }
  return parsed.toString();
}

function normalizeProductLink(rawValue) {
  const parsed = normalizeHttpsUrl(rawValue, 'Link do produto');
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname !== 'mercadolivre.com.br' &&
    !hostname.endsWith('.mercadolivre.com.br')
  ) {
    throw new Error('O produto precisa apontar para o Mercado Livre Brasil.');
  }
  return parsed.toString();
}

function findItem(queue, itemId) {
  return normalizeQueue(queue).items.find(item => item.id === itemId) || null;
}

function enqueueOffer(queue, input, now = new Date()) {
  const normalized = normalizeQueue(queue);
  const dealId = String(input?.dealId || '').trim();
  const title = String(input?.title || '').trim();
  if (!dealId || !title) {
    throw new Error('Oferta sem identificacao ou titulo.');
  }

  const duplicate = normalized.items.find(item =>
    item.dealId === dealId && ACTIVE_STATUSES.has(item.status)
  );
  if (duplicate) {
    return { queue: normalized, item: duplicate, created: false };
  }

  const platform = String(input.platform || '').toLowerCase();
  if (platform !== 'mercado_livre') {
    throw new Error('A fila afiliada aceita somente ofertas do Mercado Livre.');
  }

  const timestamp = now.toISOString();
  const item = {
    id: String(input.id || crypto.randomUUID()),
    dealId,
    platform,
    status: STATUSES.AWAITING_AFFILIATE,
    title,
    originalPrice: String(input.originalPrice || ''),
    currentPrice: String(input.currentPrice || ''),
    discount: Number(input.discount) || 0,
    image: String(input.image || ''),
    productLink: normalizeProductLink(input.productLink),
    storyFile: String(input.storyFile || ''),
    affiliateLink: null,
    reviewReason: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    readyAt: null,
    publishedAt: null
  };
  normalized.items.unshift(item);
  return { queue: normalized, item, created: true };
}

function setAffiliateLink(
  queue,
  itemId,
  rawLink,
  options = {},
  now = new Date()
) {
  const normalized = normalizeQueue(queue);
  const item = findItem(normalized, itemId);
  if (!item) throw new Error('Item da fila nao encontrado.');
  if (!ACTIVE_STATUSES.has(item.status)) {
    throw new Error('Este item nao aceita mais alteracoes no link.');
  }

  item.affiliateLink = validateAffiliateLink(rawLink);
  item.updatedAt = now.toISOString();
  item.reviewReason = options.reviewReason || null;
  item.latestPrice = options.latestPrice || null;
  if (item.reviewReason) {
    item.status = STATUSES.NEEDS_REVIEW;
    item.readyAt = null;
  } else {
    item.status = STATUSES.READY;
    item.readyAt = item.updatedAt;
  }
  return { queue: normalized, item };
}

function updateItemStatus(queue, itemId, nextStatus, now = new Date()) {
  const normalized = normalizeQueue(queue);
  const item = findItem(normalized, itemId);
  if (!item) throw new Error('Item da fila nao encontrado.');

  if (nextStatus === STATUSES.PUBLISHED) {
    if (item.status !== STATUSES.READY) {
      throw new Error('Somente uma oferta pronta pode ser marcada como publicada.');
    }
    item.status = nextStatus;
    item.publishedAt = now.toISOString();
  } else if (nextStatus === STATUSES.DISCARDED) {
    if (!ACTIVE_STATUSES.has(item.status)) {
      throw new Error('Somente uma oferta ativa pode ser descartada.');
    }
    item.status = nextStatus;
  } else if (nextStatus === 'restore') {
    if (item.status !== STATUSES.DISCARDED) {
      throw new Error('Somente uma oferta descartada pode ser restaurada.');
    }
    item.status = item.reviewReason
      ? STATUSES.NEEDS_REVIEW
      : item.affiliateLink
        ? STATUSES.READY
        : STATUSES.AWAITING_AFFILIATE;
  } else {
    throw new Error('Transicao de status nao permitida.');
  }

  item.updatedAt = now.toISOString();
  return { queue: normalized, item };
}

function summarizeQueue(queue) {
  const summary = {
    total: 0,
    awaitingAffiliate: 0,
    ready: 0,
    needsReview: 0,
    published: 0,
    discarded: 0,
    expired: 0
  };
  for (const item of normalizeQueue(queue).items) {
    summary.total += 1;
    if (item.status === STATUSES.AWAITING_AFFILIATE) summary.awaitingAffiliate += 1;
    if (item.status === STATUSES.READY) summary.ready += 1;
    if (item.status === STATUSES.NEEDS_REVIEW) summary.needsReview += 1;
    if (item.status === STATUSES.PUBLISHED) summary.published += 1;
    if (item.status === STATUSES.DISCARDED) summary.discarded += 1;
    if (item.status === STATUSES.EXPIRED) summary.expired += 1;
  }
  return summary;
}

module.exports = {
  STATUSES,
  emptyQueue,
  normalizeQueue,
  loadQueue,
  saveQueue,
  validateAffiliateLink,
  enqueueOffer,
  setAffiliateLink,
  updateItemStatus,
  summarizeQueue
};
