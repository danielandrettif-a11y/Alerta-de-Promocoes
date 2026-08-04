const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePromotionText,
  selectVerifiedDeals
} = require('../execution/amazon_deals.js');

test('Amazon preserva somente descontos comprovados', () => {
  assert.deepEqual(
    parsePromotionText(
      '26% off Preço da Oferta: R$ 5.887,78 De: De: R$ 7.999,00'
    ),
    { discount: 26, originalPrice: 'R$ 7.999,00' }
  );
  const deals = selectVerifiedDeals([
    { title: 'Sem desconto', discount: 0, originalPrice: 'R$ 50,00', currentPrice: 'R$ 50,00' },
    { title: 'Desconto legado falso', discount: 15, originalPrice: 'R$ 80,00', currentPrice: 'R$ 80,00' },
    { title: 'Oferta real', discount: 20, originalPrice: 'R$ 100,00', currentPrice: 'R$ 80,00' }
  ]);

  assert.deepEqual(deals.map(deal => deal.title), ['Oferta real']);
});
