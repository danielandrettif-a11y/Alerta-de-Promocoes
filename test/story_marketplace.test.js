const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getMarketplaceBrand,
  getStoryVariant
} = require('../execution/generate_stories.js');

test('identifica o marketplace no Story e limita as variantes', () => {
  assert.equal(getMarketplaceBrand('shopee').cta, 'Compre na Shopee');
  assert.equal(
    getMarketplaceBrand('mercado_livre').cta,
    'Compre no Mercado Livre'
  );
  assert.equal(getMarketplaceBrand('amazon').name, 'Amazon');
  assert.equal(
    getMarketplaceBrand('futfanatics').cta,
    'Compre na FutFanatics'
  );
  assert.equal(getStoryVariant('C'), 'c');
  assert.equal(getStoryVariant('D'), 'd');
  assert.equal(getStoryVariant('invalida'), 'd');
});
