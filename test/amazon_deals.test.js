const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  findBrowserPath,
  parsePromotionText,
  selectVerifiedDeals,
  saveAmazonReport
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

test('Amazon preserva o catálogo anterior quando a coleta falha', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amazon-report-'));
  const reportPath = path.join(directory, 'amazon.json');
  const previous = { generatedAt: '2026-08-05T12:00:00.000Z', deals: [{ title: 'Anterior' }] };
  fs.writeFileSync(reportPath, JSON.stringify(previous));

  try {
    assert.throws(
      () => saveAmazonReport(reportPath, []),
      /catálogo anterior foi preservado/
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(reportPath)), previous);
    assert.equal(
      findBrowserPath(
        { BROWSER_EXECUTABLE_PATH: '/custom/chromium' },
        candidate => candidate === '/custom/chromium'
      ),
      '/custom/chromium'
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
