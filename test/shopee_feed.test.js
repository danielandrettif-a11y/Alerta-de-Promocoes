const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseCsvRecord,
  importShopeeFeeds
} = require('../execution/shopee_feed.js');
const {
  validateFeedUrl,
  configuredFeeds,
  probeFeed,
  hasCurrentReportShape
} = require('../execution/shopee_refresh.js');

const HEADERS = [
  'shop_rating',
  'itemid',
  'sale_price',
  'item_rating',
  'global_category3',
  'cb_option',
  'discount_percentage',
  'global_catid2',
  'price',
  'description',
  'title',
  'global_category1',
  'image_link_3',
  'global_catid1',
  'global_catid3',
  'like',
  'condition',
  'global_category2',
  'model_ids',
  'image_link',
  'model_names',
  'shop_name',
  'product_link',
  'product_short link'
];

const GENERAL_HEADERS = [
  'image_link',
  'itemid',
  'price',
  'global_category1',
  'description',
  'global_category2',
  'global_item_attributes',
  'item_rating',
  'sale_price',
  'global_catid2',
  'discount_percentage',
  'image_link_3',
  'title',
  'global_catid1',
  'product_link',
  'product_short link'
];

function csvRow({
  shopRating = '4.9',
  itemId,
  salePrice,
  itemRating,
  discount,
  price,
  title,
  crossBorder = 'Non-Cross border',
  shopId = '123'
}) {
  return [
    shopRating,
    itemId,
    salePrice,
    itemRating,
    'Tools',
    crossBorder,
    discount,
    '2',
    price,
    '"Descricao com quebra\nsegunda linha e ""aspas"""',
    title,
    'Home',
    'https://cf.shopee.com.br/file/extra',
    '1',
    '3',
    '10',
    'new',
    'Tools',
    '1',
    'https://cf.shopee.com.br/file/main',
    'Padrao',
    'Loja Teste',
    `https://shopee.com.br/product/${shopId}/${itemId}`,
    `https://shope.ee/an_redir?origin_link=${itemId}`
  ].join(',');
}

function generalCsvRow({
  itemId,
  salePrice,
  itemRating,
  discount,
  price,
  title,
  shopId = '456'
}) {
  return [
    'https://cf.shopee.com.br/file/main',
    itemId,
    price,
    'Home',
    'Descricao',
    'Tools',
    '[]',
    itemRating,
    salePrice,
    '2',
    discount,
    'https://cf.shopee.com.br/file/extra',
    title,
    '1',
    `https://shopee.com.br/product/${shopId}/${itemId}`,
    `https://shope.ee/an_redir?origin_link=${itemId}`
  ].join(',');
}

test('interpreta campos escapados e descricoes multilinha', () => {
  assert.deepEqual(
    parseCsvRecord('"a,b","linha 1\nlinha 2","texto ""citado"""'),
    ['a,b', 'linha 1\nlinha 2', 'texto "citado"']
  );
});

test('aceita somente URLs oficiais e separa os dois feeds', () => {
  const officialUrl =
    'https://affiliate.shopee.com.br/api/v1/datafeed/download?id=official';
  const generalUrl =
    'https://affiliate.shopee.com.br/api/v1/datafeed/download?id=general';

  assert.deepEqual(
    configuredFeeds({
      SHOPEE_OFFICIAL_FEED_URLS: officialUrl,
      SHOPEE_GENERAL_FEED_URLS: generalUrl
    }).map(feed => [feed.id, feed.name]),
    [
      ['official:1', 'Shopee Oficial 1.csv'],
      ['general:1', 'Shopee Brasil 1.csv']
    ]
  );
  assert.throws(
    () => validateFeedUrl('https://example.com/api/v1/datafeed/download?id=x'),
    /endpoint oficial/
  );
});

test('sonda somente um byte e usa o ETag como versao', async () => {
  let requestedRange = '';
  const result = await probeFeed({
    id: 'official:1',
    url: 'https://affiliate.shopee.com.br/api/v1/datafeed/download?id=x'
  }, async (url, options) => {
    requestedRange = options.headers.Range;
    return {
      status: 206,
      url: 'https://mkt-proxy.shopee.com.br/download/succ?id=x',
      headers: new Headers({
        etag: '"versao-1"',
        'content-range': 'bytes 0-0/196611451'
      }),
      arrayBuffer: async () => new ArrayBuffer(1)
    };
  });

  assert.equal(requestedRange, 'bytes=0-0');
  assert.equal(result.version, '"versao-1"');
});

