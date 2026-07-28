const assert = require('node:assert/strict');
const test = require('node:test');
const { extractProductImage } = require('../execution/mercado_livre_deals.js');

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
