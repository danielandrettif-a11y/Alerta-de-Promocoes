const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePrice,
  cleanSearchQuery,
  getIdentityTokens,
  isPlausibleComparison,
  assessComparison,
  buildWhatsappComparison
} = require('../execution/price_comparison.js');

test('converte preços brasileiros corretamente', () => {
  assert.equal(parsePrice('R$ 3.329,10'), 3329.1);
  assert.equal(parsePrice('R$ 349,29'), 349.29);
});

test('preserva modelo e tensão como identidade do produto', () => {
  const query = cleanSearchQuery(
    'Máquina Inversora de Solda Digital MIG 130A Sem Gás 220V'
  );
  assert.deepEqual(getIdentityTokens(query), ['130a', '220v']);
  const phoneQuery = cleanSearchQuery('Apple iPhone 15 128GB Preto');
  assert.deepEqual(getIdentityTokens(phoneQuery), ['128gb', '15']);
});

test('rejeita comparação muito discrepante', () => {
  assert.equal(isPlausibleComparison(349.29, 3329.1), false);
  assert.equal(isPlausibleComparison(349.29, 399.9), true);
});

test('classifica somente diferenças acima da tolerância', () => {
  assert.equal(assessComparison(349.29, 399.9).code, 'good');
  assert.equal(assessComparison(349.29, 345).code, 'similar');
  assert.equal(assessComparison(349.29, 299.9).code, 'higher');
});

test('mensagem deixa claro que a comparação é estimativa', () => {
  const message = buildWhatsappComparison({
    success: true,
    minPrice: 399.9,
    priceText: 'R$ 399,90',
    sourcesCount: 2
  }, 'R$ 349,29');
  assert.match(message, /Parece uma boa promoção/);
  assert.match(message, /Estimativa automática/);
});
