const assert = require('node:assert/strict');
const test = require('node:test');
const {
  extractProductImage,
  selectTopDeals
} = require('../execution/mercado_livre_deals.js');

test('extrai imagem do Mercado Livre mesmo com atributos reordenados', () => {
  assert.equal(
    extractProductImage(
      '<img loading="lazy" src="https://http2.mlstatic.com/produto.webp" ' +
      'class="poly-component__picture">'
    ),
    'https://http2.mlstatic.com/produto.webp'
  );
});

test('prioriza imagem lazy real e decodifica entidades HTML', () => {
  assert.equal(
    extractProductImage(
      '<img class="poly-component__picture extra" src="data:image/gif;base64,x" ' +
      'data-src="https://http2.mlstatic.com/item.webp?a=1&amp;b=2">'
    ),
    'https://http2.mlstatic.com/item.webp?a=1&b=2'
  );
});

test('seleciona no maximo 400 ofertas e reserva espaco para recompra', () => {
  const products = Array.from({ length: 450 }, (_, index) => ({
    link: `https://mercadolivre.com.br/item-${index}`,
    rating: 5 - index / 1000,
    discount: 40,
    recurringPurchase: false
  }));
  products.push({
    link: 'https://mercadolivre.com.br/shampoo',
    rating: 4.8,
    discount: 10,
    recurringPurchase: true
  });
  const result = selectTopDeals(products);

  assert.equal(result.deals.length, 400);
  assert.equal(result.deals[0].recurringPurchase, true);
  assert.equal(result.catalog.length, 451);
});
