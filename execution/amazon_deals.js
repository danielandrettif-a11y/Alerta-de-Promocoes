/**
 * execution/amazon_deals.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Determinística)
 *
 * Scraper de ofertas da Amazon Brasil com Puppeteer.
 * Roda headless: false localmente (para visualização e evasão de bots)
 * e headless: true na VPS (Linux).
 * Captura ofertas da página de Deals e Bestsellers, categoriza via
 * category_helper.js e gera a base rica de dados em amazon_deals_report.json.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { inferCategoryAndSub, getRecurringPurchaseCategory } = require('./category_helper.js');

function findBrowserPath(env = process.env, exists = fs.existsSync) {
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
    if (exists(executablePath)) {
      return executablePath;
    }
  }
  return null;
}

function cleanPriceString(priceStr) {
  if (!priceStr) return '';
  let clean = priceStr.replace(/Preço\s+da\s+Oferta:\s*/i, '').trim();
  const match = clean.match(/R\$\s*[0-9.,]+/i);
  if (match) {
    return match[0].replace(/\s+/g, ' ');
  }
  return clean;
}

function parseNumericPrice(priceStr) {
  if (!priceStr) return 0;
  const clean = priceStr.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parsePromotionText(text) {
  const value = String(text || '');
  return {
    discount: Number(value.match(/(\d+)%\s*off/i)?.[1]) || 0,
    originalPrice: value.match(
      /De:\s*(?:De:\s*)?(R\$\s*[\d.,]+)/i
    )?.[1] || ''
  };
}

function selectVerifiedDeals(deals, limit = 50) {
  return deals
    .filter(deal => Number(deal.discount) > 0 &&
      parseNumericPrice(deal.originalPrice) > parseNumericPrice(deal.currentPrice))
    .sort((a, b) => b.discount - a.discount)
    .slice(0, limit);
}

function saveAmazonReport(reportPath, deals, generatedAt = new Date().toISOString()) {
  if (!Array.isArray(deals) || deals.length === 0) {
    throw new Error('A coleta não encontrou ofertas válidas; o catálogo anterior foi preservado.');
  }
  const temporaryPath = `${reportPath}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    JSON.stringify({ generatedAt, deals }, null, 2),
    'utf-8'
  );
  fs.renameSync(temporaryPath, reportPath);
}

async function scrapeDealsFromPage(page, url) {
  console.log(`Navegando para: ${url}`);
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 35000
    });
  } catch (err) {
    console.warn(`⚠️ Timeout/Aviso navegando para ${url}: ${err.message}`);
  }

  await new Promise(r => setTimeout(r, 4000));

  // Rola a página para acionar o lazy loading
  for (let scroll = 0; scroll < 4; scroll++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 1200));
  }

  const rawDeals = await page.evaluate(() => {
    const dealsList = [];
    const seenLinks = new Set();

    // Coleção ampla de seletores da Amazon Brasil
    const cardSelectors = [
      '[data-testid="discount-asin-grid"] [data-test-index]',
      '[class*="DesktopDiscountAsinGrid-module__root"] [data-test-index]',
      '[data-testid="grid-de-ofertas"] > div',
      '[data-testid="deal-card"]',
      'div[class*="DealCard-module"]',
      'div[class*="ProductCard-module"]',
      'div[data-asin]',
      '.a-cardui[data-asin]',
      'div.zg-grid-general-faceout',
      'div.p13n-sc-unroller',
      '.p13n-grid-content'
    ];

    const containers = Array.from(document.querySelectorAll(cardSelectors.join(', ')));

    // Fallback: se nenhum container específico for achado, busca cards por estrutura genérica contendo link de produto e preço R$
    if (containers.length === 0) {
      const allDivs = document.querySelectorAll('div.a-section');
      allDivs.forEach(div => {
        if (div.querySelector('a[href*="/dp/"], a[href*="/gp/product/"]') && div.textContent.includes('R$')) {
          containers.push(div);
        }
      });
    }

    containers.forEach(container => {
      const linkEl = container.querySelector('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/deal/"], a.a-link-normal');
      if (!linkEl) return;

      let link = linkEl.href;
      if (!link || link.startsWith('javascript:')) return;
      
      // Normaliza link da Amazon para remover parâmetros desnecessários
      try {
        const urlObj = new URL(link);
        const asinMatch = urlObj.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        if (asinMatch) {
          link = `https://www.amazon.com.br/dp/${asinMatch[1]}`;
        }
      } catch (e) {}

      if (seenLinks.has(link)) return;
      seenLinks.add(link);

      // Imagem do produto
      const imgEl = container.querySelector('img');
      let image = imgEl ? (imgEl.getAttribute('data-old-hires') || imgEl.src || imgEl.getAttribute('data-src') || '') : '';
      if (image.startsWith('data:')) image = '';

      // Título do produto
      let title = imgEl && imgEl.alt ? imgEl.alt.trim() : '';
      if (!title || title.toLowerCase().includes('oferta') || title.length < 6) {
        const titleEl = container.querySelector(
          '[class*="DealCard-module__titleText"], [class*="ProductCard-module__title"], .p13n-sc-truncate, ._cDEfh_name_1_H, h4, h2, span.a-truncate-full'
        );
        if (titleEl) title = titleEl.textContent.trim();
      }

      if (!title || title.length < 4) return;

      // Desconto
      const discountEl = container.querySelector('[class*="Badge-module__badgeText"], [class*="DiscountBadge"], .a-badge-text, [class*="badgeText"]');
      let discountText = discountEl ? discountEl.textContent.trim() : '';
      let discount = 0;
      const discountMatch = discountText.match(/([0-9]+)%\s*off/i);
      if (discountMatch) {
        discount = parseInt(discountMatch[1], 10);
      }

      // Preço atual (Promo)
      const currentPriceEl = container.querySelector('[class*="Price-module__priceText"], [class*="PriceText"], .a-price .a-offscreen, span.a-price');
      let currentPrice = currentPriceEl ? currentPriceEl.textContent.trim() : '';
      
      if (!currentPrice) {
        const priceMatch = container.textContent.match(/R\$\s*[0-9.,]+/i);
        if (priceMatch) currentPrice = priceMatch[0];
      }

      // Preço original (Riscado)
      const originalPriceEl = container.querySelector('[class*="Price-module__strikeThrough"], .a-text-strike, span.a-color-secondary');
      let originalPrice = originalPriceEl ? originalPriceEl.textContent.trim() : '';

      // Badge de Cupom de Clipe Amazon
      const couponEl = container.querySelector('[class*="coupon"], [class*="Coupon"], .a-badge-coupon, [data-badge-type="COUPON"]');
      let couponBadge = couponEl ? couponEl.textContent.trim() : null;
      const ratingText = container.querySelector('[aria-label*="de 5 estrelas"], [aria-label*="out of 5 stars"]')
        ?.getAttribute('aria-label') || '';
      const rating = Number(ratingText.match(/([0-5](?:[.,]\d)?)/)?.[1]?.replace(',', '.')) || 0;
      const reviewText = container.textContent.match(/([\d.,]+)\s*(?:avalia[cç][oõ]es|classifica[cç][oõ]es)/i)?.[1] || '';
      const reviewCount = Number(reviewText.replace(/\./g, '').replace(',', '.')) || 0;
      const salesInfo = container.textContent.match(/([\d.,]+\+?\s*(?:mil)?\s*comprad[oa]s?[^.\n]*)/i)?.[1]?.trim() || '';

      if (!currentPrice || !currentPrice.includes('R$')) return;

      dealsList.push({
        title,
        link,
        image,
        cardText: container.textContent,
        discount,
        originalPrice,
        currentPrice,
        isFreeShipping: true,
        dealType: discount >= 30 ? "Oferta Relâmpago" : "Oferta do Dia",
        timeLeft: "",
        couponBadge,
        rating,
        reviewCount,
        salesInfo
      });
    });

    return dealsList;
  });

  return rawDeals || [];
}

