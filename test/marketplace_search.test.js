const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getQueryTokens,
  isRelevantTitle,
  parseMarketplacePrice,
  isAllowedMarketplaceUrl,
  cleanProductUrl,
  dedupeResults
} = require('../execution/marketplace_search.js');

test('remove palavras fracas e preserva marca e modelo da pesquisa', () => {
  assert.deepEqual(
    getQueryTokens('iPhone 15 com 128 GB'),
    ['iphone', '15', '128', 'gb']
  );
});

test('aceita produto relacionado e rejeita resultado sem relação suficiente', () => {
  assert.equal(
    isRelevantTitle('Apple iPhone 15 128 GB Preto', 'iPhone 15 128 GB'),
    true
  );
  assert.equal(
    isRelevantTitle('Capa transparente para celular', 'iPhone 15 128 GB'),
    false
  );
});

test('extrai preço brasileiro sem confundir texto ausente', () => {
  assert.equal(parseMarketplacePrice('Por R$ 3.499,90 à vista'), 3499.9);
  assert.equal(parseMarketplacePrice('Preço indisponível'), null);
});

test('aceita apenas HTTPS no domínio do marketplace', () => {
  assert.equal(
    isAllowedMarketplaceUrl(
      'https://produto.mercadolivre.com.br/MLB-123',
      'mercadolivre.com.br'
    ),
    true
  );
  assert.equal(
    isAllowedMarketplaceUrl(
      'https://mercadolivre.com.br.exemplo.com/roubo',
      'mercadolivre.com.br'
    ),
    false
  );
  assert.equal(
    isAllowedMarketplaceUrl(
      'http://produto.mercadolivre.com.br/MLB-123',
      'mercadolivre.com.br'
    ),
    false
  );
});

test('remove rastreamento do link e preserva variação necessária', () => {
  assert.equal(
    cleanProductUrl(
      'https://produto.mercadolivre.com.br/MLB-123?utm_source=x&variation=456#reco',
      'mercadolivre.com.br'
    ),
    'https://produto.mercadolivre.com.br/MLB-123?variation=456'
  );
  assert.equal(
    cleanProductUrl(
      'https://www.amazon.com.br/Apple-iPhone/dp/B0CP6CVJSG/ref=sr_1_3?tag=x',
      'amazon.com.br'
    ),
    'https://www.amazon.com.br/Apple-iPhone/dp/B0CP6CVJSG'
  );
});

test('remove resultados repetidos sem misturar marketplaces', () => {
  const results = dedupeResults([
    { marketplace: 'amazon', url: 'https://amazon.com.br/dp/1' },
    { marketplace: 'amazon', url: 'https://amazon.com.br/dp/1' },
    { marketplace: 'mercado_livre', url: 'https://amazon.com.br/dp/1' }
  ]);
  assert.equal(results.length, 2);
});
