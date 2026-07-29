const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isValidWorkerToken,
  loadWorkers,
  saveWorkers,
  updateWorker,
  listWorkerStatus
} = require('../execution/local_affiliate_worker.js');

test('autentica somente o token Bearer exato', () => {
  assert.equal(isValidWorkerToken('Bearer segredo-forte', 'segredo-forte'), true);
  assert.equal(isValidWorkerToken('Bearer segredo-errado', 'segredo-forte'), false);
  assert.equal(isValidWorkerToken('', 'segredo-forte'), false);
});

test('heartbeat persiste o dispositivo e detecta worker offline', () => {
  const directory = fs.mkdtempSync(
    path.join(require('node:os').tmpdir(), 'affiliate-worker-')
  );
  const filePath = path.join(directory, 'workers.json');
  const workers = loadWorkers(filePath);
  updateWorker(workers, {
    deviceId: 'device_home_01',
    deviceName: 'PC de casa',
    extensionVersion: '1.0.0',
    status: 'processing',
    currentItemId: 'queue-1',
    processedCount: 2
  }, new Date('2026-07-23T15:00:00Z'));
  saveWorkers(filePath, workers);
  const loaded = loadWorkers(filePath);
  assert.equal(loaded.workers[0].deviceName, 'PC de casa');
  assert.equal(
    listWorkerStatus(
      loaded,
      new Date('2026-07-23T15:02:00Z'),
      90000
    )[0].status,
    'offline'
  );
});

test('servidor mantem o worker atras da feature flag', () => {
  const server = fs.readFileSync(
    path.join(__dirname, '..', 'server.js'),
    'utf8'
  );
  assert.match(
    server,
    /LOCAL_AFFILIATE_WORKER_ENABLED === 'true'/
  );
  assert.match(server, /requireLocalAffiliateWorker/);
  assert.match(server, /res\.status\(401\)/);
});
