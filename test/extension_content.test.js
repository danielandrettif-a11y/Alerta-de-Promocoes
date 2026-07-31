const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  LINK_PATTERN,
  normalizedText,
  isShareLabel,
  isUsableLabelOption,
  parsePriceText
} = require('../extension/content/mercado_livre.js');
const shopee = require('../extension/content/shopee.js');

test('content script normaliza texto e aceita somente link meli.la esperado', () => {
  assert.equal(normalizedText('  Compartilhar  ').trim(), 'compartilhar');
  assert.equal('https://meli.la/AbC_123-x'.match(LINK_PATTERN)?.[0],
    'https://meli.la/AbC_123-x');
  assert.equal('https://meli.la.example/ABC'.match(LINK_PATTERN), null);
  assert.equal(isShareLabel('Compartilhar'), true);
  assert.equal(isShareLabel('Compartilhar e ganhar'), true);
  assert.equal(isShareLabel('Gerar link'), false);
  assert.equal(isUsableLabelOption('Ofertas do Instagram'), true);
  assert.equal(isUsableLabelOption('Selecione uma etiqueta'), false);
  assert.equal(isUsableLabelOption('Criar etiqueta'), false);
  assert.equal(isUsableLabelOption('Nenhuma etiqueta disponível'), false);
  assert.equal(isUsableLabelOption('...'), false);
  assert.equal(parsePriceText('R$ 5.299,78'), 5299.78);
  assert.equal(parsePriceText('5299.78'), 5299.78);
  assert.equal(parsePriceText('R$ 5.299'), 5299);
  assert.equal(parsePriceText('Preço indisponível'), null);
});

test('clique nativo usa debugger somente para eventos de entrada', () => {
  const root = path.join(__dirname, '..', 'extension');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
  );
  const background = fs.readFileSync(
    path.join(root, 'background.js'),
    'utf8'
  );
  assert.equal(manifest.permissions.includes('debugger'), true);
  assert.match(background, /Input\.dispatchMouseEvent/);
  assert.match(background, /chrome\.tabs\.update\(tab\.id, \{ active: true \}\)/);
  assert.match(background, /chrome\.debugger\.detach/);
  assert.match(background, /state: 'minimized'/);
  assert.match(background, /chrome\.windows\.remove\(workerWindow\.id\)/);
  assert.match(background, /state: 'normal',\s+focused: true/);
  assert.doesNotMatch(background, /Network\.|Storage\.|Cookies\./);
});

test('content script aceita somente link curto oficial da Shopee', () => {
  assert.equal(
    'https://s.shopee.com.br/AUso2xdRXP'.match(shopee.LINK_PATTERN)?.[0],
    'https://s.shopee.com.br/AUso2xdRXP'
  );
  assert.equal(
    'https://s.shopee.com.br.example.com/AUso'.match(shopee.LINK_PATTERN),
    null
  );
  const root = path.join(__dirname, '..', 'extension');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
  );
  const background = fs.readFileSync(
    path.join(root, 'background.js'),
    'utf8'
  );
  assert.equal(
    manifest.host_permissions.includes('https://affiliate.shopee.com.br/*'),
    true
  );
  assert.match(background, /GENERATE_SHOPEE_AFFILIATE_LINK/);
  assert.match(background, /job\.platform === 'shopee'/);
});

test('detecta somente cupom candidato com preço menor no produto', () => {
  const mercadoLivre = require('../extension/content/mercado_livre.js');
  const priceElement = {
    querySelector: () => null,
    getAttribute: name => name === 'content' ? '199.99' : null,
    textContent: 'R$ 199,99'
  };
  const root = {
    body: {
      innerText: 'Use o cupom MODA10 e pague R$ 179,99 com Cupom',
      textContent: 'Use o cupom MODA10 e pague R$ 179,99 com Cupom'
    },
    querySelector: selector =>
      selector === '[itemprop="price"]' ? priceElement : null,
    querySelectorAll: () => []
  };
  assert.deepEqual(
    mercadoLivre.findProductCoupon([{ code: 'MODA10' }], root),
    {
      code: 'MODA10',
      priceWithoutCoupon: 199.99,
      priceWithCoupon: 179.99
    }
  );
  assert.equal(
    mercadoLivre.findProductCoupon([{ code: 'OUTRO10' }], root),
    null
  );
});
