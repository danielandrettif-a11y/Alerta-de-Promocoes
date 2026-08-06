const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanPriceString,
  parseNumericPrice,
  selectVerifiedDeals,
  buildAffiliateLink
} = require('../execution/futfanatics_deals.js');

test('FutFanatics formata e limpa strings de preço corretamente', () => {
  assert.equal(cleanPriceString('R$ 299,90'), 'R$ 299,90');
  assert.equal(cleanPriceString('Por apenas R$ 149,90 no PIX'), 'R$ 149,90');
  assert.equal(parseNumericPrice('R$ 299,90'), 299.90);
  assert.equal(parseNumericPrice('R$ 1.499,00'), 1499.00);
});

test('FutFanatics seleciona somente ofertas com desconto real acima do mínimo', () => {
  const deals = selectVerifiedDeals([
    { title: 'Sem desconto', discount: 0, originalPrice: 'R$ 100,00', currentPrice: 'R$ 100,00' },
    { title: 'Desconto baixo 10%', discount: 10, originalPrice: 'R$ 100,00', currentPrice: 'R$ 90,00' },
    { title: 'Camisa Flamengo 40% OFF', discount: 40, originalPrice: 'R$ 349,90', currentPrice: 'R$ 209,90' },
    { title: 'Chuteira Puma 30% OFF', discount: 30, originalPrice: 'R$ 299,90', currentPrice: 'R$ 209,90' }
  ], 100);

  assert.equal(deals.length, 2);
  assert.equal(deals[0].title, 'Camisa Flamengo 40% OFF');
  assert.equal(deals[1].title, 'Chuteira Puma 30% OFF');
});

test('FutFanatics gera links Awin quando o publisher ID está presente', () => {
  process.env.FUTFANATICS_AWIN_PUBLISHER_ID = '123456';
  process.env.FUTFANATICS_AWIN_MID = '20084';
  const url = 'https://www.futfanatics.com.br/camisa-flamengo-i-2026';
  const affiliateLink = buildAffiliateLink(url);

  assert.ok(affiliateLink.includes('awin1.com'));
  assert.ok(affiliateLink.includes('awinaffid=123456'));
  assert.ok(affiliateLink.includes('awinmid=20084'));

  delete process.env.FUTFANATICS_AWIN_PUBLISHER_ID;
  const cleanLink = buildAffiliateLink(url);
  assert.equal(cleanLink, url);
});
