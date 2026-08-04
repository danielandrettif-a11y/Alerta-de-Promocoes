const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  loadDealHistory,
  normalizeCommissionRate,
  parseSalesCount,
  recordDealSnapshots,
  scoreDeals
} = require('../execution/deal_intelligence.js');

test('normaliza vendas e comissao sem inventar valores ausentes', () => {
  assert.equal(parseSalesCount('Mais de 250mil produtos vendidos.'), 250000);
  assert.equal(parseSalesCount('10 mil vendidos'), 10000);
  assert.equal(normalizeCommissionRate('12,5%'), 12.5);
  assert.equal(normalizeCommissionRate(0.08), 8);
  assert.equal(normalizeCommissionRate(null), null);
});

test('gera nota explicavel e reduz a confianca sem comissao', () => {
  const [deal] = scoreDeals([{
    title: 'Fone Bluetooth',
    link: 'https://www.mercadolivre.com.br/fone',
    image: 'https://http2.mlstatic.com/fone.jpg',
    currentPrice: 'R$ 99,90',
    discount: 40,
    rating: 4.9,
    salesInfo: 'Mais de 10 mil vendidos',
    isFreeShipping: true
  }], {
    platform: 'mercado_livre',
    generatedAt: '2026-08-04T10:00:00Z',
    now: new Date('2026-08-04T10:10:00Z')
  });
  assert.equal(deal.salesCount, 10000);
  assert.equal(deal.commission, null);
  assert.equal(deal.promotionScore.eligible, true);
  assert.ok(deal.promotionScore.stars >= 0 && deal.promotionScore.stars <= 5);
  assert.ok(deal.promotionScore.confidence < 100);
  assert.equal(deal.promotionScore.components.commission.available, false);
});

test('calcula retorno e persiste apenas um retrato por atualizacao', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deal-history-'));
  const historyPath = path.join(directory, 'history.json');
  const deals = [{
    title: 'Cafeteira',
    link: 'https://www.amazon.com.br/dp/ABC',
    image: 'https://m.media-amazon.com/cafeteira.jpg',
    currentPrice: 'R$ 200,00',
    discount: 20,
    commissionRate: 10,
    salesCount: 100
  }];
  assert.equal(recordDealSnapshots(
    historyPath, deals, 'amazon', '2026-08-04T10:00:00Z'
  ), true);
  assert.equal(recordDealSnapshots(
    historyPath, deals, 'amazon', '2026-08-04T10:00:00Z'
  ), false);
  assert.equal(loadDealHistory(historyPath).entries.length, 1);
  const [scored] = scoreDeals(deals, {
    platform: 'amazon',
    generatedAt: '2026-08-04T10:00:00Z',
    now: new Date('2026-08-04T11:00:00Z')
  });
  assert.equal(scored.commission.estimatedAmount, 20);
  assert.equal(scored.promotionScore.components.commission.available, true);
});
