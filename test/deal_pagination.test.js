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
  assert.match(app, /visibleLimit: visibleMLLimit/);
  assert.match(app, /visibleLimit: visibleAmazonLimit/);
  assert.match(app, /filteredEntries\.slice\(0, visibleLimit\)/);
  assert.match(html, /id="btn-load-more-ml"/);
  assert.match(html, /id="btn-load-more-amazon"/);
  assert.doesNotMatch(html, /id="btn-tab-amazon"[^>]*hidden/);
  assert.match(html, /id="txt-shopee-catalog-update"/);
  assert.match(html, /id="chk-select-all-shopee"/);
  assert.match(html, /id="btn-queue-shopee"/);
  assert.match(app, /const selectedShopeeIndices = new Set\(\)/);
  assert.match(app, /function getSelectedPublicationDeals\(\)/);
  assert.match(app, /platform: 'shopee'/);
  assert.doesNotMatch(css, /#btn-tab-amazon,[\s\S]*display:\s*none\s*!important/);
  assert.match(html, /id="btn-tab-products"/);
  assert.match(html, /id="btn-tab-search"/);
  assert.match(html, /id="panel-home"/);
  assert.match(html, /data-home-target="products"/);
  assert.match(html, /data-home-target="coupons"/);
  assert.match(html, /data-home-target="queue"/);
  assert.match(html, /data-home-target="search"/);
  assert.match(html, /id="btn-queue-ml"/);
  assert.match(html, /id="btn-mobile-queue"/);
  assert.match(app, /function switchDealSource/);
  assert.match(app, /\/api\/proxy-image\?url=/);
  assert.match(app, /IMAGE_PLACEHOLDER/);
  assert.doesNotMatch(cardRule, /backdrop-filter/);
});
