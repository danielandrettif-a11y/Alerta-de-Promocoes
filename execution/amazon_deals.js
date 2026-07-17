/**
 * execution/amazon_deals.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Determinística)
 *
 * Scraper de ofertas da Amazon Brasil com Puppeteer.
 * Roda headless: false localmente (para visualização e evasão de bots)
 * e headless: true na VPS (Linux). Em caso de falha/bloqueio,
 * salva uma lista vazia [] para deixar a tela limpa no painel.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

function findBrowserPath() {
  const possiblePaths = [
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

  for (const executablePath of possiblePaths) {
    if (fs.existsSync(executablePath)) {
      return executablePath;
    }
  }
  return null;
}

function cleanPriceString(priceStr) {
  if (!priceStr) return '';
  // Limpa textos indesejados como "Preço da Oferta:" ou repetições
  let clean = priceStr.replace(/Preço\s+da\s+Oferta:\s*/i, '').trim();
  
  // Extrai o primeiro padrão de R$ X.XXX,XX
  const match = clean.match(/R\$\s*[0-9.,]+/i);
  if (match) {
    return match[0].replace(/\s+/g, ' ');
  }
  return clean;
}

async function main() {
  console.log("Amazon Deals Scraper (Stealth & Custom Headless)");
  console.log("-----------------------------------------------");

  const browserPath = findBrowserPath();
  if (!browserPath) {
    console.warn("⚠️ Navegador Chrome/Edge não localizado. Salvando relatório vazio.");
    writeEmptyReport();
    process.exit(0);
  }

  const amazonDealsPath = path.join(__dirname, '..', 'amazon_deals_report.json');
  
  // Roda Headless: true em Linux (VPS) e Headless: false no Windows (Local do usuário)
  const isLinux = process.platform === 'linux';
  const isHeadless = isLinux;

  console.log(`Configuração: Headless = ${isHeadless} | Plataforma = ${process.platform}`);

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
        '--window-size=1280,1024',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });
  } catch (err) {
    console.error("❌ Falha ao abrir navegador:", err.message);
    writeEmptyReport();
    process.exit(0);
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });

    // Remove WebDriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    console.log("Navegando para a página de ofertas da Amazon Brasil...");
    await page.goto('https://www.amazon.com.br/deals', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log("Aguardando carregamento inicial das ofertas...");
    await new Promise(r => setTimeout(r, 6000));

    // Rola a página para baixo de forma incremental para garantir o lazy loading de imagens
    console.log("Rolando a página...");
    for (let scroll = 0; scroll < 3; scroll++) {
      await page.evaluate(() => window.scrollBy(0, 700));
      await new Promise(r => setTimeout(r, 1500));
    }

    console.log("Extraindo ofertas do DOM...");
    const extractedDeals = await page.evaluate(() => {
      const dealsList = [];
      
      // Busca cards de produtos individuais (elementos com data-test-index dentro do grid)
      const cardContainers = document.querySelectorAll('[data-testid="discount-asin-grid"] [data-test-index], [class*="DesktopDiscountAsinGrid-module__root"] [data-test-index]');
      
      cardContainers.forEach(container => {
        const linkEl = container.querySelector('a');
        if (!linkEl) return;
        
        let link = linkEl.href;
        if (link.startsWith('javascript:')) return; // Descarta botões JavaScript da UI

        // Imagem do produto
        const imgEl = container.querySelector('img');
        const image = imgEl ? imgEl.src : '';
        
        // Título do produto: Prioriza o 'alt' da imagem do produto (que contém a descrição completa na Amazon)
        let title = imgEl && imgEl.alt ? imgEl.alt.trim() : '';
        
        // Fallback de título se a imagem não tiver alt
        if (!title || title.toLowerCase().includes('oferta') || title.length < 5) {
          const titleEl = container.querySelector('[class*="DealCard-module__titleText"], [class*="ProductCard-module__title"], h4');
          if (titleEl) title = titleEl.textContent.trim();
        }

        // Se mesmo assim o título for vazio, ignora
        if (!title) return;

        // Desconto
        const discountEl = container.querySelector('[class*="Badge-module__badgeText"], [class*="DiscountBadge"], .a-badge-text');
        let discountText = discountEl ? discountEl.textContent.trim() : '';
        
        let discount = 0;
        const discountMatch = discountText.match(/([0-9]+)%\s*off/i);
        if (discountMatch) {
          discount = parseInt(discountMatch[1], 10);
        } else {
          // Fallback de calculo de desconto
          discount = 15; // padrão para exibir
        }

        // Preço atual (Promo)
        const currentPriceEl = container.querySelector('[class*="Price-module__priceText"], [class*="PriceText"], .a-price');
        let currentPrice = currentPriceEl ? currentPriceEl.textContent.trim() : '';

        // Preço original (Riscado)
        const originalPriceEl = container.querySelector('[class*="Price-module__strikeThrough"], .a-text-strike');
        let originalPrice = originalPriceEl ? originalPriceEl.textContent.trim() : '';

        // Filtros e validações mínimas
        if (!currentPrice) return;

        dealsList.push({
          title: title,
          link: link,
          image: image,
          discount: discount,
          originalPrice: originalPrice,
          currentPrice: currentPrice,
          isFreeShipping: true, // Amazon Prime oferece frete grátis na maioria das ofertas
          dealType: discount >= 30 ? "Oferta Relâmpago" : "Oferta do Dia",
          timeLeft: ""
        });
      });
      
      return dealsList;
    });

    await browser.close();

    // Filtra e formata os preços no Node.js
    const formattedDeals = extractedDeals.map(d => {
      let cur = cleanPriceString(d.currentPrice);
      let orig = cleanPriceString(d.originalPrice);
      
      // Se não tiver preço original, simula com base no desconto
      if (!orig && cur) {
        const numericCur = parseFloat(cur.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
        if (!isNaN(numericCur) && d.discount > 0) {
          const numericOrig = numericCur / (1 - (d.discount / 100));
          orig = `R$ ${numericOrig.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
      }

      return {
        ...d,
        currentPrice: cur,
        originalPrice: orig || cur // fallback se der erro
      };
    }).filter(d => d.currentPrice && d.title);

    if (formattedDeals.length > 0) {
      formattedDeals.sort((a, b) => b.discount - a.discount);
      const finalDeals = formattedDeals.slice(0, 30);
      
      const reportData = {
        generatedAt: new Date().toISOString(),
        deals: finalDeals
      };
      
      fs.writeFileSync(amazonDealsPath, JSON.stringify(reportData, null, 2), 'utf-8');
      console.log(`✅ Sucesso! Scraping da Amazon concluído. ${finalDeals.length} ofertas salvas.`);
    } else {
      console.log("⚠️ Scraper não conseguiu extrair nenhuma oferta válida da Amazon. Salvando relatório vazio.");
      writeEmptyReport();
    }

  } catch (err) {
    console.warn("⚠️ Falha durante a navegação do Puppeteer na Amazon. Salvando relatório vazio.");
    console.error("Erro:", err.message);
    try { await browser.close(); } catch (e) {}
    writeEmptyReport();
  }
}

function writeEmptyReport() {
  const amazonDealsPath = path.join(__dirname, '..', 'amazon_deals_report.json');
  const reportData = {
    generatedAt: new Date().toISOString(),
    deals: []
  };
  fs.writeFileSync(amazonDealsPath, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`✅ Concluído! Relatório da Amazon salvo como vazio (0 ofertas).`);
}

if (require.main === module) {
  main();
}
