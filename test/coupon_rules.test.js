const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCouponRules,
  findCouponCandidates,
  normalizeVerifiedCoupon
} = require('../execution/coupon_rules.js');

test('calcula e ordena cupons elegiveis sem misturar categoria', () => {
  assert.deepEqual(
    parseCouponRules({
      rules: '20% OFF em compras a partir de R$79, limitado a R$50'
    }),
    { percent: 20, fixed: 0, minimum: 79, maximum: 50 }
  );
  const candidates = findCouponCandidates(
    { title: 'Tênis Adidas de corrida', currentPrice: 'R$ 199,99' },
    [
      { code: 'CASA20', rules: '20% OFF em produtos de casa acima de R$79' },
      { code: 'MODA10', rules: '10% OFF em moda a partir de R$79' },
      { code: 'GERAL15', rules: '15% OFF em compras acima de R$79' }
    ]
  );
  assert.deepEqual(candidates.map(item => item.code), ['GERAL15', 'MODA10']);
  assert.equal(candidates[0].estimatedPrice, 169.99);
});

test('aceita somente preço menor de cupom candidato confirmado no produto', () => {
  const item = {
    platform: 'mercado_livre',
    title: 'Tênis Adidas',
    currentPrice: 'R$ 199,99'
  };
  const coupons = [{ code: 'MODA10', rules: '10% OFF em moda' }];
  assert.deepEqual(
    normalizeVerifiedCoupon(
      item,
      {
        code: 'MODA10',
        priceWithoutCoupon: 199.99,
        priceWithCoupon: 179.99
      },
      coupons,
      new Date('2026-07-31T12:00:00Z')
    ),
    {
      code: 'MODA10',
      rules: '10% OFF em moda',
      priceWithoutCoupon: 'R$ 199,99',
      priceWithCoupon: 'R$ 179,99',
      savings: 'R$ 20,00',
      verifiedAt: '2026-07-31T12:00:00.000Z',
      verificationSource: 'mercado_livre_product_page'
    }
  );
  assert.equal(
    normalizeVerifiedCoupon(
      item,
      { code: 'OUTRO', priceWithCoupon: 1 },
      coupons
    ),
    null
  );
});
