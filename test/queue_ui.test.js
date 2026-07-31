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
});
