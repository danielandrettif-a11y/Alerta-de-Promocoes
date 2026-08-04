const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { saveJsonAtomic } = require('./json_store.js');

const QUEUE_VERSION = 2;

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

const AFFILIATE_PROCESSING_STATES = Object.freeze({
  PENDING: 'pending',
  CLAIMED: 'claimed',
  ERROR: 'error',
  COMPLETED: 'completed'
});

const NON_ATTEMPT_FAILURE_CODES = new Set([
  'AUTH_REQUIRED',
  'SHOPEE_ACCOUNT_ACTION_REQUIRED',
  'SHOPEE_PORTAL_NOT_READY',
  'SHOPEE_CONVERTER_NOT_REACHED',
  'SHOPEE_MENU_NOT_FOUND',
  'SHOPEE_INPUT_NOT_FOUND',
  'SHOPEE_GENERATE_BUTTON_NOT_FOUND',
  'CANCELLED'
]);

function emptyAffiliateProcessing() {
  return {
    state: AFFILIATE_PROCESSING_STATES.PENDING,
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    attempts: 0,
    lastError: null,
    completedAt: null
  };
}

function normalizeAffiliateProcessing(item) {
  const current = item?.affiliateProcessing || {};
  return {
    ...emptyAffiliateProcessing(),
    ...current,
    attempts: Math.max(0, Number(current.attempts) || 0)
  };
}

function emptyQueue() {
  return {
    version: QUEUE_VERSION,
    revision: 0,
    items: []
  };
}

function normalizeQueue(queue) {
  return {
    version: QUEUE_VERSION,
    revision: Math.max(0, Number(queue?.revision) || 0),
    items: Array.isArray(queue?.items)
      ? queue.items.map(item => ({
        ...item,
        affiliateProcessing: normalizeAffiliateProcessing(item)
      }))
      : []
  };
}

function loadQueue(queuePath) {
  if (!fs.existsSync(queuePath)) return emptyQueue();
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      throw new Error('estrutura sem uma lista de itens');
    }
    return normalizeQueue(parsed);
  } catch (error) {
    const queueError = new Error(
      `A fila persistida esta invalida e foi preservada sem alteracoes: ${error.message}`
    );
    queueError.code = 'QUEUE_READ_FAILED';
    throw queueError;
  }
}

function saveQueue(queuePath, queue) {
  const normalized = normalizeQueue(queue);
  const persisted = fs.existsSync(queuePath)
    ? loadQueue(queuePath)
    : emptyQueue();
  if (normalized.revision !== persisted.revision) {
    const conflict = new Error(
      'A fila foi alterada por outra operacao. Atualize os dados e tente novamente.'
    );
    conflict.code = 'QUEUE_REVISION_CONFLICT';
    throw conflict;
  }
  if (fs.existsSync(queuePath)) {
    fs.copyFileSync(queuePath, `${queuePath}.bak`);
  }
  normalized.revision = persisted.revision + 1;
  saveJsonAtomic(queuePath, normalized);
  queue.version = normalized.version;
  queue.revision = normalized.revision;
  return normalized;
}