async function main() {
  console.log("===============================================");
  console.log("Amazon Deals Scraper (Multi-Category & Stealth)");
  console.log("===============================================");

  const browserPath = findBrowserPath();
  if (!browserPath) {
    console.error("❌ Navegador Chrome/Chromium não localizado; catálogo anterior preservado.");
    process.exitCode = 1;
    return;
  }

  const amazonDealsPath = path.join(__dirname, '..', 'amazon_deals_report.json');
  const isLinux = process.platform === 'linux';
  const isHeadless = isLinux;

  console.log(`Configuração: Headless = ${isHeadless} | SO = ${process.platform}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: isHeadless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1366,768',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      ]
    });
  } catch (err) {
    console.error("❌ Falha ao abrir navegador:", err.message);
    process.exitCode = 1;
    return;
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const targetUrls = [
      'https://www.amazon.com.br/deals',
      'https://www.amazon.com.br/gp/bestsellers/computers/',
      'https://www.amazon.com.br/gp/bestsellers/electronics/',
      'https://www.amazon.com.br/gp/bestsellers/kitchen/'
    ];

    let allExtractedDeals = [];

    for (const url of targetUrls) {
      const deals = await scrapeDealsFromPage(page, url);
      console.log(` Extraídos ${deals.length} itens da URL: ${url}`);
      allExtractedDeals = allExtractedDeals.concat(deals);
      if (allExtractedDeals.length >= 60) break;
    }

    await browser.close();

    const tag = process.env.AMAZON_ASSOCIATE_TAG || 'alertadesc0dd-20';
    const seenTitles = new Set();
    const formattedDeals = [];

    for (const d of allExtractedDeals) {
      if (seenTitles.has(d.title.toLowerCase())) continue;
      seenTitles.add(d.title.toLowerCase());

      const promotion = parsePromotionText(d.cardText);
      let curStr = cleanPriceString(d.currentPrice);
      let origStr = cleanPriceString(d.originalPrice);
      if (!parseNumericPrice(origStr)) {
        origStr = cleanPriceString(promotion.originalPrice);
      }

      const curVal = parseNumericPrice(curStr);
      let origVal = parseNumericPrice(origStr);

      let discount = d.discount || promotion.discount;

      if (curVal > 0 && origVal > curVal && discount === 0) {
        discount = Math.round(((origVal - curVal) / origVal) * 100);
      }

      if (!origStr || origVal <= curVal) {
        if (discount > 0 && curVal > 0) {
          origVal = curVal / (1 - (discount / 100));
          origStr = `R$ ${origVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
          origStr = curStr;
          discount = 0;
        }
      }

      // Tag de afiliado
      let affiliateLink = d.link;
      try {
        const urlObj = new URL(d.link);
        urlObj.searchParams.set('tag', tag);
        affiliateLink = urlObj.toString();
      } catch (e) {
        affiliateLink += (affiliateLink.includes('?') ? '&' : '?') + `tag=${tag}`;
      }

      // Categorização Taxonômica
      const catInfo = inferCategoryAndSub(d.title);
      const recurringCat = getRecurringPurchaseCategory(d.title);

      formattedDeals.push({
        title: d.title,
        link: affiliateLink,
        image: d.image || 'https://m.media-amazon.com/images/G/32/social_share/amazon_logo._CB633266945_.png',
        discount: discount,
        discountSource: discount > 0 ? 'amazon_page' : 'unknown',
        originalPrice: origStr,
        currentPrice: curStr,
        isFreeShipping: true,
        dealType: discount >= 30 ? "Oferta Relâmpago" : "Oferta do Dia",
        timeLeft: "",
        couponBadge: d.couponBadge || null,
        rating: Number(d.rating) || 0,
        reviewCount: Number(d.reviewCount) || 0,
        salesInfo: d.salesInfo || '',
        category: catInfo.category,
        subcategory: catInfo.subcategory,
        icon: catInfo.icon,
        recurringCategory: recurringCat
      });
    }

    const finalDeals = selectVerifiedDeals(formattedDeals);
    saveAmazonReport(amazonDealsPath, finalDeals);
    console.log(`\n✅ Sucesso! Scraping da Amazon concluído.`);
    console.log(`📊 Total de ${finalDeals.length} ofertas com desconto comprovado salvas em amazon_deals_report.json.`);

  } catch (err) {
    console.warn("⚠️ Falha durante execução do Puppeteer na Amazon:", err.message);
    try { await browser.close(); } catch (e) {}
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  findBrowserPath,
  parsePromotionText,
  selectVerifiedDeals,
  saveAmazonReport
};
