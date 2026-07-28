const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePrice,
  cleanSearchQuery,
  getIdentityTokens,
  matchProduct,
  isPlausibleComparison,
  median,
  isSameProductUrl,
  assessComparison,
  scoreOffer,
  buildComparisonFromResults,
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

test('ignora a própria oferta mesmo com parâmetros diferentes no link', () => {
  assert.equal(
    isSameProductUrl(
      'https://produto.mercadolivre.com.br/MLB-1?tracking=x',
      'https://produto.mercadolivre.com.br/MLB-1?variation=2'
    ),
    true
  );
});

test('aceita o mesmo produto e rejeita acessório ou versão diferente', () => {
  const offer = 'Apple iPhone 15 128GB Preto';
  assert.equal(
    matchProduct(offer, 'Apple iPhone 15 128 GB Preto').accepted,
    true
  );
  assert.equal(
    matchProduct(offer, 'Apple iPhone 15 Pro 128 GB').accepted,
    false
  );
  assert.equal(
    matchProduct(offer, 'Capa para iPhone 15 128GB').accepted,
    false
  );
});

test('calcula mediana sem favorecer uma loja com vários anúncios', () => {
  assert.equal(median([399.9, 420, 410]), 410);
  const title = 'Apple iPhone 15 128GB Preto';
  const comparison = buildComparisonFromResults({
    title,
    currentPrice: 350,
    sourceUrl: 'https://produto.mercadolivre.com.br/MLB-1',
    searchResult: {
      success: true,
      query: title,
      checkedAt: '2026-07-27T12:00:00.000Z',
      results: [
        {
          marketplace: 'mercado_livre',
          marketplaceLabel: 'Mercado Livre',
          title,
          price: 350,
          priceText: 'R$ 350,00',
          url: 'https://produto.mercadolivre.com.br/MLB-1'
        },
        {
          marketplace: 'amazon',
          marketplaceLabel: 'Amazon',
          title,
          price: 399.9,
          priceText: 'R$ 399,90',
          url: 'https://www.amazon.com.br/dp/ABCDEFGHIJ'
        },
        {
          marketplace: 'magalu',
          marketplaceLabel: 'Magalu',
          title,
          price: 420,
          priceText: 'R$ 420,00',
          url: 'https://www.magazineluiza.com.br/produto/p/1'
        },
        {
          marketplace: 'casas_bahia',
          marketplaceLabel: 'Casas Bahia',
          title,
          price: 410,
          priceText: 'R$ 410,00',
          url: 'https://www.casasbahia.com.br/produto/p/1'
        }
      ]
    }
  });
  assert.equal(comparison.success, true);
  assert.equal(comparison.medianPrice, 410);
  assert.equal(comparison.minPrice, 399.9);
  assert.equal(comparison.sourcesCount, 3);
  assert.equal(comparison.score, 8);
});

test('classifica somente diferenças acima da tolerância', () => {
  assert.equal(assessComparison(349.29, 399.9).code, 'good');
  assert.equal(assessComparison(349.29, 345).code, 'similar');
  assert.equal(assessComparison(349.29, 299.9).code, 'higher');
});

test('atribui nota com base na diferença para a mediana', () => {
  assert.equal(scoreOffer(80, 100).score, 10);
  assert.equal(scoreOffer(100, 100).score, 5);
  assert.equal(scoreOffer(120, 100).score, 1);
  assert.equal(scoreOffer(0, 100).score, null);
});

test('resumo do WhatsApp mostra nota, referência, confiança e ressalva', () => {
  const message = buildWhatsappComparison({
    success: true,
    medianPrice: 399.9,
    medianPriceText: 'R$ 399,90',
    sourcesCount: 2
  }, 'R$ 349,29');
  assert.match(message, /Nota do comparador: 8\/10/);
  assert.match(message, /Boa promoção/);
  assert.match(message, /Referência: R\$ 399,90 · 2 loja\(s\)/);
  assert.match(message, /Confiança: média/);
  assert.match(message, /Estimativa/);
});