function priceToCents(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }
  let normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .trim();
  if (!normalized) return 0;
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  const decimalIndex = Math.max(comma, dot);
  if (decimalIndex >= 0 && normalized.length - decimalIndex - 1 === 2) {
    normalized = `${normalized.slice(0, decimalIndex).replace(/[.,]/g, '')}.` +
      normalized.slice(decimalIndex + 1);
  } else {
    normalized = normalized.replace(/[.,]/g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
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

function validateAffiliateLink(rawValue, platform = 'mercado_livre') {
  const parsed = normalizeHttpsUrl(rawValue, 'Link afiliado');
  if (platform === 'amazon') {
    if (!parsed.hostname.toLowerCase().includes('amazon.com.br')) {
      throw new Error('Use um link valido da Amazon Brasil.');
    }
    return parsed.toString();
  }
  const hostname = platform === 'shopee' ? 's.shopee.com.br' : 'meli.la';
  if (parsed.hostname.toLowerCase() !== hostname) {
    throw new Error(`Use um link afiliado oficial no dominio ${hostname}.`);
  }
  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('O link afiliado precisa conter o codigo do produto.');
  }
  if (parsed.hash) {
    throw new Error('O link afiliado nao pode conter fragmentos.');
  }
  return parsed.toString();
}

function normalizeProductLink(rawValue, platform) {
  const parsed = normalizeHttpsUrl(rawValue, 'Link do produto');
  const hostname = parsed.hostname.toLowerCase();
  const valid = platform === 'shopee'
    ? ['shopee.com.br', 'www.shopee.com.br'].includes(hostname)
    : platform === 'amazon'
      ? ['amazon.com.br', 'www.amazon.com.br'].includes(hostname)
      : hostname === 'mercadolivre.com.br' ||
        hostname.endsWith('.mercadolivre.com.br');
  if (!valid) {
    throw new Error(
      `O produto precisa apontar para ${
        platform === 'shopee' ? 'a Shopee Brasil' : platform === 'amazon' ? 'a Amazon Brasil' : 'o Mercado Livre Brasil'
      }.`
    );
  }
  return parsed.toString();
}

function findItem(queue, itemId) {
  return (Array.isArray(queue?.items) ? queue.items : [])
    .find(item => item.id === itemId) || null;
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
  if (!['mercado_livre', 'shopee', 'amazon'].includes(platform)) {
    throw new Error('A fila afiliada aceita Mercado Livre, Shopee ou Amazon.');
  }

  const timestamp = now.toISOString();
  const productLink = normalizeProductLink(input.productLink, platform);
  
  // Se for Amazon, já é afiliado automaticamente com a tag
  const isAmazon = platform === 'amazon';
  const status = isAmazon ? STATUSES.READY : STATUSES.AWAITING_AFFILIATE;
  const affiliateLink = isAmazon ? productLink : null;

  const item = {
    id: String(input.id || crypto.randomUUID()),
    dealId,
    platform,
    status,
    title,
    originalPrice: String(input.originalPrice || ''),
    currentPrice: String(input.currentPrice || ''),
    discount: Number(input.discount) || 0,
    image: String(input.image || ''),
    productLink,
    storyFile: String(input.storyFile || ''),
    affiliateLink,
    coupon: input.coupon || null,
    affiliateProcessing: isAmazon ? {
      ...emptyAffiliateProcessing(),
      state: AFFILIATE_PROCESSING_STATES.COMPLETED,
      completedAt: timestamp
    } : emptyAffiliateProcessing(),
    reviewReason: null,
    reviewUpdatedStory: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    readyAt: isAmazon ? timestamp : null,
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

  item.affiliateLink = validateAffiliateLink(rawLink, item.platform);
  item.updatedAt = now.toISOString();
  item.reviewReason = options.reviewReason || null;
  item.reviewUpdatedStory = options.reviewUpdatedStory === true;
  item.latestPrice = options.latestPrice || null;
  if (item.reviewReason) {
    item.status = STATUSES.NEEDS_REVIEW;
    item.readyAt = null;
  } else {
    item.status = STATUSES.READY;
    item.readyAt = item.updatedAt;
  }
  item.affiliateProcessing = {
    ...normalizeAffiliateProcessing(item),
    state: AFFILIATE_PROCESSING_STATES.COMPLETED,
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastError: null,
    completedAt: item.updatedAt
  };
  return { queue: normalized, item };
}

function releaseExpiredClaims(queue, now = new Date()) {
  const normalized = normalizeQueue(queue);
  const nowMs = now.getTime();
  for (const item of normalized.items) {
    const processing = normalizeAffiliateProcessing(item);
    if (
      processing.state === AFFILIATE_PROCESSING_STATES.CLAIMED &&
      new Date(processing.claimExpiresAt || 0).getTime() <= nowMs
    ) {
      item.affiliateProcessing = {
        ...processing,
        state: AFFILIATE_PROCESSING_STATES.PENDING,
        claimedBy: null,
        claimedAt: null,
        claimExpiresAt: null,
        lastError: {
          code: 'CLAIM_EXPIRED',
          message: 'A reserva expirou e o item voltou para a fila.',
          at: now.toISOString()
        }
      };
    }
  }
  return normalized;
}

function claimAffiliateJobs(
  queue,
  {
    deviceId,
    limit = 10,
    leaseMs = 5 * 60 * 1000,
    maxAttempts = 3,
    excludeItemIds = [],
    retryFailed = false
  },
  now = new Date()
) {
  const normalized = releaseExpiredClaims(queue, now);
  const claimant = String(deviceId || '').trim();
  if (!claimant) throw new Error('deviceId obrigatorio.');
  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 10));
  const excluded = new Set(
    (Array.isArray(excludeItemIds) ? excludeItemIds : [])
      .slice(0, 1000)
      .map(String)
  );
  const expiresAt = new Date(now.getTime() + leaseMs).toISOString();
  const jobs = normalized.items.filter(item => {
    const processing = normalizeAffiliateProcessing(item);
    const sameDeviceClaim = Boolean(claimant && processing.claimedBy === claimant);
    const manuallyRetriable =
      retryFailed &&
      (processing.state === AFFILIATE_PROCESSING_STATES.ERROR ||
       processing.state === AFFILIATE_PROCESSING_STATES.CLAIMED ||
       sameDeviceClaim);
    return (
      !excluded.has(item.id) &&
      item.status === STATUSES.AWAITING_AFFILIATE &&
      (
        (
          processing.state === AFFILIATE_PROCESSING_STATES.PENDING &&
          processing.attempts < maxAttempts
        ) ||
        sameDeviceClaim ||
        manuallyRetriable
      )
    );
  }).slice(0, safeLimit);

  for (const item of jobs) {
    const processing = normalizeAffiliateProcessing(item);
    item.affiliateProcessing = {
      ...processing,
      state: AFFILIATE_PROCESSING_STATES.CLAIMED,
      claimedBy: claimant,
      claimedAt: now.toISOString(),
      claimExpiresAt: expiresAt,
      attempts: processing.state === AFFILIATE_PROCESSING_STATES.ERROR
        ? Math.max(0, maxAttempts - 1)
        : processing.attempts,
      lastError: null
    };
  }
  return { queue: normalized, jobs };
}

