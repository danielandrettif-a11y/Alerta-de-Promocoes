const crypto = require('crypto');
const { loadJson, saveJsonAtomic } = require('./json_store.js');

const WORKER_STATUSES = new Set([
  'idle',
  'processing',
  'auth_required',
  'offline',
  'error'
]);

const FAILURE_CODES = new Set([
  'AUTH_REQUIRED',
  'SHOPEE_ACCOUNT_ACTION_REQUIRED',
  'SHOPEE_PORTAL_NOT_READY',
  'SHOPEE_CONVERTER_NOT_REACHED',
  'SHOPEE_MENU_NOT_FOUND',
  'SHOPEE_INPUT_NOT_FOUND',
  'SHOPEE_GENERATE_BUTTON_NOT_FOUND',
  'SHOPEE_GENERATION_REJECTED',
  'SHOPEE_RESULT_TIMEOUT',
  'CANCELLED',
  'AFFILIATE_BAR_NOT_FOUND',
  'SHARE_BUTTON_NOT_FOUND',
  'AFFILIATE_LABEL_NOT_FOUND',
  'AFFILIATE_LINK_NOT_FOUND',
  'PRODUCT_UNAVAILABLE',
  'TIMEOUT',
  'UNKNOWN_ERROR'
]);

function isValidWorkerToken(authorization, expectedToken) {
  const provided = String(authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const expected = String(expectedToken || '');
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeDeviceId(value) {
  const deviceId = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(deviceId)) {
    throw new Error('deviceId invalido.');
  }
  return deviceId;
}

function loadWorkers(filePath) {
  const value = loadJson(filePath, { version: 1, workers: [] });
  return {
    version: 1,
    workers: Array.isArray(value?.workers) ? value.workers : []
  };
}

function saveWorkers(filePath, value) {
  saveJsonAtomic(filePath, {
    version: 1,
    workers: Array.isArray(value?.workers) ? value.workers : []
  });
}

function updateWorker(workers, input, now = new Date()) {
  const deviceId = normalizeDeviceId(input?.deviceId);
  const status = String(input?.status || 'idle');
  if (!WORKER_STATUSES.has(status)) {
    throw new Error('Status do worker invalido.');
  }
  let worker = workers.workers.find(item => item.deviceId === deviceId);
  if (!worker) {
    worker = { deviceId, processedCount: 0 };
    workers.workers.push(worker);
  }
  Object.assign(worker, {
    deviceName: String(input?.deviceName || 'Dispositivo local').slice(0, 80),
    extensionVersion: String(input?.extensionVersion || '').slice(0, 30),
    status,
    currentItemId: input?.currentItemId
      ? String(input.currentItemId).slice(0, 100)
      : null,
    processedCount: Math.max(
      0,
      Number(input?.processedCount ?? worker.processedCount) || 0
    ),
    lastError: input?.lastError
      ? String(input.lastError).slice(0, 500)
      : null,
    lastSeenAt: now.toISOString()
  });
  return worker;
}

function listWorkerStatus(workers, now = new Date(), offlineMs = 90000) {
  return workers.workers.map(worker => {
    const offline =
      now.getTime() - new Date(worker.lastSeenAt || 0).getTime() > offlineMs;
    return {
      ...worker,
      status: offline ? 'offline' : worker.status,
      online: !offline
    };
  });
}

module.exports = {
  WORKER_STATUSES,
  FAILURE_CODES,
  isValidWorkerToken,
  normalizeDeviceId,
  loadWorkers,
  saveWorkers,
  updateWorker,
  listWorkerStatus
};
