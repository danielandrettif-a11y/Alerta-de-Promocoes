const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  buscape: 'https://www.buscape.com.br/search?q=',
  zoom: 'https://www.zoom.com.br/search?q=',
  bondfaro: 'https://www.bondfaro.com.br/search?q='
};

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
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || null;
}

function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '')
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value) {
  return `R$ ${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function cleanSearchQuery(title) {
  const normalized = String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s"-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stopWords = new Set([
    'com', 'para', 'frete', 'gratis', 'original', 'promocao', 'oficial',
    'novo', 'nova', 'kit', 'cor', 'modelo'
  ]);
  const tokens = normalized.split(' ')
    .filter(token => token.length > 1 && !stopWords.has(token));
  const modelTokens = tokens.filter(token =>
    /[a-z]/i.test(token) && /\d/.test(token)
  );
  const numericModelTokens = tokens.filter(token => /^\d{2,}$/.test(token));
  const selected = [...new Set([
    ...modelTokens,
    ...numericModelTokens,
    ...tokens.filter(token => token.length >= 4)
  ])];
  return selected.slice(0, 6).join(' ');
}

function getIdentityTokens(query) {
  return String(query || '').split(/\s+/).filter(token =>
    (
      (/[a-z]/i.test(token) && /\d/.test(token)) ||
      /^\d{2,}$/.test(token)
    ) &&
    token.length >= 2
  );
}

function isPlausibleComparison(currentPrice, marketPrice) {
  const current = parsePrice(currentPrice);
  const market = parsePrice(marketPrice);
  if (!current || !market) return false;
  return market >= current * 0.45 && market <= current * 2.5;
}

function assessComparison(currentPrice, marketPrice) {
  const current = parsePrice(currentPrice);
  const market = parsePrice(marketPrice);
  if (!current || !market) {
    return { code: 'unavailable', label: 'Comparação indisponível', difference: 0 };
  }
  const difference = market - current;
  const tolerance = current * 0.03;
  if (difference > tolerance) {
    return { code: 'good', label: 'Bom preço frente aos comparadores', difference };
  }
  if (difference < -tolerance) {
    return { code: 'higher', label: 'Há preço menor em outro comparador', difference };
  }
  return { code: 'similar', label: 'Preço semelhante ao mercado', difference };
}

function buildWhatsappComparison(comparison, currentPrice) {
  if (!comparison?.success) {
    return '\n\n📊 *Comparação básica de preços:*\n' +
      '• Não foi possível confirmar preços equivalentes agora.\n' +
      '• _Confira modelo, frete e vendedor antes de comprar._';
  }
  const assessment = assessComparison(currentPrice, comparison.minPrice);
  const sourcesCount = Number(comparison.sourcesCount) || 1;
  const sourceWord = sourcesCount === 1 ? 'comparador' : 'comparadores';
  let text = '\n\n📊 *Comparação básica de preços:*\n' +
    `• Menor preço semelhante encontrado: *${comparison.priceText}*\n` +
    `• Base: ${sourcesCount} ${sourceWord}\n`;
  if (assessment.code === 'good') {
    text += `• Diferença estimada: *${formatPrice(assessment.difference)} mais barato*\n`;
    text += '• Avaliação: ✅ *Parece uma boa promoção*';
  } else if (assessment.code === 'higher') {
    text += `• Diferença estimada: *${formatPrice(Math.abs(assessment.difference))} mais caro*\n`;
    text += '• Avaliação: ⚠️ *Encontramos preço menor*';
  } else {
    text += '• Avaliação: ⚖️ *Preço próximo ao mercado*';
  }
  return `${text}\n• _Estimativa automática; confirme modelo, frete e vendedor._`;
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
      .slice(0, 500)
  );
  fs.writeFileSync(cachePath, JSON.stringify(newest, null, 2), 'utf8');
}

async function scrapeProvider(
  browser,
  provider,
  url,
  queryTokens,
  identityTokens,
  currentPrice
) {
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(
      () => document.body?.innerText.includes('R$'),
      { timeout: 6000 }
    );
    const result = await page.evaluate((tokens, requiredIdentity, targetPrice) => {
      const normalize = value => String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
      const cards = Array.from(document.querySelectorAll(
        '[class*="ProductCard"], [class*="HitCard"], ' +
        '[class*="ProductCardArea"], article'
      ));
      const lowerBound = targetPrice > 0 ? targetPrice * 0.45 : 15;
      const upperBound = targetPrice > 0 ? targetPrice * 2.5 : Infinity;
      const relevantTokens = tokens.filter(token => token.length >= 4);
      const prices = [];
      for (const card of cards) {
        const cardText = normalize(card.innerText);
        if (
          requiredIdentity.length &&
          !requiredIdentity.every(token => cardText.includes(normalize(token)))
        ) continue;
        const tokenMatches = relevantTokens.filter(token =>
          cardText.includes(normalize(token))
        ).length;
        const requiredMatches = Math.min(
          3,
          Math.max(1, Math.ceil(relevantTokens.length * 0.5))
        );
        if (relevantTokens.length && tokenMatches < requiredMatches) continue;
        for (const element of card.querySelectorAll('strong, span, p, div')) {
          const text = element.textContent.trim();
          if (
            !text.includes('R$') ||
            text.length > 45 ||
            /\b\d+\s*x\b/i.test(text) ||
            element.closest('del, s')
          ) continue;
          const match = text.match(/R\$\s*([0-9.,]+)/i);
          if (!match) continue;
          const value = Number.parseFloat(
            match[1].replace(/\./g, '').replace(',', '.')
          );
          if (
            Number.isFinite(value) &&
            value >= lowerBound &&
            value <= upperBound
          ) prices.push(value);
        }
      }
      return prices.length ? Math.min(...prices) : null;
    }, queryTokens, identityTokens, currentPrice);
    return result ? {
      provider,
      price: result,
      priceText: formatPrice(result),
      url
    } : null;
  } catch {
    return null;
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
  }
}

async function compareProductPrices({
  title,
  currentPrice,
  cachePath,
  cacheMinutes = 360
}) {
  const query = cleanSearchQuery(title);
  const numericCurrentPrice = parsePrice(currentPrice);
  if (!query) return { success: false, error: 'Produto sem termos para comparação.' };

  const cacheKey = query;
  const cache = readCache(cachePath);
  const cached = cache[cacheKey];
  if (
    cached &&
    Date.now() - new Date(cached.checkedAt).getTime() < cacheMinutes * 60000 &&
    isPlausibleComparison(numericCurrentPrice, cached.minPrice)
  ) {
    return { ...cached, cached: true };
  }

  const executablePath = findBrowserPath();
  if (!executablePath) {
    return { success: false, query, error: 'Chrome/Chromium não encontrado.' };
  }

  let browser;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const queryTokens = query.split(' ');
    const identityTokens = getIdentityTokens(query);
    const providerEntries = Object.entries(PROVIDERS);
    const results = await Promise.all(providerEntries.map(([provider, baseUrl]) =>
      scrapeProvider(
        browser,
        provider,
        `${baseUrl}${encodeURIComponent(query)}`,
        queryTokens,
        identityTokens,
        numericCurrentPrice
      )
    ));
    const valid = results.filter(result =>
      result && isPlausibleComparison(numericCurrentPrice, result.price)
    );
    if (!valid.length) {
      return {
        success: false,
        query,
        checkedAt: new Date().toISOString(),
        error: 'Nenhum produto suficientemente semelhante foi encontrado.'
      };
    }
    const best = valid.reduce((lowest, item) =>
      item.price < lowest.price ? item : lowest
    );
    const response = {
      success: true,
      query,
      minPrice: best.price,
      priceText: best.priceText,
      url: best.url,
      sourcesCount: valid.length,
      checkedAt: new Date().toISOString(),
      providers: Object.fromEntries(
        results.map((result, index) => [
          providerEntries[index][0],
          result
        ])
      )
    };
    cache[cacheKey] = response;
    writeCache(cachePath, cache);
    return response;
  } catch (error) {
    return { success: false, query, error: error.message };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

module.exports = {
  parsePrice,
  formatPrice,
  cleanSearchQuery,
  getIdentityTokens,
  isPlausibleComparison,
  assessComparison,
  buildWhatsappComparison,
  compareProductPrices
};