function assertClaimOwner(item, deviceId, now) {
  const processing = normalizeAffiliateProcessing(item);
  if (
    processing.state !== AFFILIATE_PROCESSING_STATES.CLAIMED ||
    processing.claimedBy !== deviceId
  ) {
    throw new Error('Este item nao esta reservado para este dispositivo.');
  }
  if (new Date(processing.claimExpiresAt || 0).getTime() <= now.getTime()) {
    throw new Error('A reserva deste item expirou.');
  }
  return processing;
}

function recordAffiliateFailure(
  queue,
  itemId,
  { deviceId, code, message, maxAttempts = 3 },
  now = new Date()
) {
  const normalized = normalizeQueue(queue);
  const item = findItem(normalized, itemId);
  if (!item) throw new Error('Item da fila nao encontrado.');
  const processing = assertClaimOwner(item, deviceId, now);
  const doesNotConsumeAttempt = NON_ATTEMPT_FAILURE_CODES.has(code);
  const attempts = processing.attempts + (doesNotConsumeAttempt ? 0 : 1);
  item.affiliateProcessing = {
    ...processing,
    state: attempts >= maxAttempts
      ? AFFILIATE_PROCESSING_STATES.ERROR
      : AFFILIATE_PROCESSING_STATES.PENDING,
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    attempts,
    lastError: {
      code: String(code || 'UNKNOWN_ERROR'),
      message: String(message || 'Falha sem detalhes.').slice(0, 500),
      at: now.toISOString()
    }
  };
  item.updatedAt = now.toISOString();
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
  } else if (nextStatus === 'approve_review') {
    if (
      item.status !== STATUSES.NEEDS_REVIEW ||
      !item.affiliateLink ||
      item.reviewUpdatedStory !== true
    ) {
      throw new Error('Somente um Story revisado pode ser aprovado.');
    }
    item.status = STATUSES.READY;
    item.reviewReason = null;
    item.reviewUpdatedStory = false;
    item.latestPrice = null;
    item.readyAt = now.toISOString();
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

function removeDiscardedItems(queue) {
  const normalized = normalizeQueue(queue);
  const removed = normalized.items.filter(item =>
    item.status === STATUSES.DISCARDED
  );
  normalized.items = normalized.items.filter(item =>
    item.status !== STATUSES.DISCARDED
  );
  return { queue: normalized, removed };
}

function removeItems(queue, itemIds) {
  const normalized = normalizeQueue(queue);
  const ids = new Set(
    (Array.isArray(itemIds) ? itemIds : [])
      .slice(0, 1000)
      .map(String)
  );
  if (ids.size === 0) throw new Error('Selecione ao menos uma oferta.');
  const removed = normalized.items.filter(item => ids.has(item.id));
  normalized.items = normalized.items.filter(item => !ids.has(item.id));
  return { queue: normalized, removed };
}

function validateQueueItems(
  queue,
  catalog,
  { platforms = null, now = new Date() } = {}
) {
  const normalized = normalizeQueue(queue);
  const activeStatuses = new Set([
    STATUSES.AWAITING_AFFILIATE,
    STATUSES.READY,
    STATUSES.NEEDS_REVIEW
  ]);
  const missing = [];
  const updated = [];
  let unchanged = 0;
  let skipped = 0;
  for (const item of normalized.items) {
    if (!activeStatuses.has(item.status)) continue;
    if (platforms && !platforms.has(item.platform)) {
      skipped += 1;
      continue;
    }
    const current = catalog.get(item.dealId);
    if (!current) {
      item.validation = {
        state: 'not_found',
        checkedAt: now.toISOString(),
        message:
          'Produto nao localizado no catalogo atual. A oferta foi preservada.'
      };
      item.updatedAt = now.toISOString();
      missing.push(item);
      continue;
    }
    if (
      priceToCents(current.currentPrice) === priceToCents(item.currentPrice) &&
      Number(current.discount) === Number(item.discount)
    ) {
      item.validation = {
        state: 'verified',
        checkedAt: now.toISOString(),
        message: null
      };
      unchanged += 1;
      continue;
    }
    item.originalPrice = String(current.originalPrice || item.originalPrice);
    item.currentPrice = String(current.currentPrice || item.currentPrice);
    item.discount = Number(current.discount) || 0;
    item.image = String(current.image || item.image);
    item.coupon = null;
    item.updatedAt = now.toISOString();
    item.validation = {
      state: 'changed',
      checkedAt: now.toISOString(),
      message: 'Preco ou desconto alterado no catalogo.'
    };
    if (item.affiliateLink) {
      item.status = STATUSES.NEEDS_REVIEW;
      item.reviewReason =
        'Preco ou desconto mudou. O Story foi atualizado; revise e aprove.';
      item.reviewUpdatedStory = true;
      item.readyAt = null;
    }
    updated.push({ item, current });
  }
  return {
    queue: normalized,
    removed: [],
    missing,
    updated,
    unchanged,
    skipped
  };
}

module.exports = {
  STATUSES,
  AFFILIATE_PROCESSING_STATES,
  emptyQueue,
  emptyAffiliateProcessing,
  normalizeQueue,
  loadQueue,
  saveQueue,
  validateAffiliateLink,
  enqueueOffer,
  setAffiliateLink,
  releaseExpiredClaims,
  claimAffiliateJobs,
  assertClaimOwner,
  recordAffiliateFailure,
  updateItemStatus,
  summarizeQueue,
  removeDiscardedItems,
  removeItems,
  validateQueueItems,
  priceToCents
};
