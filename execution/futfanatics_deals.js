/**
 * execution/futfanatics_deals.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Determinística)
 *
 * Scraper de ofertas do marketplace FutFanatics com Puppeteer.
 * Captura ofertas da página de Outlet/Busca, categoriza via
 * category_helper.js e gera a base rica de dados em futfanatics_deals_report.json.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { inferCategoryAndSub } = require('./category_helper.js');

const ROOT_DIR = path.resolve(__dirname, '..');

function readEnv() {
  const env = { ...process.env };
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return env;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) {
      env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return env;
}

function findBrowserPath(env = process.env) {
  const possiblePaths = [
    env.BROWSER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.USERPROFILE || 'C:\\Users\\danie', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];

  for (const executablePath of possiblePaths.filter(Boolean)) {
    if (fs.existsSync(executablePath)) {
      return executablePath;
    }
  }
  return null;
}

function cleanPriceString(priceStr) {
  if (!priceStr) return '';
  const match = String(priceStr).match(/R\$\s*[0-9.,]+/i);
  if (match) {
    return match[0].replace(/\s+/g, ' ');
  }
  return String(priceStr).trim();
}

function parseNumericPrice(priceStr) {
  if (!priceStr) return 0;
  const clean = String(priceStr).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function buildAffiliateLink(productUrl, env = process.env) {
  const publisherId = env.FUTFANATICS_AWIN_PUBLISHER_ID || env.AWIN_PUBLISHER_ID;

  if (!publisherId) {
    return productUrl;
  }
  if (!/^\d+$/.test(publisherId)) {
    throw new Error('O Publisher ID Awin da FutFanatics precisa ser numérico.');
  }
  const params = new URLSearchParams({
    awinmid: '17893',
    awinaffid: publisherId,
    ued: productUrl
  });
  return `https://www.awin1.com/cread.php?${params}`;
}

function selectVerifiedDeals(deals, limit = 400, env = process.env) {
  const minDiscount = Number(env.FUTFANATICS_MIN_DISCOUNT || 20);
  return deals
    .filter(deal => {
      const discountVal = Number(deal.discount) || 0;
      const origPrice = parseNumericPrice(deal.originalPrice);
      const currPrice = parseNumericPrice(deal.currentPrice);

      if (discountVal < minDiscount) return false;
      if (origPrice > 0 && currPrice >= origPrice) return false;
      if (currPrice <= 0) return false;
      return true;
    })
    .sort((a, b) => (Number(b.discount) || 0) - (Number(a.discount) || 0))
    .slice(0, limit);
}

async function scrapeDealsFromPage(page, pageNum = 1) {
  const targetUrl = `https://www.futfanatics.com.br/loja/busca.php?loja=311840&categoria=495&pg=${pageNum}`;
  console.log(`[FutFanatics] Navegando para página ${pageNum}: ${targetUrl}`);

  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 40000
    });

    try {
      await page.evaluate(() => window.scrollBy(0, 800));
    } catch (e) {}
    
    await new Promise(r => setTimeout(r, 2000));

    const scrapingLogic = () => {
      const items = [];
      const links = document.querySelectorAll('a[href*="futfanatics.com.br/"]');

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href.includes('/carrinho') || href.includes('/conta') || href.includes('javascript:')) return;

        const titleEl = link.querySelector('h4, div[class*="title"], div[class*="nome"], .product-name');
        const titleText = titleEl ? titleEl.textContent.trim() : link.textContent.trim();

        if (!titleText || titleText.length < 5) return;

        const imgEl = link.querySelector('img');
        let imgSrc = '';
        if (imgEl) {
          const candidate = imgEl.getAttribute('data-src') || imgEl.getAttribute('data-original') || imgEl.getAttribute('data-lazy') || imgEl.getAttribute('src') || '';
          if (candidate && !candidate.includes('loading.svg')) {
            imgSrc = candidate;
          } else {
            const srcset = imgEl.getAttribute('data-srcset') || imgEl.getAttribute('srcset') || '';
            if (srcset) {
              const parts = srcset.split(',');
              const last = parts[parts.length - 1].trim().split(' ')[0];
              if (last && !last.includes('loading.svg')) imgSrc = last;
            }
            if (!imgSrc && candidate) imgSrc = candidate;
          }
        }

        const textContent = link.innerText || link.textContent || '';

        // Procura descontos no card
        const discountMatch = textContent.match(/(\d+)%\s*(?:off|desconto)/i);
        const discount = discountMatch ? parseInt(discountMatch[1], 10) : 0;

        // Procura preços
        const prices = textContent.match(/R\$\s*[\d.,]+/gi) || [];
        let originalPrice = '';
        let currentPrice = '';

        if (prices.length >= 2) {
          originalPrice = prices[0];
          currentPrice = prices[1];
        } else if (prices.length === 1) {
          currentPrice = prices[0];
        }

        // Procura cupons na página/card
        const couponMatch = textContent.match(/cupom[:\s]+([A-Z0-9]+)/i) || textContent.match(/(?:use|código)[:\s]+([A-Z0-9]+)/i);
        const couponBadge = couponMatch ? couponMatch[1] : null;

        if (currentPrice && href) {
          items.push({
            title: titleText.replace(/\s+/g, ' '),
            rawLink: href.startsWith('http') ? href : `https://www.futfanatics.com.br${href}`,
            image: imgSrc,
            originalPrice,
            currentPrice,
            discount,
            couponBadge
          });
        }
      });

      return items;
    };

    let rawDeals = [];
    try {
      rawDeals = await page.evaluate(scrapingLogic);
    } catch (evalErr) {
      if (evalErr.message.includes('Execution context was destroyed')) {
        console.warn(`[FutFanatics] Contexto destruído na página ${pageNum}. Aguardando estabilização e tentando novamente...`);
        await new Promise(r => setTimeout(r, 4000));
        rawDeals = await page.evaluate(scrapingLogic);
      } else {
        throw evalErr;
      }
    }

    return rawDeals;
  } catch (err) {
    throw new Error(`Falha ao raspar a página ${pageNum}: ${err.message}`);
  }
}

async function fetchFutFanaticsDeals(options = {}) {
  const env = options.env || readEnv();
  const browserPath = findBrowserPath(env);
  if (!browserPath) {
    throw new Error('Navegador Chrome/Edge não encontrado.');
  }

  const headless = env.FUTFANATICS_HEADLESS !== 'false';
  console.log(`[FutFanatics] Iniciando coleta de ofertas (headless: ${headless})...`);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let allRawDeals = [];
    const maxPages = 3;

    for (let p = 1; p <= maxPages; p++) {
      const deals = await scrapeDealsFromPage(page, p);
      allRawDeals = allRawDeals.concat(deals);
      if (deals.length === 0) break;
    }

    // Remover duplicados por link
    const uniqueMap = new Map();
    allRawDeals.forEach(item => {
      if (!uniqueMap.has(item.rawLink)) {
        uniqueMap.set(item.rawLink, item);
      }
    });

    const processedDeals = Array.from(uniqueMap.values()).map(raw => {
      const origNum = parseNumericPrice(raw.originalPrice);
      let currNum = parseNumericPrice(raw.currentPrice);
      let calcDiscount = raw.discount;

      if (origNum > 0 && currNum > 0 && origNum > currNum && !calcDiscount) {
        calcDiscount = Math.round(((origNum - currNum) / origNum) * 100);
      }

      // Se não tinha preço original mas tinha desconto informado
      let formattedOrig = cleanPriceString(raw.originalPrice);
      if (!formattedOrig && origNum === 0 && calcDiscount > 0 && currNum > 0) {
        const inferredOrig = currNum / (1 - calcDiscount / 100);
        formattedOrig = `R$ ${inferredOrig.toFixed(2).replace('.', ',')}`;
      }

      const { category, subcategory, icon } = inferCategoryAndSub(raw.title);

      return {
        title: raw.title,
        link: buildAffiliateLink(raw.rawLink, env),
        rawLink: raw.rawLink,
        image: raw.image,
        originalPrice: formattedOrig,
        currentPrice: cleanPriceString(raw.currentPrice),
        discount: calcDiscount,
        isFreeShipping: false,
        platform: 'futfanatics',
        dealType: 'Oferta Outlet',
        couponBadge: raw.couponBadge || null,
        category: category || 'Saúde, Fitness e Esportes',
        subcategory: subcategory || 'Camisas de Futebol e Mantos',
        categoryIcon: icon || '💪'
      };
    });

    const maxProducts = Math.max(
      1,
      Number(env.FUTFANATICS_MAX_PRODUCTS) || 400
    );
    const finalDeals = selectVerifiedDeals(processedDeals, maxProducts, env);
    if (finalDeals.length === 0) {
      throw new Error('A coleta não encontrou ofertas válidas; o relatório anterior foi preservado.');
    }

    const report = {
      generatedAt: new Date().toISOString(),
      totalFound: finalDeals.length,
      affiliateConfigured: Boolean(
        env.FUTFANATICS_AWIN_PUBLISHER_ID || env.AWIN_PUBLISHER_ID
      ),
      catalog: finalDeals,
      deals: finalDeals
    };

    return report;

  } catch (err) {
    console.error('[FutFanatics] Falha crítica durante execução:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function run() {
  const env = readEnv();
  const report = await fetchFutFanaticsDeals({ env });

  const runtimeDir = env.APP_RUNTIME_DIR || ROOT_DIR;
  const outputPath = path.join(runtimeDir, 'futfanatics_deals_report.json');

  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(report, null, 2), 'utf8');
  fs.renameSync(tmpPath, outputPath);

  console.log(`[FutFanatics] Relatório gravado com sucesso em ${outputPath} (${report.deals.length} ofertas).`);
}

if (require.main === module) {
  run();
}

module.exports = {
  fetchFutFanaticsDeals,
  parseNumericPrice,
  cleanPriceString,
  selectVerifiedDeals,
  buildAffiliateLink
};
