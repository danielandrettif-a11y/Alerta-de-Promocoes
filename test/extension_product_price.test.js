const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const productPrice = require('../extension/content/product_price.js');

function rootWith(elements = {}, scripts = []) {
  return {
    querySelector(selector) {
      return elements[selector] || null;
    },
    querySelectorAll(selector) {
      return selector === 'script[type="application/ld+json"]' ? scripts : [];
    }
  };
}

test('le preco Amazon e Shopee e identifica o produto', () => {
  const amazonRoot = rootWith({
    '#corePrice_feature_div .priceToPay .a-offscreen': {
      textContent: 'R$ 1.234,56',
      getAttribute: () => null
    }
  });
  assert.equal(productPrice.readPrice(amazonRoot, 'www.amazon.com.br'), 1234.56);
  assert.equal(
    productPrice.productIdentity('https://www.amazon.com.br/dp/B012345678'),
    'B012345678'
  );

  const shopeeRoot = rootWith({}, [{
    textContent: JSON.stringify({
      '@type': 'Product',
      offers: { price: '89.90' }
    })
  }]);
  assert.equal(productPrice.readPrice(shopeeRoot, 'shopee.com.br'), 89.9);
  assert.equal(
    productPrice.productIdentity('https://shopee.com.br/produto-i.123.456'),
    '456'
  );

  const futfanaticsRoot = rootWith({
    '.preco-por': {
      textContent: 'Por R$ 149,90',
      getAttribute: () => null
    }
  });
  assert.equal(
    productPrice.readPrice(futfanaticsRoot, 'www.futfanatics.com.br'),
    149.9
  );
  assert.equal(
    productPrice.productIdentity(
      'https://www.futfanatics.com.br/camisa-palmeiras-i-2026'
    ),
    'camisa-palmeiras-i-2026'
  );
});

test('Amazon usa a tag afiliada sem abrir a pagina do produto', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'extension', 'manifest.json'),
    'utf8'
  ));
  assert.ok(manifest.host_permissions.includes('https://www.amazon.com.br/*'));
  assert.ok(manifest.host_permissions.includes('https://shopee.com.br/*'));
  assert.ok(manifest.host_permissions.includes('https://www.futfanatics.com.br/*'));
  assert.ok(manifest.content_scripts.some(entry =>
    entry.js.includes('content/product_price.js')
  ));
  const background = fs.readFileSync(
    path.join(root, 'extension', 'background.js'),
    'utf8'
  );
  const amazonProcess = background.slice(
    background.indexOf('async function processAmazonJob'),
    background.indexOf('async function processFutFanaticsJob')
  );
  assert.doesNotMatch(amazonProcess, /navigateTab|READ_PRODUCT_PRICE/);
  assert.match(background, /platform === 'amazon' \? null/);
  assert.match(background, /async function processFutFanaticsJob/);
  assert.match(background, /type: 'READ_PRODUCT_PRICE'/);
});