test('reimporta relatorio antigo mesmo quando o feed nao mudou', t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopee-shape-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const reportPath = path.join(tempDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ deals: [] }), 'utf-8');
  assert.equal(hasCurrentReportShape(reportPath), false);
  fs.writeFileSync(reportPath, JSON.stringify({
    catalog: [],
    filters: { recurringMinDiscount: 5 }
  }), 'utf-8');
  assert.equal(hasCurrentReportShape(reportPath), true);
});

test('filtra, ranqueia e grava relatorio Shopee compativel', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopee-feed-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const inputPath = path.join(tempDir, 'Shopee Oficial.csv');
  const generalPath = path.join(tempDir, 'Shopee Brasil.csv');
  const outputPath = path.join(tempDir, 'report.json');
  fs.writeFileSync(inputPath, [
    HEADERS.join(','),
    csvRow({
      itemId: '10',
      salePrice: '60',
      itemRating: '5',
      discount: '40',
      price: '100',
      title: 'Produto A'
    }),
    csvRow({
      itemId: '11',
      salePrice: '50',
      itemRating: '4.8',
      discount: '50',
      price: '100',
      title: 'Produto B'
    }),
    csvRow({
      itemId: '12',
      salePrice: '40',
      itemRating: '4.0',
      discount: '60',
      price: '100',
      title: 'Avaliacao baixa'
    }),
    csvRow({
      itemId: '13',
      salePrice: '40',
      itemRating: '5',
      discount: '60',
      price: '100',
      title: 'Internacional',
      crossBorder: 'Cross border'
    }),
    csvRow({
      itemId: '14',
      salePrice: '4',
      itemRating: '5',
      discount: '96',
      price: '100',
      title: 'Preco de lista suspeito'
    })
  ].join('\n'), 'utf-8');
  fs.writeFileSync(generalPath, [
    GENERAL_HEADERS.join(','),
    generalCsvRow({
      itemId: '10',
      salePrice: '60',
      itemRating: '5',
      discount: '40',
      price: '100',
      title: 'Duplicado geral',
      shopId: '123'
    }),
    generalCsvRow({
      itemId: '15',
      salePrice: '55',
      itemRating: '4.9',
      discount: '45',
      price: '100',
      title: 'Produto geral'
    })
  ].join('\n'), 'utf-8');

  const report = await importShopeeFeeds([generalPath, inputPath], {
    outputPath,
    maxProducts: 10
  });

  assert.equal(report.stats.rowsRead, 7);
  assert.equal(report.stats.accepted, 3);
  assert.equal(report.stats.acceptedWithoutShopRating, 1);
  assert.equal(report.stats.rejected.duplicate, 1);
  assert.equal(report.stats.rejected.itemRating, 1);
  assert.equal(report.stats.rejected.crossBorder, 1);
  assert.equal(report.stats.rejected.extremeDiscount, 1);
  assert.deepEqual(report.deals.map(deal => deal.itemId), ['10', '15', '11']);
  assert.equal(report.deals[0].platform, 'shopee');
  assert.equal(report.deals[0].officialFeed, true);
  assert.equal(report.deals[1].shopRating, null);
  assert.equal(report.deals[0].affiliateLink, null);
  assert.equal(report.deals[0].currentPrice, 'R$ 60,00');
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf-8')), report);
});

test('inclui produto de recompra mesmo com desconto menor', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopee-recurring-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const inputPath = path.join(tempDir, 'Shopee Oficial.csv');
  const outputPath = path.join(tempDir, 'report.json');
  fs.writeFileSync(inputPath, [
    HEADERS.join(','),
    csvRow({
      itemId: '20',
      salePrice: '90',
      itemRating: '5',
      discount: '10',
      price: '100',
      title: 'Kit Shampoo e Condicionador'
    })
  ].join('\n'), 'utf-8');

  const report = await importShopeeFeeds([inputPath], {
    outputPath,
    minDiscount: 30,
    recurringMinDiscount: 5
  });

  assert.equal(report.deals.length, 1);
  assert.equal(report.deals[0].recurringPurchase, true);
  assert.equal(report.stats.selectedRecurring, 1);
  assert.equal(report.catalog.length, 1);
});
