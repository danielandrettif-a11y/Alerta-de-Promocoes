const fs = require('fs');
const path = require('path');

const MARKETPLACES = [
  {
    id: 'mercado_livre',
    label: 'Mercado Livre',
    host: 'mercadolivre.com.br',
    searchUrl: query =>
      `https://lista.mercadolivre.com.br/${encodeURIComponent(query).replace(/%20/g, '-')}`,
    cardSelectors: [
      'li.ui-search-layout__item',
      '.poly-card',
      '.ui-search-result'
    ],
    linkSelectors: [
      'a.poly-component__title',
      'a.ui-search-link',
      'a[href*="/MLB-"]'
    ],
    titleSelectors: [
      '.poly-component__title',
      'h2.ui-search-item__title',
      'h2'
    ],
    priceSelectors: [
      '.andes-money-amount__fraction',
      '.poly-price__current .andes-money-amount',
      '[class*="price"]'
    ]
  },
  {
    id: 'amazon',
    label: 'Amazon',
    host: 'amazon.com.br',
    searchUrl: query =>
      `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`,
    cardSelectors: ['[data-component-type="s-search-result"]'],
    linkSelectors: ['h2 a', 'a.a-link-normal[href*="/dp/"]'],
    titleSelectors: ['h2 span', 'h2'],
    priceSelectors: ['.a-price .a-offscreen', '.a-price-whole']
  },
  {
    id: 'magalu',
    label: 'Magalu',
    host: 'magazineluiza.com.br',
    searchUrl: query =>
      `https://www.magazineluiza.com.br/busca/${encodeURIComponent(query)}/`,
    cardSelectors: [
      '[data-testid="product-card-container"]',
      '[data-testid="product-card-content"]'
    ],
    linkSelectors: ['a[href*="/p/"]', 'a'],
    titleSelectors: ['[data-testid="product-title"]', 'h2', 'h3'],
    priceSelectors: [
      '[data-testid="price-value"]',
      '[data-testid="price-original"]',
      '[class*="price"]'
    ]
  },
  {
    id: 'casas_bahia',
    label: 'Casas Bahia',
    host: 'casasbahia.com.br',
    searchUrl: query =>
      `https://www.casasbahia.com.br/${encodeURIComponent(query)}/b`,
    cardSelectors: [
      '[data-testid*="product"]',
      '[class*="ProductCard"]',
      'article'
    ],
    linkSelectors: ['a[href*="/p/"]', 'a'],
    titleSelectors: [
      '[data-testid*="title"]',
      '[class*="Title"]',
      'h2',
      'h3'
    ],
    priceSelectors: [
      '[data-testid*="price"]',
      '[class*="Price"]',
      '[class*="price"]'
    ]
  }
];

