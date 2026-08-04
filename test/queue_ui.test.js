const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('fila usa uma selecao e valida em segundo plano', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

  assert.match(page, /id="chk-select-visible-queue"/);
  assert.match(app, /data-queue-select=/);
  assert.doesNotMatch(app, /data-batch-select|selectedReadyBatchIds/);
  assert.match(server, /\/api\/publication-queue\/validation/);
  assert.match(server, /res\.status\(202\)\.json\(queueValidationJob\)/);
  assert.match(server, /execFile\(/);
  assert.match(server, /await Promise\.allSettled/);
  assert.match(app, /job\.phase === 'updating_catalogs'/);
  assert.match(server, /applyObservedQueuePrices\(queue, catalog\)/);
  assert.match(server, /item\.status = PUBLICATION_QUEUE_STATUSES\.READY/);
  assert.match(server, /Cache-Control', 'no-store'/);
  assert.match(server, /\?v=\$\{encodeURIComponent\(item\.updatedAt/);
  assert.match(app, /fetch\(item\.storyUrl, \{ cache: 'no-store' \}\)/);
  assert.match(app, /publication-queue\/validation\/.*encodeURIComponent\(job\.id\)/s);
  assert.match(app, /publicationQueueRequestSequence/);
  assert.match(page, /id="queue-sort-filter"/);
  assert.match(page, /<optgroup label="A..o necess.ria">/);
});

test('prepara Mercado Livre e Shopee juntos com progresso cancelavel', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const generator = fs.readFileSync(
    path.join(root, 'execution', 'generate_stories.js'),
    'utf8'
  );

  assert.match(app, /function getSelectedPublicationDeals\(\)/);
  assert.match(app, /selectedMLIndices\.size \+ selectedAmazonIndices\.size \+ selectedShopeeIndices\.size/);
  assert.match(app, /logEl\.scrollTop = logEl\.scrollHeight/);
  assert.match(app, /Todos os Stories foram gerados\./);
  assert.match(app, /stopQueueGenerationRequested/);
  assert.match(app, /\/api\/publication-queue\/generation/);
  assert.match(server, /spawn\(\s*process\.execPath/);
  assert.match(server, /entries\.length > 40/);
  assert.match(server, /STORY_CANCEL_FILE/);
  assert.match(generator, /process\.env\.STORY_CANCEL_FILE/);
  assert.match(generator, /temp_story_\$\{process\.pid\}_\$\{rank\}/);
  assert.match(page, /id="btn-stop-progress"/);
});

test('extensao permite processar ate 40 ofertas por lote', () => {
  const popup = fs.readFileSync(
    path.join(root, 'extension', 'popup.html'),
    'utf8'
  );
  const background = fs.readFileSync(
    path.join(root, 'extension', 'background.js'),
    'utf8'
  );

  assert.match(popup, /<option value="40">40 ofertas<\/option>/);
  assert.match(background, /Math\.min\(40,/);
});
