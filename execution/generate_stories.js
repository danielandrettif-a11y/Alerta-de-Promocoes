const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

// Encontra o executável do navegador Chrome ou Edge no Windows
function findBrowserPath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.USERPROFILE || 'C:\\Users\\danie', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
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
  const storiesDir = path.join(__dirname, '..', 'stories');
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
    for (let i = 0; i < deals.length; i++) {
      const deal = deals[i];
      const rank = i + 1;
      const cleanTitle = deal.title.replace(/"/g, '&quot;');
      
      console.log(`[${rank}/${deals.length}] Processando: "${deal.title.substring(0, 40)}..."`);

      // Informações do cupom selecionado
      const hasCoupon = !!data.selectedCoupon;
      const couponClass = hasCoupon ? 'show-coupon' : 'hide-coupon';
      const couponCode = hasCoupon ? data.selectedCoupon.code : '';
      const couponRules = hasCoupon ? data.selectedCoupon.rules : '';

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
        .replace(/\{\{SHIPPING_CLASS\}\}/g, shippingClass)
        .replace(/\{\{SHIPPING_TEXT\}\}/g, shippingText)
        .replace(/\{\{DEAL_TYPE\}\}/g, deal.dealType || 'Ofertas de Campanha')
        .replace(/\{\{DEAL_TYPE_CLASS\}\}/g, dealTypeClass)
        .replace(/\{\{TIME_LEFT_CLASS\}\}/g, timeLeftClass)
        .replace(/\{\{TIME_LEFT_TEXT\}\}/g, timeLeftText)
        .replace(/\{\{THEME_CLASS\}\}/g, themeClass);

      // Cria um arquivo HTML temporário local
      const tempHtmlPath = path.join(__dirname, `temp_story_${rank}.html`);
      fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

      // Abre a página no browser
      const page = await browser.newPage();
      await page.setViewport({
        width: 1080,
        height: 1920,
        deviceScaleFactor: 1 // Escala padrão
      });

      // Abre o arquivo local no Chrome
      const fileUrl = `file:///${tempHtmlPath.replace(/\\/g, '/')}`;
      
      // Carrega o arquivo e espera recursos terminarem de carregar
      await page.goto(fileUrl, { waitUntil: 'networkidle0' });

      // Timeout de segurança para fontes e imagens carregarem completamente
      await new Promise(r => setTimeout(r, 1200));

      // Salva o screenshot na pasta stories
      const filename = `story_${rank}_discount_${deal.discount}.jpg`;
      const outputImagePath = path.join(storiesDir, filename);

      await page.screenshot({
        path: outputImagePath,
        type: 'jpeg',
        quality: 90
      });

      await page.close();

      // Deleta arquivo HTML temporário
      try {
        fs.unlinkSync(tempHtmlPath);
      } catch (e) {
        // Ignora erros de deleção
      }

      console.log(`  ✓ Story salvo em: ${path.join('stories', filename)}`);
    }

    console.log("-----------------------------------------");
    console.log("Geração concluída com sucesso!");
    console.log(`Confira suas imagens na pasta: ${storiesDir}`);
  } catch (err) {
    console.error(`Erro durante a geração das imagens: ${err.message}`);
  } finally {
    await browser.close();
  }
}

main();