function findBrowserPath() {
  const candidates = [
    process.env.BROWSER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(
      process.env.USERPROFILE || 'C:\\Users\\danie',
      'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
    ),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) ||
    null;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getQueryTokens(query) {
  const ignored = new Set([
    'a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'o', 'os',
    'para', 'por', 'um', 'uma'
  ]);
  return [...new Set(normalizeText(query).split(' '))]
    .filter(token => token.length >= 2 && !ignored.has(token));
}

function isRelevantTitle(title, query) {
  const tokens = getQueryTokens(query);
  if (!tokens.length) return false;
  const normalizedTitle = normalizeText(title);
  const matches = tokens.filter(token => normalizedTitle.includes(token));
  const required = tokens.length <= 2 ? 1 : Math.ceil(tokens.length * 0.5);
  return matches.length >= required;
}

function parseMarketplacePrice(value) {
  const match = String(value || '').match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!match) return null;
  const parsed = Number.parseFloat(
    match[1].replace(/\./g, '').replace(',', '.')
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMarketplacePrice(value) {
  if (!Number.isFinite(value)) return null;
  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function isAllowedMarketplaceUrl(value, host) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      (
        parsed.hostname === host ||
        parsed.hostname.endsWith(`.${host}`)
      );
  } catch {
    return false;
  }
}

function cleanProductUrl(value, host) {
  if (!isAllowedMarketplaceUrl(value, host)) return null;
  const parsed = new URL(value);
  if (host === 'amazon.com.br') {
    const productPath = parsed.pathname.match(
      /^(.*?\/dp\/[A-Z0-9]{10})(?:\/|$)/i
    );
    if (productPath) parsed.pathname = productPath[1];
  }
  const keptParams = new URLSearchParams();
  for (const key of ['variation', 'attributes']) {
    if (parsed.searchParams.has(key)) {
      keptParams.set(key, parsed.searchParams.get(key));
    }
  }
  parsed.search = keptParams.toString();
  parsed.hash = '';
  return parsed.toString();
}

function dedupeResults(results) {
  const unique = new Map();
  for (const result of results) {
    const key = `${result.marketplace}:${result.url}`;
    if (!unique.has(key)) unique.set(key, result);
  }
  return [...unique.values()];
}

function readCache(cachePath) {
  if (!cachePath || !fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(cachePath, cache) {
  if (!cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const newest = Object.fromEntries(
    Object.entries(cache)
      .sort((a, b) => new Date(b[1].checkedAt) - new Date(a[1].checkedAt))
      .slice(0, 100)
  );
  fs.writeFileSync(cachePath, JSON.stringify(newest, null, 2), 'utf8');
}

async function scrapeMarketplace(browser, marketplace, query, maxResults) {
  let page;
  const searchUrl = marketplace.searchUrl(query);
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
    );
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });
    await page.waitForFunction(
      selectors => selectors.some(selector => document.querySelector(selector)),
      { timeout: 8000 },
      marketplace.cardSelectors
    ).catch(() => {});

    const rawResults = await page.evaluate(config => {
      const firstMatch = (root, selectors) => {
        for (const selector of selectors) {
          const match = root.querySelector(selector);
          if (match) return match;
        }
        return null;
      };
      const cards = [];
      const seenCards = new Set();
      for (const selector of config.cardSelectors) {
        for (const card of document.querySelectorAll(selector)) {
          if (!seenCards.has(card)) {
            seenCards.add(card);
            cards.push(card);
          }
        }
      }
      return cards.slice(0, 40).map(card => {
        const linkElement = firstMatch(card, config.linkSelectors);
        const titleElement = firstMatch(card, config.titleSelectors);
        const priceElement = firstMatch(card, config.priceSelectors);
        const imageElement = card.querySelector('img');
        return {
          title: titleElement?.textContent?.trim() ||
            linkElement?.getAttribute('title')?.trim() || '',
          url: linkElement?.href || '',
          priceText: priceElement?.textContent?.trim() || '',
          image: imageElement?.currentSrc || imageElement?.src ||
            imageElement?.getAttribute('data-src') || ''
        };
      });
    }, marketplace);

    const results = [];
    for (const item of rawResults) {
      const url = cleanProductUrl(item.url, marketplace.host);
      if (!url || !isRelevantTitle(item.title, query)) continue;
      const price = parseMarketplacePrice(item.priceText);
      results.push({
        marketplace: marketplace.id,
        marketplaceLabel: marketplace.label,
        title: item.title.replace(/\s+/g, ' ').trim(),
        price,
        priceText: formatMarketplacePrice(price),
        image: /^https:\/\//i.test(item.image) ? item.image : null,
        url
      });
      if (results.length >= maxResults) break;
    }
    return {
      marketplace: marketplace.id,
      marketplaceLabel: marketplace.label,
      searchUrl,
      results
    };
  } catch (error) {
    return {
      marketplace: marketplace.id,
      marketplaceLabel: marketplace.label,
      searchUrl,
      results: [],
      error: error.message
    };
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
  }
}

async function searchMarketplaces({
  query,
  cachePath,
  cacheMinutes = 30,
  maxPerMarketplace = 4
}) {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 2) {
    return { success: false, error: 'Informe um produto para pesquisar.' };
  }
  const cache = readCache(cachePath);
  const cacheKey = normalizedQuery;
  const cached = cache[cacheKey];
  if (
    cached &&
    Date.now() - new Date(cached.checkedAt).getTime() < cacheMinutes * 60000
  ) {
    return { ...cached, cached: true };
  }

  const executablePath = findBrowserPath();
  if (!executablePath) {
    return { success: false, error: 'Chrome/Chromium nao encontrado.' };
  }

  let browser;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ]
    });
    const sources = await Promise.all(
      MARKETPLACES.map(marketplace =>
        scrapeMarketplace(
          browser,
          marketplace,
          String(query).trim(),
          maxPerMarketplace
        )
      )
    );
    const results = dedupeResults(sources.flatMap(source => source.results));
    if (sources.every(source => source.error)) {
      return {
        success: false,
        error: 'Todos os marketplaces bloquearam ou falharam na consulta.',
        sources: sources.map(source => ({
          marketplace: source.marketplace,
          marketplaceLabel: source.marketplaceLabel,
          searchUrl: source.searchUrl,
          count: 0,
          error: source.error
        }))
      };
    }
    const response = {
      success: true,
      query: String(query).trim(),
      results,
      sources: sources.map(source => ({
        marketplace: source.marketplace,
        marketplaceLabel: source.marketplaceLabel,
        searchUrl: source.searchUrl,
        count: source.results.length,
        error: source.error || null
      })),
      checkedAt: new Date().toISOString()
    };
    cache[cacheKey] = response;
    writeCache(cachePath, cache);
    return response;
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

module.exports = {
  MARKETPLACES,
  normalizeText,
  getQueryTokens,
  isRelevantTitle,
  parseMarketplacePrice,
  isAllowedMarketplaceUrl,
  cleanProductUrl,
  dedupeResults,
  searchMarketplaces
};
