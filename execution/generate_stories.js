const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

function getMarketplaceBrand(platform) {
  const brands = {
    mercado_livre: {
      className: 'mercado-livre',
      name: 'Mercado Livre',
      cta: 'Compre no Mercado Livre'
    },
    shopee: {
      className: 'shopee',
      name: 'Shopee',
      cta: 'Compre na Shopee'
    },
    amazon: {
      className: 'amazon',
      name: 'Amazon',
      cta: 'Compre na Amazon'
    }
  };
  return brands[platform] || brands.mercado_livre;
}

function getStoryVariant(value) {
  return ['a', 'b', 'c', 'd'].includes(String(value).toLowerCase())
    ? String(value).toLowerCase()
    : 'd';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

// Encontra o executável do navegador Chrome ou Edge no Windows
function findBrowserPath() {
  const possiblePaths = [
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.USERPROFILE || 'C:\\Users\\danie', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux
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

async function main() {
  console.log("Gerador Automático de Imagens para Stories");
  console.log("-----------------------------------------");

  // Permite passar um arquivo JSON alternativo por argumento na linha de comando (útil para o dashboard)
  const customJsonArg = process.argv[2];
  const dealsJsonPath = customJsonArg 
    ? path.resolve(customJsonArg)
    : path.join(__dirname, '..', 'mercado_livre_deals_report.json');

  if (!fs.existsSync(dealsJsonPath)) {
    console.error(`Erro: Arquivo de dados ${dealsJsonPath} não encontrado. Execute o scraper primeiro.`);
    process.exit(1);
  }

  const templatePath = path.join(__dirname, 'story_template.html');
  if (!fs.existsSync(templatePath)) {
    console.error(`Erro: Template HTML ${path.basename(templatePath)} não encontrado.`);
    process.exit(1);
  }

  // Cria pasta output para as imagens se não existir
  const storiesDir = process.env.STORIES_OUTPUT_DIR
    ? path.resolve(process.env.STORIES_OUTPUT_DIR)
    : path.join(__dirname, '..', 'stories');
  if (!fs.existsSync(storiesDir)) {
    fs.mkdirSync(storiesDir, { recursive: true });
    console.log(`Diretório criado: ${storiesDir}`);
  }

  // Localizar navegador
  const browserPath = findBrowserPath();
  if (!browserPath) {
    console.error("Erro: Não foi possível localizar o Google Chrome ou Microsoft Edge no sistema.");
    process.exit(1);
  }
  console.log(`Navegador localizado em: ${browserPath}`);

  // Ler dados
  const rawData = fs.readFileSync(dealsJsonPath, 'utf-8');
  const data = JSON.parse(rawData);
  const deals = data.deals || [];
  
  if (deals.length === 0) {
    console.log("Nenhuma oferta encontrada no JSON para processar.");
    return;
  }

  console.log(`Iniciando a geração de ${deals.length} stories...`);

  // Ler o template HTML
  const templateHtml = fs.readFileSync(templatePath, 'utf-8');

  // Inicializar o browser
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    let failureCount = 0;
    for (let i = 0; i < deals.length; i++) {
      if (
        process.env.STORY_CANCEL_FILE &&
        fs.existsSync(process.env.STORY_CANCEL_FILE)
      ) {
        console.log('Geração interrompida após o Story atual.');
        break;
      }
      const deal = deals[i];
      const rank = i + 1;
      const cleanTitle = deal.title.replace(/"/g, '&quot;');
      const marketplace = getMarketplaceBrand(deal.platform);
      const storyVariant = getStoryVariant(deal.storyVariant);
      
      console.log(`[${rank}/${deals.length}] Processando: "${deal.title.substring(0, 40)}..."`);

      // Informações do cupom selecionado (direto, candidato ou global)
      let selectedCoupon = deal.coupon || deal.couponCandidates?.[0] || data.selectedCoupon;
      const hasCoupon = !!selectedCoupon;
      const couponClass = hasCoupon ? 'show-coupon' : 'hide-coupon';
      
      let rawCode = '';
      let rawRules = '';
      let couponPrice = '';
      let couponSavings = '';

      if (hasCoupon) {
        if (typeof selectedCoupon === 'string') {
          rawCode = selectedCoupon;
        } else if (typeof selectedCoupon === 'object') {
          rawCode = selectedCoupon.code || selectedCoupon.couponCode || '';
          rawRules = selectedCoupon.rules || selectedCoupon.couponRules || '';
          couponPrice = selectedCoupon.priceWithCoupon || '';
          couponSavings = selectedCoupon.savings || '';
        }

        // Se o preço com cupom não foi pré-calculado, calcula com base no desconto ou estimativa do cupom
        if (!couponPrice && deal.currentPrice) {
          const currentPriceNum = parseFloat(String(deal.currentPrice).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0;
          const percentMatch = (rawRules || '').match(/(\d+)\s*%/);
          const percent = percentMatch ? Number(percentMatch[1]) : 15;
          if (currentPriceNum > 0) {
            const priceWithCouponNum = currentPriceNum * (1 - (percent / 100));
            couponPrice = `R$ ${priceWithCouponNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            couponSavings = `R$ ${(currentPriceNum - priceWithCouponNum).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
        }
      }

      const couponCode = escapeHtml(rawCode);
      const couponRules = escapeHtml(rawRules);
      couponPrice = escapeHtml(couponPrice);
      couponSavings = escapeHtml(couponSavings);

      let shippingClass = 'hide-shipping';
      let shippingText = '';

      if (deal.isFull) {
        shippingClass = 'badge-full';
        shippingText = '⚡ ENVIO RÁPIDO FULL';
      } else if (deal.isFreeShipping) {
        shippingClass = 'badge-free-shipping';
        shippingText = '🚚 FRETE GRÁTIS';
      }

      let dealTypeClass = 'ribbon-camp';
      let themeClass = 'theme-camp';
      if (deal.dealType === 'Oferta Relâmpago') {
        dealTypeClass = 'ribbon-lightning';
        themeClass = 'theme-lightning';
      } else if (deal.dealType === 'Oferta do Dia') {
        dealTypeClass = 'ribbon-day';
        themeClass = 'theme-day';
      }

      const hasTimeLeft = !!deal.timeLeft;
      const timeLeftClass = hasTimeLeft ? 'show-time' : 'hide-time';
      const timeLeftText = hasTimeLeft ? deal.timeLeft : '';

      // Prepara os dados substituindo no template
      let htmlContent = templateHtml
        .replace(/\{\{TITLE\}\}/g, cleanTitle)
        .replace(/\{\{IMAGE_URL\}\}/g, deal.image)
        .replace(/\{\{ORIGINAL_PRICE\}\}/g, deal.originalPrice)
        .replace(/\{\{CURRENT_PRICE\}\}/g, deal.currentPrice)
        .replace(/\{\{DISCOUNT\}\}/g, deal.discount)
        .replace(/\{\{RATING\}\}/g, deal.rating ? deal.rating.toFixed(1) : 'N/A')
        .replace(/\{\{SALES_INFO\}\}/g, deal.salesInfo || '')
        .replace(/\{\{COUPON_BANNER_CLASS\}\}/g, couponClass)
        .replace(/\{\{COUPON_CODE\}\}/g, couponCode)
        .replace(/\{\{COUPON_RULES\}\}/g, couponRules)
        .replace(/\{\{COUPON_PRICE\}\}/g, couponPrice)
        .replace(/\{\{COUPON_SAVINGS\}\}/g, couponSavings)
        .replace(/\{\{SHIPPING_CLASS\}\}/g, shippingClass)
        .replace(/\{\{SHIPPING_TEXT\}\}/g, shippingText)
        .replace(/\{\{DEAL_TYPE\}\}/g, deal.dealType || 'Ofertas de Campanha')
        .replace(/\{\{DEAL_TYPE_CLASS\}\}/g, dealTypeClass)
        .replace(/\{\{TIME_LEFT_CLASS\}\}/g, timeLeftClass)
        .replace(/\{\{TIME_LEFT_TEXT\}\}/g, timeLeftText)
        .replace(/\{\{MARKETPLACE_CLASS\}\}/g, marketplace.className)
        .replace(/\{\{MARKETPLACE_NAME\}\}/g, marketplace.name)
        .replace(/\{\{MARKETPLACE_CTA\}\}/g, marketplace.cta)
        .replace(/\{\{STORY_VARIANT\}\}/g, storyVariant)
        .replace(/\{\{THEME_CLASS\}\}/g, themeClass);

      // Cria um arquivo HTML temporário local
      const tempHtmlPath = path.join(
        __dirname,
        `temp_story_${process.pid}_${rank}.html`
      );
      fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

      // Abre a página no browser
      const page = await browser.newPage();
      const filename = `story_${rank}_discount_${deal.discount}.jpg`;
      const outputImagePath = path.join(storiesDir, filename);
      await page.setViewport({
        width: 1080,
        height: 1920,
        deviceScaleFactor: 1 // Escala padrão
      });

      // Abre o arquivo local no Chrome
      const fileUrl = `file:///${tempHtmlPath.replace(/\\/g, '/')}`;
      
      try {
        // Carrega o arquivo e espera o DOM ser carregado para evitar travar em conexões de fontes/imagens pendentes
        await page.goto(fileUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 10000 
        });

        // Timeout de segurança para fontes e imagens carregarem completamente
        await page.waitForFunction(() => {
          const image = document.querySelector('.product-image');
          return image?.complete && image.naturalWidth > 0;
        }, { timeout: 15000 });
        await page.evaluate(async () => {
          await document.querySelector('.product-image').decode();
          await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });

        // Salva o screenshot na pasta stories
        await page.screenshot({
          path: outputImagePath,
          type: 'jpeg',
          quality: 90
        });

        console.log(`  ✓ Story salvo em: ${path.join('stories', filename)}`);
      } catch (pageErr) {
        failureCount++;
        console.error(`  ❌ Erro ao capturar imagem do Story para o item ${rank}: ${pageErr.message}`);
      } finally {
        await page.close();
      }

      // Deleta arquivo HTML temporário
      try {
        fs.unlinkSync(tempHtmlPath);
      } catch (e) {
        // Ignora erros de deleção
      }

    }

    if (failureCount > 0) {
      throw new Error(`${failureCount} Story(s) nao foram gerados.`);
    }

    console.log("-----------------------------------------");
    console.log("Geração concluída com sucesso!");
    console.log(`Confira suas imagens na pasta: ${storiesDir}`);
  } catch (err) {
    console.error(`Erro durante a geração das imagens: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

if (require.main === module) main();

module.exports = {
  getMarketplaceBrand,
  getStoryVariant
};
