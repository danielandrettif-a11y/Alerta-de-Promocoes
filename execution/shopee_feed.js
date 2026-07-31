const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { saveJsonAtomic } = require('./json_store.js');
const {
  getRecurringPurchaseCategory,
  mixRecurringDeals
} = require('./category_helper.js');

const REQUIRED_HEADERS = [
  'itemid',
  'sale_price',
  'item_rating',
  'discount_percentage',
  'price',
  'title',
  'image_link',
  'product_link'
];

function parseCsvRecord(record) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < record.length; index += 1) {
    const char = record[index];
    if (quoted) {
      if (char === '"' && record[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('Registro CSV com aspas nao finalizadas.');
  fields.push(field);
  return fields;
}

function updateQuoteState(line, quoted) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '"') continue;
    if (quoted && line[index + 1] === '"') {
      index += 1;
    } else {
      quoted = !quoted;
    }
  }
  return quoted;
}

async function* readCsvRows(filePath) {
  const input = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  let record = '';
  let quoted = false;

  for await (const line of lines) {
    record = record ? `${record}\n${line}` : line;
    quoted = updateQuoteState(line, quoted);
    if (quoted) continue;

    const fields = parseCsvRecord(record);
    record = '';
    if (!headers) {
      headers = fields;
      headers[0] = headers[0].replace(/^\uFEFF/, '');
      const missing = REQUIRED_HEADERS.filter(header =>
        !headers.includes(header)
      );
      if (missing.length) {
        throw new Error(`Feed sem colunas obrigatorias: ${missing.join(', ')}`);
      }
      continue;
    }
    if (fields.length !== headers.length) {
      throw new Error(
        `Registro CSV com ${fields.length} campos; esperado ${headers.length}.`
      );
    }
    yield Object.fromEntries(headers.map((header, index) => [
      header,
      fields[index]
    ]));
  }

  if (quoted || record) {
    throw new Error('Feed terminou no meio de um registro CSV.');
  }
}

