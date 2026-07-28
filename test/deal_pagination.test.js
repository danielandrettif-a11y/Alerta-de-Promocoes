const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('renderiza ofertas em lotes de 20 sem blur por card', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
  const cardRule = css.match(/\.deal-card\s*\{([^}]+)\}/)?.[1] || '';

  assert.match(app, /const DEALS_PAGE_SIZE = 20/);
  assert.match(app, /filteredEntries\.slice\(0, visibleMLLimit\)/);
  assert.match(app, /filteredEntries\.slice\(0, visibleAmazonLimit\)/);
  assert.match(html, /id="btn-load-more-ml"/);
  assert.match(html, /id="btn-load-more-amazon"/);
  assert.match(html, /id="btn-tab-products"/);
  assert.match(html, /id="btn-tab-search"/);
  assert.match(html, /id="btn-queue-ml"/);
  assert.match(html, /id="btn-mobile-queue"/);
  assert.match(app, /function switchDealSource/);
  assert.match(app, /\/api\/proxy-image\?url=/);
  assert.match(app, /IMAGE_PLACEHOLDER/);
  assert.doesNotMatch(cardRule, /backdrop-filter/);
});
