const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('todos os fluxos usam o template compartilhado de Stories', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const template = fs.readFileSync(
    path.join(root, 'execution', 'story_template.html'),
    'utf8'
  );

  assert.doesNotMatch(app, /drawStoryOnCanvas|imageBuffer/);
  assert.equal(
    server.match(/generateStory\(deal, coupons\)/g)?.length,
    4
  );
  assert.match(template, /class="watermark-layer"/);
  assert.equal(
    template.match(/fill="url\(#brand-watermarks(?:-between)?\)"/g)?.length,
    2
  );
});