function parsePositiveNumber(value) {
  const number = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseNonNegativeNumber(value) {
  const number = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseProductIdentity(rawLink, fallbackItemId) {
  let parsed;
  try {
    parsed = new URL(String(rawLink || '').trim());
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname.toLowerCase() !== 'shopee.com.br'
  ) {
    return null;
  }
  const match =
    parsed.pathname.match(/\/product\/(\d+)\/(\d+)(?:\/|$)/) ||
    parsed.pathname.match(/-i\.(\d+)\.(\d+)(?:\/|$)/);
  if (!match || (fallbackItemId && match[2] !== fallbackItemId)) return null;
  parsed.hash = '';
  return {
    shopId: match[1],
    itemId: match[2],
    productLink: parsed.toString()
  };
}

function normalizeHttpsUrl(rawValue, allowedHost) {
  try {
    const parsed = new URL(String(rawValue || '').trim());
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname.toLowerCase() !== allowedHost
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function formatBrl(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value).replace(/\u00A0/g, ' ');
}

function normalizeShopeeProduct(row, source = {}) {
  const itemId = String(row.itemid || '').trim();
  const identity = parseProductIdentity(row.product_link, itemId);
  const image = normalizeHttpsUrl(row.image_link, 'cf.shopee.com.br');
  const originalPrice = parsePositiveNumber(row.price);
  const currentPrice = parsePositiveNumber(row.sale_price);
  const discount = parseNonNegativeNumber(row.discount_percentage);
  const itemRating = parseNonNegativeNumber(row.item_rating);
  const shopRating = parseNonNegativeNumber(row.shop_rating);
  const likes = Math.max(0, Number.parseInt(row.like || '0', 10) || 0);
  const title = String(row.title || '').trim();
  const shopName = String(row.shop_name || '').trim();
  const recurringPurchaseCategory = getRecurringPurchaseCategory(title);

  if (
    !identity ||
    !image ||
    !title ||
    !originalPrice ||
    !currentPrice ||
    currentPrice >= originalPrice ||
    discount === null ||
    itemRating === null
  ) {
    return null;
  }

  return {
    platform: 'shopee',
    dealId: `shopee:${identity.shopId}:${identity.itemId}`,
    shopId: identity.shopId,
    itemId: identity.itemId,
    title,
    link: identity.productLink,
    catalogShortLink: normalizeHttpsUrl(
      row['product_short link'],
      'shope.ee'
    ),
    affiliateLink: null,
    image,
    image3: normalizeHttpsUrl(row.image_link_3, 'cf.shopee.com.br'),
    rating: itemRating,
    shopRating,
    likes,
    shopName: shopName || null,
    salesInfo: shopName ? `Loja: ${shopName}` : 'Shopee Brasil',
    discount,
    originalPrice: formatBrl(originalPrice),
    currentPrice: formatBrl(currentPrice),
    originalPriceValue: originalPrice,
    currentPriceValue: currentPrice,
    category: String(row.global_category1 || '').trim(),
    subcategory: String(row.global_category2 || '').trim(),
    categoryDetail: String(row.global_category3 || '').trim(),
    condition: String(row.condition || '').trim(),
    crossBorder: row.cb_option === 'Cross border'
      ? true
      : row.cb_option === 'Non-Cross border'
        ? false
        : null,
    modelIds: String(row.model_ids || '').trim(),
    modelNames: String(row.model_names || '').trim(),
    officialFeed: source.officialFeed === true,
    recurringPurchase: !!recurringPurchaseCategory,
    recurringPurchaseCategory,
    isFull: false,
    isFreeShipping: false,
    dealType: source.officialFeed
      ? 'Feed oficial Shopee'
      : 'Feed Shopee',
    timeLeft: ''
  };
}

function compareDeals(left, right) {
  return (
    right.rating - left.rating ||
    right.discount - left.discount ||
    (right.shopRating ?? -1) - (left.shopRating ?? -1) ||
    right.likes - left.likes ||
    left.title.localeCompare(right.title, 'pt-BR')
  );
}

function keepBest(candidates, deal, maxProducts) {
  candidates.push(deal);
  if (candidates.length > maxProducts * 4) {
    candidates.sort(compareDeals);
    candidates.length = maxProducts;
  }
}

function positiveOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

async function importShopeeFeeds(inputPaths, options = {}) {
  const minDiscount = positiveOption(options.minDiscount, 30);
  const recurringMinDiscount = positiveOption(
    options.recurringMinDiscount,
    5
  );
  // ponytail: cap extreme feed discounts; replace with variant-level price
  // validation if Shopee adds per-model prices to the official feed.
  const maxDiscount = positiveOption(options.maxDiscount, 80);
  const minItemRating = positiveOption(options.minItemRating, 4.5);
  const minShopRating = positiveOption(options.minShopRating, 4.5);
  const maxProducts = Math.floor(positiveOption(options.maxProducts, 400));
  const maxRecurringProducts = Math.min(
    maxProducts,
    Math.floor(positiveOption(options.maxRecurringProducts, 100))
  );
  const includeCrossBorder = options.includeCrossBorder === true;
  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : path.resolve('shopee_deals_report.json');
  const candidates = [];
  const recurringCandidates = [];
  const catalog = [];
  const seen = new Set();
  const stats = {
    rowsRead: 0,
    accepted: 0,
    acceptedWithoutShopRating: 0,
    rejected: {
      malformed: 0,
      duplicate: 0,
      crossBorder: 0,
      discount: 0,
      extremeDiscount: 0,
      itemRating: 0,
      shopRating: 0
    }
  };
  const sourceFiles = [];

  const orderedInputPaths = [...inputPaths].sort((left, right) =>
    Number(/shopee oficial/i.test(right)) -
    Number(/shopee oficial/i.test(left))
  );
  for (const rawPath of orderedInputPaths) {
    const filePath = path.resolve(rawPath);
    const file = fs.statSync(filePath);
    const officialFeed = /shopee oficial/i.test(path.basename(filePath));
    sourceFiles.push({
      name: path.basename(filePath),
      bytes: file.size,
      modifiedAt: file.mtime.toISOString(),
      officialFeed
    });

    for await (const row of readCsvRows(filePath)) {
      stats.rowsRead += 1;
      const deal = normalizeShopeeProduct(row, { officialFeed });
      if (!deal) {
        stats.rejected.malformed += 1;
        continue;
      }
      if (seen.has(deal.dealId)) {
        stats.rejected.duplicate += 1;
        continue;
      }
      seen.add(deal.dealId);
      if (!includeCrossBorder && deal.crossBorder) {
        stats.rejected.crossBorder += 1;
        continue;
      }
      if (
        deal.discount < minDiscount &&
        (
          !deal.recurringPurchase ||
          deal.discount < recurringMinDiscount
        )
      ) {
        stats.rejected.discount += 1;
        continue;
      }
      if (deal.discount > maxDiscount) {
        stats.rejected.extremeDiscount += 1;
        continue;
      }
      if (deal.rating < minItemRating) {
        stats.rejected.itemRating += 1;
        continue;
      }
      if (
        deal.shopRating !== null &&
        deal.shopRating < minShopRating
      ) {
        stats.rejected.shopRating += 1;
        continue;
      }
      if (deal.shopRating === null) {
        stats.acceptedWithoutShopRating += 1;
      }
      stats.accepted += 1;
      catalog.push({
        dealId: deal.dealId,
        platform: deal.platform,
        title: deal.title,
        link: deal.link,
        image: deal.image,
        rating: deal.rating,
        discount: deal.discount,
        originalPrice: deal.originalPrice,
        currentPrice: deal.currentPrice,
        recurringPurchase: deal.recurringPurchase,
        recurringPurchaseCategory: deal.recurringPurchaseCategory
      });
      if (deal.discount >= minDiscount && !deal.recurringPurchase) {
        keepBest(candidates, deal, maxProducts);
      }
      if (deal.recurringPurchase) {
        keepBest(recurringCandidates, deal, maxRecurringProducts);
      }
    }
  }

  candidates.sort(compareDeals);
  recurringCandidates.sort(compareDeals);
  const selectedDeals = mixRecurringDeals(
    candidates,
    recurringCandidates,
    maxProducts,
    maxRecurringProducts
  );
  const generatedAt = new Date();
  const report = {
    generatedAt: generatedAt.toISOString(),
    generatedAtDisplay: generatedAt.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo'
    }),
    source: 'Shopee Affiliate Product Feed',
    selectionVersion: 2,
    filters: {
      minDiscount,
      recurringMinDiscount,
      maxDiscount,
      minItemRating,
      minShopRating,
      includeCrossBorder,
      maxProducts,
      maxRecurringProducts
    },
    sourceFiles,
    stats: {
      ...stats,
      uniqueProducts: seen.size,
      selected: selectedDeals.length,
      selectedRecurring: selectedDeals.filter(deal =>
        deal.recurringPurchase
      ).length
    },
    coupons: [],
    deals: selectedDeals,
    catalog
  };
  saveJsonAtomic(outputPath, report);
  return report;
}

async function main() {
  const inputPaths = process.argv.slice(2);
  if (!inputPaths.length) {
    throw new Error(
      'Uso: node execution/shopee_feed.js <feed.csv> [mais-feeds.csv]'
    );
  }
  const report = await importShopeeFeeds(inputPaths, {
    minDiscount: process.env.SHOPEE_MIN_DISCOUNT,
    recurringMinDiscount: process.env.SHOPEE_RECURRING_MIN_DISCOUNT,
    maxDiscount: process.env.SHOPEE_MAX_DISCOUNT,
    minItemRating: process.env.SHOPEE_MIN_ITEM_RATING,
    minShopRating: process.env.SHOPEE_MIN_SHOP_RATING,
    maxProducts: process.env.SHOPEE_MAX_PRODUCTS,
    maxRecurringProducts: process.env.SHOPEE_MAX_RECURRING_PRODUCTS,
    includeCrossBorder:
      String(process.env.SHOPEE_INCLUDE_CROSS_BORDER).toLowerCase() === 'true',
    outputPath:
      process.env.SHOPEE_OUTPUT_PATH || 'shopee_deals_report.json'
  });
  console.log(
    `[Shopee] ${report.stats.rowsRead} lidos, ` +
    `${report.stats.accepted} aprovados, ${report.stats.selected} selecionados.`
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[Shopee] Falha: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseCsvRecord,
  readCsvRows,
  parseProductIdentity,
  normalizeShopeeProduct,
  compareDeals,
  importShopeeFeeds
};
